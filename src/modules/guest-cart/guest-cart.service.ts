import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { randomBytes, createHash } from 'crypto';
import type { AddToGuestCartDto } from './dto/add-to-guest-cart.dto';
import type { UpdateGuestCartItemDto } from './dto/update-guest-cart-item.dto';

// Select fields for guest cart items
const guestCartItemSelect = {
  id: true,
  quantity: true,
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
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
} as const;

type GuestCartItemPayload = Prisma.GuestCartItemGetPayload<{ select: typeof guestCartItemSelect }>;

// Select for findCartByToken
const guestCartSelect = {
  id: true,
  expiresAt: true,
  items: { select: guestCartItemSelect, orderBy: { createdAt: 'asc' as const } },
} as const;

type GuestCartPayload = Prisma.GuestCartGetPayload<{ select: typeof guestCartSelect }>;

// Response shape
type GuestCartResponse = {
  id: string;
  items: {
    id: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    product: {
      id: string;
      name: string;
      slug: string;
      imageUrl: string | null;
    };
  }[];
  totalItems: number;
  subtotal: number;
};

// Cart with new token (returned on first add)
type GuestCartWithToken = GuestCartResponse & { token: string };

@Injectable()
export class GuestCartService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // HELPER METHODS
  // ============================================

  // Hash token for storage (one-way, for security)
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // Generate secure random token
  private generateToken(): string {
    return randomBytes(32).toString('hex'); // 64 hex chars
  }

  // Format cart response
  private formatCartResponse(cartId: string, items: GuestCartItemPayload[]): GuestCartResponse {
    let subtotal = 0;
    let totalItems = 0;

    const formattedItems = items.map((item) => {
      const unitPrice = Number(item.product.price);
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      totalItems += item.quantity;

      return {
        id: item.id,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
        product: {
          id: item.product.id,
          name: item.product.name,
          slug: item.product.slug,
          imageUrl: item.product.images[0]?.url ?? null,
        },
      };
    });

    return {
      id: cartId,
      items: formattedItems,
      totalItems,
      subtotal: Math.round(subtotal * 100) / 100,
    };
  }

  // Find cart by raw token
  private async findCartByToken(rawToken: string): Promise<GuestCartPayload | null> {
    const hashedToken = this.hashToken(rawToken);
    return this.prisma.guestCart.findUnique({
      where: { sessionToken: hashedToken },
      select: guestCartSelect,
    });
  }

  // Validate product availability
  private async validateProduct(productId: string, quantity: number): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isActive: true, stock: true, reservedStock: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new BadRequestException('Product is not available');
    }

    const availableStock = product.stock - product.reservedStock;
    if (quantity > availableStock) {
      throw new BadRequestException(`Insufficient stock. Available: ${availableStock}`);
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  async getCart(rawToken: string): Promise<GuestCartResponse> {
    const cart = await this.findCartByToken(rawToken);

    if (!cart) {
      throw new NotFoundException('Cart not found or expired');
    }

    // Check if expired
    if (cart.expiresAt < new Date()) {
      await this.prisma.guestCart.delete({ where: { id: cart.id } });
      throw new NotFoundException('Cart expired');
    }

    return this.formatCartResponse(cart.id, cart.items);
  }

  async addItem(rawToken: string | null, dto: AddToGuestCartDto): Promise<GuestCartWithToken> {
    await this.validateProduct(dto.productId, dto.quantity);

    let cart: { id: string } | null = null;
    let token = rawToken;
    let isNewCart = false;

    // Try to find existing cart
    if (rawToken) {
      const existing = await this.findCartByToken(rawToken);
      if (existing && existing.expiresAt > new Date()) {
        cart = existing;
      }
    }

    // Create new cart if needed
    if (!cart) {
      token = this.generateToken();
      isNewCart = true;

      cart = await this.prisma.guestCart.create({
        data: {
          sessionToken: this.hashToken(token),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        select: { id: true },
      });
    }

    // Check if product already in cart
    const existingItem = await this.prisma.guestCartItem.findUnique({
      where: {
        guestCartId_productId: {
          guestCartId: cart.id,
          productId: dto.productId,
        },
      },
      select: { id: true, quantity: true },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + dto.quantity;
      await this.validateProduct(dto.productId, newQuantity);

      await this.prisma.guestCartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await this.prisma.guestCartItem.create({
        data: {
          guestCartId: cart.id,
          productId: dto.productId,
          quantity: dto.quantity,
        },
      });
    }

    // Fetch updated cart
    const updatedCart = await this.prisma.guestCart.findUnique({
      where: { id: cart.id },
      select: {
        id: true,
        items: { select: guestCartItemSelect, orderBy: { createdAt: 'asc' } },
      },
    });

    return {
      ...this.formatCartResponse(updatedCart!.id, updatedCart!.items),
      token: isNewCart ? token! : rawToken!,
    };
  }

  async updateItem(
    rawToken: string,
    itemId: string,
    dto: UpdateGuestCartItemDto,
  ): Promise<GuestCartResponse> {
    const cart = await this.findCartByToken(rawToken);

    if (!cart || cart.expiresAt < new Date()) {
      throw new NotFoundException('Cart not found or expired');
    }

    const item = await this.prisma.guestCartItem.findUnique({
      where: { id: itemId },
      select: { id: true, guestCartId: true, productId: true },
    });

    if (!item || item.guestCartId !== cart.id) {
      throw new NotFoundException('Cart item not found');
    }

    await this.validateProduct(item.productId, dto.quantity);

    await this.prisma.guestCartItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
    });

    return this.getCart(rawToken);
  }

  async removeItem(rawToken: string, itemId: string): Promise<GuestCartResponse> {
    const cart = await this.findCartByToken(rawToken);

    if (!cart || cart.expiresAt < new Date()) {
      throw new NotFoundException('Cart not found or expired');
    }

    const item = await this.prisma.guestCartItem.findUnique({
      where: { id: itemId },
      select: { id: true, guestCartId: true },
    });

    if (!item || item.guestCartId !== cart.id) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.guestCartItem.delete({ where: { id: itemId } });

    return this.getCart(rawToken);
  }

  async clearCart(rawToken: string): Promise<GuestCartResponse> {
    const cart = await this.findCartByToken(rawToken);

    if (!cart || cart.expiresAt < new Date()) {
      throw new NotFoundException('Cart not found or expired');
    }

    await this.prisma.guestCartItem.deleteMany({
      where: { guestCartId: cart.id },
    });

    return { id: cart.id, items: [], totalItems: 0, subtotal: 0 };
  }

  async mergeIntoUserCart(rawToken: string, userId: string): Promise<void> {
    const guestCart = await this.findCartByToken(rawToken);

    if (!guestCart) {
      return; // No guest cart to merge
    }

    // Ignore and clean up expired guest carts
    if (guestCart.expiresAt < new Date()) {
      await this.prisma.guestCart.delete({ where: { id: guestCart.id } });
      return;
    }

    if (guestCart.items.length === 0) {
      return; // Nothing to merge
    }

    // Get or create user cart
    let userCart = await this.prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!userCart) {
      userCart = await this.prisma.cart.create({
        data: { userId },
        select: { id: true },
      });
    }

    // Preload existing cart items to avoid N+1 queries
    const activeGuestItems = guestCart.items.filter((item) => item.product.isActive);
    const guestProductIds = activeGuestItems.map((item) => item.product.id);

    const existingItems =
      guestProductIds.length > 0
        ? await this.prisma.cartItem.findMany({
            where: {
              cartId: userCart.id,
              productId: { in: guestProductIds },
            },
            select: { id: true, quantity: true, productId: true },
          })
        : [];

    const existingItemsByProductId = new Map(
      existingItems.map((item) => [item.productId, { id: item.id, quantity: item.quantity }]),
    );

    // Separate items into updates (existing in user cart) and creates (new items)
    const updates: Promise<unknown>[] = [];
    const toCreate: { cartId: string; productId: string; quantity: number }[] = [];

    for (const guestItem of activeGuestItems) {
      const existingItem = existingItemsByProductId.get(guestItem.product.id);
      const availableStock = guestItem.product.stock - guestItem.product.reservedStock;

      if (existingItem) {
        const newQuantity = Math.min(existingItem.quantity + guestItem.quantity, availableStock);
        updates.push(
          this.prisma.cartItem.update({
            where: { id: existingItem.id },
            data: { quantity: newQuantity },
          }),
        );
      } else {
        const quantity = Math.min(guestItem.quantity, availableStock);
        if (quantity > 0) {
          toCreate.push({ cartId: userCart.id, productId: guestItem.product.id, quantity });
        }
      }
    }

    // Execute all writes in parallel: updates target different rows, createMany batches inserts
    await Promise.all([
      ...updates,
      toCreate.length > 0 ? this.prisma.cartItem.createMany({ data: toCreate }) : Promise.resolve(),
    ]);

    // Delete guest cart after merge
    await this.prisma.guestCart.delete({ where: { id: guestCart.id } });
  }
}
