import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Prisma,
  OrderStatus,
  StockMovementType,
  RefundRequestStatus,
} from '../../generated/prisma/client';
import {
  getPrismaPageArgs,
  paginate,
  type PaginatedResult,
} from '../../common/utils/pagination.util';
import { ensureUniqueOrderNumber } from '../../common/utils/order-number.util';
import { CouponsService } from '../coupons/coupons.service';
import { ShippingService } from '../shipping/shipping.service';
import { TaxService } from '../tax/tax.service';
import { InventoryService } from '../inventory/inventory.service';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import type { OrderQuery } from './dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotificationEvents,
  OrderCreatedEvent,
  OrderStatusChangedEvent,
  RefundRequestCreatedEvent,
} from '../notifications/events';

// ============================================
// SELECT OBJECTS & TYPES
// ============================================

// What we return for each order item
const orderItemSelect = {
  id: true,
  productId: true,
  productName: true,
  productSku: true,
  productImageUrl: true,
  quantity: true,
  unitPrice: true,
  lineTotal: true,
} as const;

// What we return for an order (list view - no items)
const orderListSelect = {
  id: true,
  orderNumber: true,
  status: true,
  subtotal: true,
  discountAmount: true,
  couponCode: true,
  shippingCost: true,
  tax: true,
  total: true,
  createdAt: true,
  updatedAt: true,
} as const;

// What we return for a single order (detail view - with items and address)
const orderDetailSelect = {
  ...orderListSelect,
  userId: true,
  shippingFullName: true,
  shippingPhone: true,
  shippingStreet: true,
  shippingCity: true,
  shippingRegion: true,
  shippingPostalCode: true,
  shippingCountry: true,
  shippingMethodName: true,
  notes: true,
  adminNotes: true,
  items: { select: orderItemSelect },
} as const;

type OrderListPayload = Prisma.OrderGetPayload<{ select: typeof orderListSelect }>;
type OrderDetailPayload = Prisma.OrderGetPayload<{ select: typeof orderDetailSelect }>;

// ============================================
// VALID STATUS TRANSITIONS
// ============================================

// Defines which statuses an order can move TO from each status
const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  PROCESSING: [OrderStatus.SHIPPED],
  SHIPPED: [OrderStatus.DELIVERED],
  DELIVERED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly couponsService: CouponsService,
    private readonly shippingService: ShippingService,
    private readonly taxService: TaxService,
    private readonly inventoryService: InventoryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ============================================
  // CUSTOMER METHODS
  // ============================================

  async checkout(userId: string, dto: CreateOrderDto): Promise<OrderDetailPayload> {
    // Fetch user for notification event
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 1. Fetch the user's cart with product details
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                price: true,
                sku: true,
                stock: true,
                reservedStock: true,
                isActive: true,
                images: {
                  select: { url: true },
                  orderBy: { sortOrder: 'asc' as const },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // 2. Validate all products are still active and in stock
    for (const item of cart.items) {
      if (!item.product.isActive) {
        throw new BadRequestException(`Product "${item.product.name}" is no longer available`);
      }

      const availableStock = item.product.stock - item.product.reservedStock;
      if (item.quantity > availableStock) {
        throw new BadRequestException(
          `Insufficient stock for "${item.product.name}". Available: ${availableStock}`,
        );
      }
    }

    // 3. Fetch and validate the shipping address (must belong to this user)
    const address = await this.prisma.address.findUnique({
      where: { id: dto.shippingAddressId },
    });

    if (!address || address.userId !== userId) {
      throw new NotFoundException('Shipping address not found');
    }

    // 4. Calculate totals from server-side prices (never trust client prices)
    const subtotal = cart.items.reduce((sum, item) => {
      return sum + Number(item.product.price) * item.quantity;
    }, 0);

    // 5. Validate and calculate coupon discount (if provided)
    let couponId: string | null = null;
    let couponCode: string | null = null;
    let discountAmount = 0;

    if (dto.couponCode) {
      const couponResult = await this.couponsService.validateCoupon(
        dto.couponCode,
        userId,
        subtotal,
      );
      couponId = couponResult.couponId;
      couponCode = dto.couponCode;
      discountAmount = couponResult.discountAmount;
    }

    // 6. Calculate shipping cost based on chosen method and subtotal
    const { shippingCost, methodName: shippingMethodName } =
      await this.shippingService.calculateShipping(dto.shippingMethodId, subtotal);

    // 7. Calculate tax using default rate
    const { tax } = await this.taxService.calculateTax(subtotal);

    const total = subtotal - discountAmount + shippingCost + tax;

    // 8. Generate a unique order number (retry on collision)
    const orderNumber = await ensureUniqueOrderNumber((num) =>
      this.prisma.order.findUnique({ where: { orderNumber: num }, select: { id: true } }),
    );

    // 9. Create order, order items, reserve stock, and clear cart — all atomically
    const order = await this.prisma.$transaction(async (tx) => {
      // Create the order with address snapshot
      const created = await tx.order.create({
        data: {
          orderNumber,
          userId,
          status: OrderStatus.PENDING,
          shippingFullName: address.fullName,
          shippingPhone: address.phone,
          shippingStreet: address.street,
          shippingCity: address.city,
          shippingRegion: address.region,
          shippingPostalCode: address.postalCode,
          shippingCountry: address.country,
          subtotal,
          discountAmount,
          couponCode,
          shippingCost,
          shippingMethodName,
          tax,
          total,
          notes: dto.notes,
          items: {
            create: cart.items.map((item) => ({
              productId: item.product.id,
              productName: item.product.name,
              productSku: item.product.sku,
              productImageUrl: item.product.images[0]?.url ?? null,
              quantity: item.quantity,
              unitPrice: item.product.price,
              lineTotal: Number(item.product.price) * item.quantity,
            })),
          },
        },
        select: orderDetailSelect,
      });

      // Batch-fetch product stock to avoid N+1 queries inside the transaction
      const productIds = cart.items.map((item) => item.product.id);
      const stockMap = await this.batchFetchProductStock(tx, productIds);

      // Reserve stock for each item inside the same transaction
      for (const item of cart.items) {
        const product = stockMap.get(item.product.id);

        if (!product) {
          throw new BadRequestException(`Product "${item.product.name}" is no longer available`);
        }

        const availableStock = product.stock - product.reservedStock;
        if (item.quantity > availableStock) {
          throw new BadRequestException(
            `Insufficient stock for "${item.product.name}". Available: ${availableStock}`,
          );
        }

        await tx.product.update({
          where: { id: item.product.id },
          data: { reservedStock: { increment: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.product.id,
            type: StockMovementType.RESERVATION,
            quantity: -item.quantity,
            reason: `Reserved for order ${orderNumber}`,
            stockBefore: product.stock,
            stockAfter: product.stock,
            userId,
          },
        });
      }

      // Record coupon usage (inside transaction for atomicity)
      if (couponId) {
        await tx.couponUsage.create({
          data: {
            couponId,
            userId,
            orderId: created.id,
            discountAmount,
          },
        });

        // Increment the denormalized usage counter
        await tx.coupon.update({
          where: { id: couponId },
          data: { usageCount: { increment: 1 } },
        });
      }

      // Clear the cart
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return created;
    });

    // Emit event for order notification (non-blocking)
    this.eventEmitter.emit(
      NotificationEvents.ORDER_CREATED,
      new OrderCreatedEvent(
        userId,
        user.email,
        user.firstName,
        order.id,
        order.orderNumber,
        order.total.toString(),
      ),
    );

    return order;
  }

  async getMyOrders(userId: string, query: OrderQuery): Promise<PaginatedResult<OrderListPayload>> {
    const { skip, take } = getPrismaPageArgs(query);

    const where: Prisma.OrderWhereInput = { userId };

    // Apply optional status filter
    if (query.status) {
      where.status = query.status as OrderStatus;
    }

    // Apply optional date range filters
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) {
        where.createdAt.gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        where.createdAt.lte = new Date(query.toDate);
      }
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: orderListSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginate(orders, total, query);
  }

  async getOrderById(orderId: string, userId?: string): Promise<OrderDetailPayload> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: orderDetailSelect,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // If userId is provided, verify ownership (customer access)
    if (userId && order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async cancelOrder(orderId: string, userId: string): Promise<OrderDetailPayload> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        orderNumber: true,
        items: { select: { productId: true, quantity: true } },
        user: { select: { email: true, firstName: true } },
      },
    });

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    // Only PENDING and CONFIRMED orders can be cancelled by customers
    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException(
        `Cannot cancel order with status "${order.status}". Only PENDING or CONFIRMED orders can be cancelled`,
      );
    }

    // Cancel order and release reserved stock atomically
    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
        select: orderDetailSelect,
      });

      // Batch-fetch product stock to avoid N+1 queries
      const productIds = order.items
        .filter((item) => item.productId !== null)
        .map((item) => item.productId as string);
      const stockMap = await this.batchFetchProductStock(tx, productIds);

      // Restore stock for each item based on order status
      for (const item of order.items) {
        if (!item.productId) {
          continue;
        }

        const product = stockMap.get(item.productId);

        if (!product) {
          continue;
        }

        if (order.status === OrderStatus.PENDING) {
          // PENDING: stock was only reserved, release the reservation
          await tx.product.update({
            where: { id: item.productId },
            data: { reservedStock: { decrement: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: StockMovementType.RELEASE,
              quantity: item.quantity,
              reason: `Released from cancelled order ${order.orderNumber}`,
              stockBefore: product.stock,
              stockAfter: product.stock,
              userId,
            },
          });
        } else {
          // CONFIRMED: stock was already deducted by confirmSale, add it back
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: StockMovementType.RETURN,
              quantity: item.quantity,
              reason: `Returned from cancelled order ${order.orderNumber}`,
              stockBefore: product.stock,
              stockAfter: product.stock + item.quantity,
              userId,
            },
          });
        }
      }

      return cancelled;
    });

    // Emit event for cancellation notification
    this.eventEmitter.emit(
      NotificationEvents.ORDER_STATUS_CHANGED,
      new OrderStatusChangedEvent(
        userId,
        order.user.email,
        order.user.firstName,
        orderId,
        order.orderNumber,
        'CANCELLED',
      ),
    );

    return updated;
  }

  async requestRefund(
    orderId: string,
    userId: string,
    reason: string,
  ): Promise<{
    id: string;
    orderId: string;
    reason: string;
    status: RefundRequestStatus;
    createdAt: Date;
  }> {
    // 1. Fetch the order and verify ownership
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        orderNumber: true,
        refundRequest: { select: { id: true } }, // Check if request already exists
        user: { select: { email: true, firstName: true } }, // For event notification
      },
    });

    // Return 404 for non-existent or non-owned orders (security: don't leak order existence)
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    // 2. Validate order status - only DELIVERED or CONFIRMED orders can request refund
    if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException(
        `Cannot request refund for order with status "${order.status}". Only DELIVERED or CONFIRMED orders are eligible.`,
      );
    }

    // 3. Check if a refund request already exists (unique constraint in DB, but check early for better UX)
    if (order.refundRequest) {
      throw new BadRequestException('A refund request already exists for this order');
    }

    // 4. Create the refund request (catch unique constraint for race condition)
    let refundRequest;
    try {
      refundRequest = await this.prisma.refundRequest.create({
        data: {
          orderId,
          userId,
          reason,
          status: RefundRequestStatus.PENDING,
        },
        select: {
          id: true,
          orderId: true,
          reason: true,
          status: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A refund request already exists for this order');
      }
      throw error;
    }

    // Emit event for customer confirmation + admin notification
    this.eventEmitter.emit(
      NotificationEvents.REFUND_REQUEST_CREATED,
      new RefundRequestCreatedEvent(
        userId,
        order.user.email,
        order.user.firstName,
        order.id,
        order.orderNumber,
        reason,
      ),
    );

    return refundRequest;
  }

  async getRefundRequest(
    orderId: string,
    userId: string,
  ): Promise<{
    id: string;
    orderId: string;
    reason: string;
    status: RefundRequestStatus;
    adminNotes: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
  }> {
    // Fetch order first to verify ownership
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });

    // Return 404 for non-existent or non-owned orders
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    // Fetch the refund request
    const refundRequest = await this.prisma.refundRequest.findUnique({
      where: { orderId },
      select: {
        id: true,
        orderId: true,
        reason: true,
        status: true,
        adminNotes: true,
        reviewedAt: true,
        createdAt: true,
      },
    });

    if (!refundRequest) {
      throw new NotFoundException('Refund request not found for this order');
    }

    return refundRequest;
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async getAllOrders(query: OrderQuery): Promise<PaginatedResult<OrderListPayload>> {
    const { skip, take } = getPrismaPageArgs(query);

    const where: Prisma.OrderWhereInput = {};

    if (query.status) {
      where.status = query.status as OrderStatus;
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) {
        where.createdAt.gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        where.createdAt.lte = new Date(query.toDate);
      }
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: orderListSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginate(orders, total, query);
  }

  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto): Promise<OrderDetailPayload> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        orderNumber: true,
        items: { select: { productId: true, quantity: true } },
        user: { select: { email: true, firstName: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Validate the status transition
    const newStatus = dto.status as OrderStatus;
    const allowed = validTransitions[order.status];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from "${order.status}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
      );
    }

    // Update status (+ cancellation stock ops) in a transaction.
    // CONFIRMED stock confirmation is delegated to InventoryService after commit.
    const updated = await this.prisma.$transaction(async (tx) => {
      // If admin cancels, restore stock based on current order status
      if (newStatus === OrderStatus.CANCELLED) {
        const productIds = order.items
          .filter((item) => item.productId !== null)
          .map((item) => item.productId as string);
        const stockMap = await this.batchFetchProductStock(tx, productIds);

        for (const item of order.items) {
          if (!item.productId) {
            continue;
          }

          const product = stockMap.get(item.productId);

          if (!product) {
            continue;
          }

          if (order.status === OrderStatus.PENDING) {
            // PENDING: release reservation
            await tx.product.update({
              where: { id: item.productId },
              data: { reservedStock: { decrement: item.quantity } },
            });

            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                type: StockMovementType.RELEASE,
                quantity: item.quantity,
                reason: `Released from cancelled order ${order.orderNumber}`,
                stockBefore: product.stock,
                stockAfter: product.stock,
              },
            });
          } else if (order.status === OrderStatus.CONFIRMED) {
            // CONFIRMED: stock was already deducted, add it back
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });

            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                type: StockMovementType.RETURN,
                quantity: item.quantity,
                reason: `Returned from cancelled order ${order.orderNumber}`,
                stockBefore: product.stock,
                stockAfter: product.stock + item.quantity,
              },
            });
          }
        }
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          adminNotes: dto.adminNotes,
        },
        select: orderDetailSelect,
      });
    });

    // Delegate stock confirmation to InventoryService (emits LOW_STOCK + cache events)
    // Stock is already reserved, so confirmSale converts reservations to actual sales.
    // Wrapped in try-catch per item so a single product failure doesn't block the rest.
    if (newStatus === OrderStatus.CONFIRMED) {
      for (const item of order.items) {
        if (!item.productId) {
          continue;
        }

        try {
          await this.inventoryService.confirmSale(
            item.productId,
            item.quantity,
            undefined,
            `Order ${order.orderNumber} confirmed`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to confirm sale for product ${item.productId} (qty: ${item.quantity}) on order ${order.orderNumber}. Stock remains reserved and needs manual reconciliation.`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    }

    // Emit after stock ops so cache invalidation reflects the final state
    this.eventEmitter.emit(
      NotificationEvents.ORDER_STATUS_CHANGED,
      new OrderStatusChangedEvent(
        order.userId,
        order.user.email,
        order.user.firstName,
        orderId,
        order.orderNumber,
        newStatus,
      ),
    );

    return updated;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async batchFetchProductStock(
    tx: Prisma.TransactionClient,
    productIds: string[],
  ): Promise<Map<string, { stock: number; reservedStock: number }>> {
    if (productIds.length === 0) {
      return new Map();
    }

    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true, reservedStock: true },
    });

    return new Map(products.map((p) => [p.id, { stock: p.stock, reservedStock: p.reservedStock }]));
  }
}
