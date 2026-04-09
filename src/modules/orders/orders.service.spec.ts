import { Test, type TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { createMockPrismaClient, resetMockPrismaClient } from '@test/mocks/prisma.mock';
import { createMockEventEmitter } from '@test/mocks/common.mock';
import { PrismaService } from '../../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { ShippingService } from '../shipping/shipping.service';
import { TaxService } from '../tax/tax.service';
import { InventoryService } from '../inventory/inventory.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { NotificationEvents } from '../notifications/events';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let eventEmitter: ReturnType<typeof createMockEventEmitter>;
  let couponsService: { validateCoupon: jest.Mock };
  let shippingService: { calculateShipping: jest.Mock };
  let taxService: { calculateTax: jest.Mock };
  let inventoryService: { confirmSale: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    eventEmitter = createMockEventEmitter();
    couponsService = { validateCoupon: jest.fn() };
    shippingService = { calculateShipping: jest.fn() };
    taxService = { calculateTax: jest.fn() };
    inventoryService = { confirmSale: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: CouponsService, useValue: couponsService },
        { provide: ShippingService, useValue: shippingService },
        { provide: TaxService, useValue: taxService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetMockPrismaClient(prisma);
  });

  const userId = 'cluser123456789012345678';
  const orderId = 'clorder12345678901234567';
  const addressId = 'claddr12345678901234567';
  const productId = 'clprod123456789012345678';

  const mockUser = {
    email: 'test@example.com',
    firstName: 'John',
  };

  const mockAddress = {
    id: addressId,
    userId,
    fullName: 'John Doe',
    phone: '+48123456789',
    street: '123 Main St',
    city: 'Warsaw',
    region: 'Masovia',
    postalCode: '00-001',
    country: 'PL',
  };

  const mockCartItem = {
    id: 'clitem123456789012345678',
    quantity: 2,
    product: {
      id: productId,
      name: 'Test Product',
      price: 29.99,
      sku: 'TP-001',
      stock: 100,
      reservedStock: 10,
      isActive: true,
      images: [{ url: 'https://example.com/image.jpg' }],
    },
  };

  const mockCart = {
    id: 'clcart123456789012345678',
    items: [mockCartItem],
  };

  const mockOrderDetail = {
    id: orderId,
    orderNumber: 'ORD-20260208-AB12',
    userId,
    status: 'PENDING',
    subtotal: 59.98,
    discountAmount: 0,
    couponCode: null,
    shippingCost: 10,
    tax: 5.5,
    total: 75.48,
    shippingFullName: 'John Doe',
    shippingPhone: '+48123456789',
    shippingStreet: '123 Main St',
    shippingCity: 'Warsaw',
    shippingRegion: 'Masovia',
    shippingPostalCode: '00-001',
    shippingCountry: 'PL',
    shippingMethodName: 'Standard',
    notes: null,
    adminNotes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    items: [
      {
        id: 'cloi1234567890123456789',
        productId,
        productName: 'Test Product',
        productSku: 'TP-001',
        productImageUrl: 'https://example.com/image.jpg',
        quantity: 2,
        unitPrice: 29.99,
        lineTotal: 59.98,
      },
    ],
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkout', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.cart.findUnique.mockResolvedValue(mockCart);
      prisma.address.findUnique.mockResolvedValue(mockAddress);
      prisma.order.findUnique.mockResolvedValue(null); // ensureUniqueOrderNumber
      shippingService.calculateShipping.mockResolvedValue({
        shippingCost: 10,
        methodName: 'Standard',
      });
      taxService.calculateTax.mockResolvedValue({ tax: 5.5 });

      // Transaction mock — execute the callback with the prisma mock
      prisma.order.create.mockResolvedValue(mockOrderDetail);
      prisma.product.findMany.mockResolvedValue([{ id: productId, stock: 100, reservedStock: 10 }]);
      prisma.product.update.mockResolvedValue({});
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.cartItem.deleteMany.mockResolvedValue({});
    });

    it('should create order from cart successfully', async () => {
      const result = await service.checkout(userId, {
        shippingAddressId: addressId,
        shippingMethodId: 'method1',
      });

      expect(result).toEqual(mockOrderDetail);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationEvents.ORDER_CREATED,
        expect.objectContaining({
          userId,
          orderId: mockOrderDetail.id,
        }),
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.checkout(userId, {
          shippingAddressId: addressId,
          shippingMethodId: 'method1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when cart is empty', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: 'cart1', items: [] });

      await expect(
        service.checkout(userId, {
          shippingAddressId: addressId,
          shippingMethodId: 'method1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when cart does not exist', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      await expect(
        service.checkout(userId, {
          shippingAddressId: addressId,
          shippingMethodId: 'method1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when product is inactive', async () => {
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart1',
        items: [
          {
            ...mockCartItem,
            product: { ...mockCartItem.product, isActive: false },
          },
        ],
      });

      await expect(
        service.checkout(userId, {
          shippingAddressId: addressId,
          shippingMethodId: 'method1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when insufficient stock', async () => {
      prisma.cart.findUnique.mockResolvedValue({
        id: 'cart1',
        items: [
          {
            ...mockCartItem,
            quantity: 100,
            product: { ...mockCartItem.product, stock: 50, reservedStock: 0 },
          },
        ],
      });

      await expect(
        service.checkout(userId, {
          shippingAddressId: addressId,
          shippingMethodId: 'method1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when shipping address not found', async () => {
      prisma.address.findUnique.mockResolvedValue(null);

      await expect(
        service.checkout(userId, {
          shippingAddressId: 'nonexistent',
          shippingMethodId: 'method1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when address belongs to another user', async () => {
      prisma.address.findUnique.mockResolvedValue({ ...mockAddress, userId: 'other-user' });

      await expect(
        service.checkout(userId, {
          shippingAddressId: addressId,
          shippingMethodId: 'method1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should apply coupon discount when coupon code provided', async () => {
      couponsService.validateCoupon.mockResolvedValue({
        couponId: 'coupon1',
        discountAmount: 5.0,
      });

      await service.checkout(userId, {
        shippingAddressId: addressId,
        shippingMethodId: 'method1',
        couponCode: 'SAVE5',
      });

      expect(couponsService.validateCoupon).toHaveBeenCalledWith('SAVE5', userId, 59.98);
    });
  });

  describe('getMyOrders', () => {
    it('should return paginated orders for user', async () => {
      const orders = [{ ...mockOrderDetail, items: undefined }];
      prisma.order.findMany.mockResolvedValue(orders);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.getMyOrders(userId, { page: 1, limit: 10, sortOrder: 'desc' });

      expect(result.data).toEqual(orders);
      expect(result.meta.total).toBe(1);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should apply status filter', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.getMyOrders(userId, {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        status: 'PENDING',
      });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, status: 'PENDING' },
        }),
      );
    });

    it('should apply date range filters', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.getMyOrders(userId, {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
      });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            createdAt: {
              gte: new Date('2026-01-01'),
              lte: new Date('2026-01-31'),
            },
          }),
        }),
      );
    });
  });

  describe('getOrderById', () => {
    it('should return order detail', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrderDetail);

      const result = await service.getOrderById(orderId);

      expect(result).toEqual(mockOrderDetail);
    });

    it('should throw NotFoundException when order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.getOrderById('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should verify ownership when userId is provided', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrderDetail);

      const result = await service.getOrderById(orderId, userId);

      expect(result).toEqual(mockOrderDetail);
    });

    it('should throw NotFoundException when order belongs to another user', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrderDetail);

      await expect(service.getOrderById(orderId, 'other-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelOrder', () => {
    const mockPendingOrder = {
      id: orderId,
      userId,
      status: 'PENDING',
      orderNumber: 'ORD-20260208-AB12',
      items: [{ productId, quantity: 2 }],
      user: mockUser,
    };

    it('should cancel pending order and release reserved stock', async () => {
      prisma.order.findUnique.mockResolvedValue(mockPendingOrder);
      prisma.order.update.mockResolvedValue({ ...mockOrderDetail, status: 'CANCELLED' });
      prisma.product.findMany.mockResolvedValue([{ id: productId, stock: 100, reservedStock: 12 }]);
      prisma.product.update.mockResolvedValue({});
      prisma.stockMovement.create.mockResolvedValue({});

      const result = await service.cancelOrder(orderId, userId);

      expect(result.status).toBe('CANCELLED');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationEvents.ORDER_STATUS_CHANGED,
        expect.objectContaining({ orderId, newStatus: 'CANCELLED' }),
      );
    });

    it('should cancel confirmed order and return stock', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockPendingOrder,
        status: 'CONFIRMED',
      });
      prisma.order.update.mockResolvedValue({ ...mockOrderDetail, status: 'CANCELLED' });
      prisma.product.findMany.mockResolvedValue([{ id: productId, stock: 98, reservedStock: 0 }]);
      prisma.product.update.mockResolvedValue({});
      prisma.stockMovement.create.mockResolvedValue({});

      await service.cancelOrder(orderId, userId);

      // For CONFIRMED orders, stock should be incremented (returned)
      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { stock: { increment: 2 } },
        }),
      );
    });

    it('should throw NotFoundException when order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.cancelOrder('nonexistent', userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when order belongs to another user', async () => {
      prisma.order.findUnique.mockResolvedValue(mockPendingOrder);

      await expect(service.cancelOrder(orderId, 'other-user')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when order is not cancellable', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockPendingOrder,
        status: 'SHIPPED',
      });

      await expect(service.cancelOrder(orderId, userId)).rejects.toThrow(BadRequestException);
    });

    it('should skip products that have been deleted', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockPendingOrder,
        items: [{ productId: null, quantity: 2 }],
      });
      prisma.order.update.mockResolvedValue({ ...mockOrderDetail, status: 'CANCELLED' });

      await service.cancelOrder(orderId, userId);

      // Null productIds filtered out, no batch fetch needed
      expect(prisma.product.findMany).not.toHaveBeenCalled();
      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('requestRefund', () => {
    const mockDeliveredOrder = {
      id: orderId,
      userId,
      status: 'DELIVERED',
      orderNumber: 'ORD-20260208-AB12',
      refundRequest: null,
      user: mockUser,
    };

    const mockRefundRequest = {
      id: 'clrefund1234567890123456',
      orderId,
      reason: 'Product defective',
      status: 'PENDING',
      createdAt: new Date(),
    };

    it('should create refund request for delivered order', async () => {
      prisma.order.findUnique.mockResolvedValue(mockDeliveredOrder);
      prisma.refundRequest.create.mockResolvedValue(mockRefundRequest);

      const result = await service.requestRefund(orderId, userId, 'Product defective');

      expect(result).toEqual(mockRefundRequest);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationEvents.REFUND_REQUEST_CREATED,
        expect.objectContaining({ userId, orderId }),
      );
    });

    it('should create refund request for confirmed order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockDeliveredOrder,
        status: 'CONFIRMED',
      });
      prisma.refundRequest.create.mockResolvedValue(mockRefundRequest);

      const result = await service.requestRefund(orderId, userId, 'Changed my mind');

      expect(result).toEqual(mockRefundRequest);
    });

    it('should throw NotFoundException when order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.requestRefund('nonexistent', userId, 'reason')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when order belongs to another user', async () => {
      prisma.order.findUnique.mockResolvedValue(mockDeliveredOrder);

      await expect(service.requestRefund(orderId, 'other-user', 'reason')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-eligible status', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockDeliveredOrder,
        status: 'PENDING',
      });

      await expect(service.requestRefund(orderId, userId, 'reason')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when refund request already exists', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockDeliveredOrder,
        refundRequest: { id: 'existing' },
      });

      await expect(service.requestRefund(orderId, userId, 'reason')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle P2002 race condition on duplicate create', async () => {
      prisma.order.findUnique.mockResolvedValue(mockDeliveredOrder);
      prisma.refundRequest.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint violation', {
          code: 'P2002',
          clientVersion: '5.0.0',
        }),
      );

      await expect(service.requestRefund(orderId, userId, 'reason')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getRefundRequest', () => {
    it('should return refund request for order', async () => {
      prisma.order.findUnique.mockResolvedValue({ userId });
      const refundRequest = {
        id: 'clrefund1234567890123456',
        orderId,
        reason: 'Defective',
        status: 'PENDING',
        adminNotes: null,
        reviewedAt: null,
        createdAt: new Date(),
      };
      prisma.refundRequest.findUnique.mockResolvedValue(refundRequest);

      const result = await service.getRefundRequest(orderId, userId);

      expect(result).toEqual(refundRequest);
    });

    it('should throw NotFoundException when order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.getRefundRequest('nonexistent', userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when order belongs to another user', async () => {
      prisma.order.findUnique.mockResolvedValue({ userId: 'other-user' });

      await expect(service.getRefundRequest(orderId, userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when no refund request exists', async () => {
      prisma.order.findUnique.mockResolvedValue({ userId });
      prisma.refundRequest.findUnique.mockResolvedValue(null);

      await expect(service.getRefundRequest(orderId, userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllOrders', () => {
    it('should return paginated orders without filters', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      const result = await service.getAllOrders({ page: 1, limit: 10, sortOrder: 'desc' });

      expect(result.data).toEqual([]);
      expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('should apply status and date filters', async () => {
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.getAllOrders({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        status: 'SHIPPED',
        fromDate: '2026-01-01',
      });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'SHIPPED',
            createdAt: { gte: new Date('2026-01-01') },
          }),
        }),
      );
    });
  });

  describe('updateOrderStatus', () => {
    const mockOrder = {
      id: orderId,
      userId,
      status: 'PENDING',
      orderNumber: 'ORD-20260208-AB12',
      items: [{ productId, quantity: 2 }],
      user: mockUser,
    };

    it('should update order status with valid transition', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'PROCESSING',
      });
      prisma.order.update.mockResolvedValue({ ...mockOrderDetail, status: 'SHIPPED' });

      const result = await service.updateOrderStatus(orderId, { status: 'SHIPPED' });

      expect(result.status).toBe('SHIPPED');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationEvents.ORDER_STATUS_CHANGED,
        expect.objectContaining({ orderId, newStatus: 'SHIPPED' }),
      );
    });

    it('should throw NotFoundException when order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOrderStatus('nonexistent', { status: 'CONFIRMED' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid transition', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);

      await expect(service.updateOrderStatus(orderId, { status: 'DELIVERED' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when transitioning from terminal state', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'DELIVERED',
      });

      await expect(service.updateOrderStatus(orderId, { status: 'CANCELLED' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should delegate stock confirmation to InventoryService when confirming', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.order.update.mockResolvedValue({ ...mockOrderDetail, status: 'CONFIRMED' });

      await service.updateOrderStatus(orderId, { status: 'CONFIRMED' });

      expect(inventoryService.confirmSale).toHaveBeenCalledWith(
        productId,
        2,
        undefined,
        `Order ${mockOrder.orderNumber} confirmed`,
      );
    });

    it('should release stock when admin cancels pending order', async () => {
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.product.findMany.mockResolvedValue([{ id: productId, stock: 100, reservedStock: 12 }]);
      prisma.product.update.mockResolvedValue({});
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.order.update.mockResolvedValue({ ...mockOrderDetail, status: 'CANCELLED' });

      await service.updateOrderStatus(orderId, { status: 'CANCELLED' });

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { reservedStock: { decrement: 2 } },
        }),
      );
    });

    it('should return stock when admin cancels confirmed order', async () => {
      prisma.order.findUnique.mockResolvedValue({
        ...mockOrder,
        status: 'CONFIRMED',
      });
      prisma.product.findMany.mockResolvedValue([{ id: productId, stock: 98, reservedStock: 0 }]);
      prisma.product.update.mockResolvedValue({});
      prisma.stockMovement.create.mockResolvedValue({});
      prisma.order.update.mockResolvedValue({ ...mockOrderDetail, status: 'CANCELLED' });

      await service.updateOrderStatus(orderId, { status: 'CANCELLED' });

      expect(prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { stock: { increment: 2 } },
        }),
      );
    });
  });
});
