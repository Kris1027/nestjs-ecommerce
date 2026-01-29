import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockMovementType } from '../../generated/prisma/client';

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

// Response types
type StockInfo = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  reservedStock: number;
  lowStockThreshold: number;
  availableStock: number;
  isLowStock: boolean;
};

type StockMovement = {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  stockBefore: number;
  stockAfter: number;
  userId: string | null;
  createdAt: Date;
};

type StockOperationResult = {
  product: StockInfo;
  movement: StockMovement;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getMovementHistory(productId: string, limit = 50): Promise<StockMovement[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.stockMovement.findMany({
      where: { productId },
      select: movementSelect,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
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
    return this.prisma.$transaction(async (tx) => {
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
  }

  async getLowStockProducts(): Promise<StockInfo[]> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: stockInfoSelect,
    });

    return products
      .filter((p) => {
        const available = p.stock - p.reservedStock;
        return available <= p.lowStockThreshold;
      })
      .map((p) => {
        const availableStock = p.stock - p.reservedStock;
        return {
          ...p,
          availableStock,
          isLowStock: true,
        };
      });
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

    return this.prisma.$transaction(async (tx) => {
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
  }

  async releaseStock(
    productId: string,
    quantity: number,
    userId?: string,
  ): Promise<StockOperationResult> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    return this.prisma.$transaction(async (tx) => {
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
  }

  async confirmSale(
    productId: string,
    quantity: number,
    userId?: string,
  ): Promise<StockOperationResult> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    return this.prisma.$transaction(async (tx) => {
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
            reason: 'Order confirmed',
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
  }
}
