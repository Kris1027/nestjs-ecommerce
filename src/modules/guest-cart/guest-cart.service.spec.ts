import { Test, type TestingModule } from '@nestjs/testing';
import { GuestCartService } from './guest-cart.service';
import { createMockPrismaClient, resetMockPrismaClient } from '@test/mocks/prisma.mock';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';

describe('GuestCartService', () => {
  let service: GuestCartService;
  let prisma: ReturnType<typeof createMockPrismaClient>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GuestCartService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<GuestCartService>(GuestCartService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetMockPrismaClient(prisma);
  });

  const cartId = 'clgcart12345678901234567';
  const itemId = 'clgitem12345678901234567';
  const productId = 'clprod123456789012345678';
  const rawToken = 'a'.repeat(64);
  const hashedToken = createHash('sha256').update(rawToken).digest('hex');

  const mockProduct = {
    id: productId,
    name: 'Test Product',
    slug: 'test-product',
    price: 29.99,
    stock: 100,
    reservedStock: 10,
    isActive: true,
    images: [{ url: 'https://example.com/image.jpg' }],
  };

  const mockCartItem = {
    id: itemId,
    quantity: 2,
    product: mockProduct,
  };

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const pastDate = new Date(Date.now() - 1000);

  const mockGuestCart = {
    id: cartId,
    expiresAt: futureDate,
    items: [mockCartItem],
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCart', () => {
    it('should return formatted guest cart', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(mockGuestCart);

      const result = await service.getCart(rawToken);

      expect(result.id).toBe(cartId);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].unitPrice).toBe(29.99);
      expect(result.items[0].lineTotal).toBe(59.98);
      expect(result.totalItems).toBe(2);
      expect(result.subtotal).toBe(59.98);
      expect(prisma.guestCart.findUnique).toHaveBeenCalledWith({
        where: { sessionToken: hashedToken },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException when cart not found', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(null);

      await expect(service.getCart(rawToken)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException and delete expired cart', async () => {
      prisma.guestCart.findUnique.mockResolvedValue({
        ...mockGuestCart,
        expiresAt: pastDate,
      });
      prisma.guestCart.delete.mockResolvedValue({});

      await expect(service.getCart(rawToken)).rejects.toThrow(NotFoundException);
      expect(prisma.guestCart.delete).toHaveBeenCalledWith({ where: { id: cartId } });
    });
  });

  describe('addItem', () => {
    it('should create new cart and add item when no token provided', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        isActive: true,
        stock: 100,
        reservedStock: 10,
      });
      prisma.guestCart.create.mockResolvedValue({ id: cartId });
      prisma.guestCartItem.findUnique.mockResolvedValue(null);
      prisma.guestCartItem.create.mockResolvedValue({});
      prisma.guestCart.findUnique.mockResolvedValue({
        id: cartId,
        items: [mockCartItem],
      });

      const result = await service.addItem(null, { productId, quantity: 2 });

      expect(result.token).toBeDefined();
      expect(result.items).toHaveLength(1);
      expect(prisma.guestCart.create).toHaveBeenCalled();
    });

    it('should add item to existing cart', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        isActive: true,
        stock: 100,
        reservedStock: 10,
      });
      prisma.guestCart.findUnique
        .mockResolvedValueOnce(mockGuestCart) // findCartByToken
        .mockResolvedValueOnce({ id: cartId, items: [mockCartItem] }); // fetch updated cart
      prisma.guestCartItem.findUnique.mockResolvedValue(null);
      prisma.guestCartItem.create.mockResolvedValue({});

      const result = await service.addItem(rawToken, { productId, quantity: 1 });

      expect(result.token).toBe(rawToken);
      expect(prisma.guestCart.create).not.toHaveBeenCalled();
    });

    it('should increment quantity when product already in cart', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce({
          id: productId,
          isActive: true,
          stock: 100,
          reservedStock: 10,
        })
        .mockResolvedValueOnce({
          id: productId,
          isActive: true,
          stock: 100,
          reservedStock: 10,
        });
      prisma.guestCart.findUnique
        .mockResolvedValueOnce(mockGuestCart) // findCartByToken
        .mockResolvedValueOnce({ id: cartId, items: [mockCartItem] }); // fetch updated
      prisma.guestCartItem.findUnique.mockResolvedValue({ id: itemId, quantity: 2 });
      prisma.guestCartItem.update.mockResolvedValue({});

      await service.addItem(rawToken, { productId, quantity: 3 });

      expect(prisma.guestCartItem.update).toHaveBeenCalledWith({
        where: { id: itemId },
        data: { quantity: 5 },
      });
    });

    it('should throw NotFoundException when product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.addItem(null, { productId, quantity: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when product is inactive', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        isActive: false,
        stock: 100,
        reservedStock: 0,
      });

      await expect(service.addItem(null, { productId, quantity: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when insufficient stock', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        isActive: true,
        stock: 10,
        reservedStock: 8,
      });

      await expect(service.addItem(null, { productId, quantity: 5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create new cart when token refers to expired cart', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        isActive: true,
        stock: 100,
        reservedStock: 0,
      });
      prisma.guestCart.findUnique
        .mockResolvedValueOnce({ ...mockGuestCart, expiresAt: pastDate }) // expired
        .mockResolvedValueOnce({ id: 'new-cart', items: [mockCartItem] }); // fetch updated
      prisma.guestCart.create.mockResolvedValue({ id: 'new-cart' });
      prisma.guestCartItem.findUnique.mockResolvedValue(null);
      prisma.guestCartItem.create.mockResolvedValue({});

      const result = await service.addItem(rawToken, { productId, quantity: 1 });

      expect(prisma.guestCart.create).toHaveBeenCalled();
      expect(result.token).not.toBe(rawToken); // New token generated
    });
  });

  describe('updateItem', () => {
    it('should update cart item quantity', async () => {
      prisma.guestCart.findUnique
        .mockResolvedValueOnce(mockGuestCart) // findCartByToken
        .mockResolvedValueOnce(mockGuestCart); // getCart at end
      prisma.guestCartItem.findUnique.mockResolvedValue({
        id: itemId,
        guestCartId: cartId,
        productId,
      });
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        isActive: true,
        stock: 100,
        reservedStock: 10,
      });
      prisma.guestCartItem.update.mockResolvedValue({});

      const result = await service.updateItem(rawToken, itemId, { quantity: 5 });

      expect(prisma.guestCartItem.update).toHaveBeenCalledWith({
        where: { id: itemId },
        data: { quantity: 5 },
      });
      expect(result.id).toBe(cartId);
    });

    it('should throw NotFoundException when cart not found', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(null);

      await expect(service.updateItem(rawToken, itemId, { quantity: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when cart is expired', async () => {
      prisma.guestCart.findUnique.mockResolvedValue({
        ...mockGuestCart,
        expiresAt: pastDate,
      });

      await expect(service.updateItem(rawToken, itemId, { quantity: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when item not in this cart', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(mockGuestCart);
      prisma.guestCartItem.findUnique.mockResolvedValue({
        id: itemId,
        guestCartId: 'other-cart',
        productId,
      });

      await expect(service.updateItem(rawToken, itemId, { quantity: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeItem', () => {
    it('should remove item from cart', async () => {
      prisma.guestCart.findUnique
        .mockResolvedValueOnce(mockGuestCart) // findCartByToken
        .mockResolvedValueOnce({ ...mockGuestCart, items: [] }); // getCart at end
      prisma.guestCartItem.findUnique.mockResolvedValue({
        id: itemId,
        guestCartId: cartId,
      });
      prisma.guestCartItem.delete.mockResolvedValue({});

      await service.removeItem(rawToken, itemId);

      expect(prisma.guestCartItem.delete).toHaveBeenCalledWith({ where: { id: itemId } });
    });

    it('should throw NotFoundException when cart not found', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(null);

      await expect(service.removeItem(rawToken, itemId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when item not in this cart', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(mockGuestCart);
      prisma.guestCartItem.findUnique.mockResolvedValue({
        id: itemId,
        guestCartId: 'other-cart',
      });

      await expect(service.removeItem(rawToken, itemId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('clearCart', () => {
    it('should clear all items from cart', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(mockGuestCart);
      prisma.guestCartItem.deleteMany.mockResolvedValue({});

      const result = await service.clearCart(rawToken);

      expect(result).toEqual({ id: cartId, items: [], totalItems: 0, subtotal: 0 });
      expect(prisma.guestCartItem.deleteMany).toHaveBeenCalledWith({
        where: { guestCartId: cartId },
      });
    });

    it('should throw NotFoundException when cart not found', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(null);

      await expect(service.clearCart(rawToken)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when cart is expired', async () => {
      prisma.guestCart.findUnique.mockResolvedValue({
        ...mockGuestCart,
        expiresAt: pastDate,
      });

      await expect(service.clearCart(rawToken)).rejects.toThrow(NotFoundException);
    });
  });

  describe('mergeIntoUserCart', () => {
    const userId = 'cluser123456789012345678';

    it('should merge guest cart items into user cart', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(mockGuestCart);
      prisma.cart.findUnique.mockResolvedValue({ id: 'user-cart-id' });
      prisma.cartItem.findMany.mockResolvedValue([]); // No existing items
      prisma.cartItem.createMany.mockResolvedValue({ count: 1 });
      prisma.guestCart.delete.mockResolvedValue({});

      await service.mergeIntoUserCart(rawToken, userId);

      expect(prisma.cartItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            cartId: 'user-cart-id',
            productId,
            quantity: 2,
          }),
        ],
      });
      expect(prisma.guestCart.delete).toHaveBeenCalledWith({ where: { id: cartId } });
    });

    it('should create user cart if none exists', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(mockGuestCart);
      prisma.cart.findUnique.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue({ id: 'new-user-cart' });
      prisma.cartItem.findMany.mockResolvedValue([]);
      prisma.cartItem.createMany.mockResolvedValue({ count: 1 });
      prisma.guestCart.delete.mockResolvedValue({});

      await service.mergeIntoUserCart(rawToken, userId);

      expect(prisma.cart.create).toHaveBeenCalledWith({
        data: { userId },
        select: { id: true },
      });
    });

    it('should merge quantities when product already in user cart', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(mockGuestCart);
      prisma.cart.findUnique.mockResolvedValue({ id: 'user-cart-id' });
      prisma.cartItem.findMany.mockResolvedValue([{ id: 'existing-item', quantity: 3, productId }]);
      prisma.cartItem.update.mockResolvedValue({});
      prisma.guestCart.delete.mockResolvedValue({});

      await service.mergeIntoUserCart(rawToken, userId);

      // Should cap at available stock (100 - 10 = 90)
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'existing-item' },
        data: { quantity: 5 }, // 3 + 2 = 5
      });
    });

    it('should do nothing when no guest cart found', async () => {
      prisma.guestCart.findUnique.mockResolvedValue(null);

      await service.mergeIntoUserCart(rawToken, userId);

      expect(prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it('should delete expired guest cart without merging', async () => {
      prisma.guestCart.findUnique.mockResolvedValue({
        ...mockGuestCart,
        expiresAt: pastDate,
      });
      prisma.guestCart.delete.mockResolvedValue({});

      await service.mergeIntoUserCart(rawToken, userId);

      expect(prisma.guestCart.delete).toHaveBeenCalledWith({ where: { id: cartId } });
      expect(prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it('should skip empty guest carts', async () => {
      prisma.guestCart.findUnique.mockResolvedValue({
        ...mockGuestCart,
        items: [],
      });

      await service.mergeIntoUserCart(rawToken, userId);

      expect(prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it('should skip inactive products during merge', async () => {
      prisma.guestCart.findUnique.mockResolvedValue({
        ...mockGuestCart,
        items: [
          {
            ...mockCartItem,
            product: { ...mockProduct, isActive: false },
          },
        ],
      });
      prisma.cart.findUnique.mockResolvedValue({ id: 'user-cart-id' });
      prisma.cartItem.findMany.mockResolvedValue([]);
      prisma.guestCart.delete.mockResolvedValue({});

      await service.mergeIntoUserCart(rawToken, userId);

      expect(prisma.cartItem.createMany).not.toHaveBeenCalled();
    });
  });
});
