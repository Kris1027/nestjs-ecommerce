import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, StockMovementType } from '../../generated/prisma/client';
import {
  getPrismaPageArgs,
  paginate,
  type PaginatedResult,
} from '../../common/utils/pagination.util';
import type { PaginationQuery } from '../../common/dto/pagination.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationEvents, LowStockEvent } from '../notifications/events';
import { CacheEvents, ProductChangedEvent } from '../cache/cache.events';

// Select for stock info response
const stockInfoSelect = {
  id: true,
  name: true,
  sku: true,
  stock: true,
  reservedStock: true,
  lowStockThreshold: true,
} as const;

// Select for movement history
const movementSelect = {
  id: true,
  productId: true,
  type: true,
  quantity: true,
  reason: true,
  stockBefore: true,
  stockAfter: true,
  userId: true,
  createdAt: true,
} as const;

type StockInfoBase = Prisma.ProductGetPayload<{ select: typeof stockInfoSelect }>;
type StockMovement = Prisma.StockMovementGetPayload<{ select: typeof movementSelect }>;

type StockInfo = StockInfoBase & {
  availableStock: number;
  isLowStock: boolean;
};

type StockOperationResult = {
  product: StockInfo;
  movement: StockMovement;
};

type LowStockRow = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  reserved_stock: number;
  low_stock_threshold: number;
  available_stock: number;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ============================================
  // PUBLIC METHODS
  // ============================================

  async getStock(productId: string): Promise<StockInfo> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: stockInfoSelect,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const availableStock = product.stock - product.reservedStock;

    return {
      ...product,
      availableStock,
      isLowStock: availableStock <= product.lowStockThreshold,
    };
  }

  async getMovementHistory(
    productId: string,
    query: PaginationQuery,
  ): Promise<PaginatedResult<StockMovement>> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const { skip, take } = getPrismaPageArgs(query);
    const where = { productId };

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        select: movementSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return paginate(movements, total, query);
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async adjustStock(
    productId: string,
    quantity: number,
    type: StockMovementType,
    userId?: string,
    reason?: string,
  ): Promise<StockOperationResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, stock: true },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      const stockBefore = product.stock;
      const stockAfter = stockBefore + quantity;

      if (stockAfter < 0) {
        throw new BadRequestException(
          `Cannot reduce stock below 0. Current: ${stockBefore}, Adjustment: ${quantity}`,
        );
      }

      const [updatedProduct, movement] = await Promise.all([
        tx.product.update({
          where: { id: productId },
          data: { stock: stockAfter },
          select: stockInfoSelect,
        }),
        tx.stockMovement.create({
          data: {
            productId,
            type,
            quantity,
            reason,
            stockBefore,
            stockAfter,
            userId,
          },
          select: movementSelect,
        }),
      ]);

      const availableStock = updatedProduct.stock - updatedProduct.reservedStock;

      return {
        product: {
          ...updatedProduct,
          availableStock,
          isLowStock: availableStock <= updatedProduct.lowStockThreshold,
        },
        movement,
      };
    });

    // Check if stock dropped below threshold — emit event for admin notification
    if (result.product.isLowStock) {
      this.eventEmitter.emit(
        NotificationEvents.LOW_STOCK,
        new LowStockEvent(
          productId,
          result.product.name,
          result.product.availableStock,
          result.product.lowStockThreshold,
        ),
      );
    }

    await this.eventEmitter.emitAsync(
      CacheEvents.PRODUCT_CHANGED,
      new ProductChangedEvent(productId, 'update'),
    );

    return result;
  }

  async getAllProducts(query: PaginationQuery): Promise<PaginatedResult<StockInfo>> {
    const { skip, take } = getPrismaPageArgs(query);
    const where = { isActive: true };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: stockInfoSelect,
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);

    const mapped: StockInfo[] = products.map((p) => {
      const availableStock = p.stock - p.reservedStock;
      return {
        ...p,
        availableStock,
        isLowStock: availableStock <= p.lowStockThreshold,
      };
    });

    return paginate(mapped, total, query);
  }

  async getLowStockProducts(query: PaginationQuery): Promise<PaginatedResult<StockInfo>> {
    const { skip, take } = getPrismaPageArgs(query);

    // Use raw SQL because the low-stock condition is a computed expression
    // (stock - reserved_stock <= low_stock_threshold) that Prisma can't filter on
    const [products, countResult] = await Promise.all([
      this.prisma.$queryRaw<LowStockRow[]>`
        SELECT id, name, sku, stock, reserved_stock, low_stock_threshold,
               (stock - reserved_stock) AS available_stock
        FROM products
        WHERE is_active = true
          AND (stock - reserved_stock) <= low_stock_threshold
        ORDER BY (stock - reserved_stock) ASC, id ASC
        LIMIT ${take} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) AS count
        FROM products
        WHERE is_active = true
          AND (stock - reserved_stock) <= low_stock_threshold
      `,
    ]);

    const total = Number(countResult[0].count);

    const mapped: StockInfo[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stock: p.stock,
      reservedStock: p.reserved_stock,
      lowStockThreshold: p.low_stock_threshold,
      availableStock: p.available_stock,
      isLowStock: true,
    }));

    return paginate(mapped, total, query);
  }

  // ============================================
  // CART/ORDER METHODS (used by other modules)
  // ============================================

  async reserveStock(
    productId: string,
    quantity: number,
    userId?: string,
  ): Promise<StockOperationResult> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, stock: true, reservedStock: true },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      const availableStock = product.stock - product.reservedStock;

      if (quantity > availableStock) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${availableStock}, Requested: ${quantity}`,
        );
      }

      const [updatedProduct, movement] = await Promise.all([
        tx.product.update({
          where: { id: productId },
          data: { reservedStock: { increment: quantity } },
          select: stockInfoSelect,
        }),
        tx.stockMovement.create({
          data: {
            productId,
            type: StockMovementType.RESERVATION,
            quantity: -quantity,
            reason: 'Stock reserved for cart',
            stockBefore: product.stock,
            stockAfter: product.stock,
            userId,
          },
          select: movementSelect,
        }),
      ]);

      const newAvailableStock = updatedProduct.stock - updatedProduct.reservedStock;
      return {
        product: {
          ...updatedProduct,
          availableStock: newAvailableStock,
          isLowStock: newAvailableStock <= updatedProduct.lowStockThreshold,
        },
        movement,
      };
    });

    await this.eventEmitter.emitAsync(
      CacheEvents.PRODUCT_CHANGED,
      new ProductChangedEvent(productId, 'update'),
    );

    return result;
  }

  async releaseStock(
    productId: string,
    quantity: number,
    userId?: string,
  ): Promise<StockOperationResult> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, stock: true, reservedStock: true },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      if (quantity > product.reservedStock) {
        throw new BadRequestException(
          `Cannot release ${quantity}. Only ${product.reservedStock} reserved.`,
        );
      }

      const [updatedProduct, movement] = await Promise.all([
        tx.product.update({
          where: { id: productId },
          data: { reservedStock: { decrement: quantity } },
          select: stockInfoSelect,
        }),
        tx.stockMovement.create({
          data: {
            productId,
            type: StockMovementType.RELEASE,
            quantity: quantity,
            reason: 'Stock released from cart',
            stockBefore: product.stock,
            stockAfter: product.stock,
            userId,
          },
          select: movementSelect,
        }),
      ]);

      const newAvailableStock = updatedProduct.stock - updatedProduct.reservedStock;
      return {
        product: {
          ...updatedProduct,
          availableStock: newAvailableStock,
          isLowStock: newAvailableStock <= updatedProduct.lowStockThreshold,
        },
        movement,
      };
    });

    await this.eventEmitter.emitAsync(
      CacheEvents.PRODUCT_CHANGED,
      new ProductChangedEvent(productId, 'update'),
    );

    return result;
  }

  async confirmSale(
    productId: string,
    quantity: number,
    userId?: string,
    reason?: string,
  ): Promise<StockOperationResult> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, stock: true, reservedStock: true },
      });

      if (!product) {
        throw new NotFoundException('Product not found');
      }

      if (quantity > product.reservedStock) {
        throw new BadRequestException(
          `Cannot confirm sale of ${quantity}. Only ${product.reservedStock} reserved.`,
        );
      }

      const stockBefore = product.stock;
      const stockAfter = stockBefore - quantity;

      const [updatedProduct, movement] = await Promise.all([
        tx.product.update({
          where: { id: productId },
          data: {
            stock: { decrement: quantity },
            reservedStock: { decrement: quantity },
          },
          select: stockInfoSelect,
        }),
        tx.stockMovement.create({
          data: {
            productId,
            type: StockMovementType.SALE,
            quantity: -quantity,
            reason: reason ?? 'Order confirmed',
            stockBefore,
            stockAfter,
            userId,
          },
          select: movementSelect,
        }),
      ]);

      const newAvailableStock = updatedProduct.stock - updatedProduct.reservedStock;
      return {
        product: {
          ...updatedProduct,
          availableStock: newAvailableStock,
          isLowStock: newAvailableStock <= updatedProduct.lowStockThreshold,
        },
        movement,
      };
    });

    if (result.product.isLowStock) {
      this.eventEmitter.emit(
        NotificationEvents.LOW_STOCK,
        new LowStockEvent(
          productId,
          result.product.name,
          result.product.availableStock,
          result.product.lowStockThreshold,
        ),
      );
    }

    await this.eventEmitter.emitAsync(
      CacheEvents.PRODUCT_CHANGED,
      new ProductChangedEvent(productId, 'update'),
    );

    return result;
  }
}
