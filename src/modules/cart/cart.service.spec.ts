import { Test, type TestingModule } from '@nestjs/testing';
import { CartService } from './cart.service';
import { createMockPrismaClient, resetMockPrismaClient } from '@test/mocks/prisma.mock';
import { PrismaService } from '../../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('CartService', () => {
  let service: CartService;
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let couponsService: { validateCoupon: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    couponsService = {
      validateCoupon: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: prisma },
        { provide: CouponsService, useValue: couponsService },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetMockPrismaClient(prisma);
  });

  const userId = 'cluser123456789012345678';
  const cartId = 'clcart123456789012345678';
  const productId = 'clprod123456789012345678';
  const itemId = 'clitem123456789012345678';

  const mockCartItem = {
    id: itemId,
    quantity: 2,
    product: {
      id: productId,
      name: 'Test Product',
      slug: 'test-product',
      price: 29.99,
      stock: 100,
      reservedStock: 10,
      isActive: true,
      images: [{ url: 'https://example.com/image.jpg', alt: 'Test' }],
    },
  };

  const mockCart = {
    id: cartId,
    couponCode: null,
    items: [mockCartItem],
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCart', () => {
    it('should return empty cart when no cart exists', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      const result = await service.getCart(userId);

      expect(result).toEqual({
        id: '',
        items: [],
        totalItems: 0,
        subtotal: 0,
        couponCode: null,
        discountAmount: 0,
        estimatedTotal: 0,
      });
    });

    it('should return formatted cart with items', async () => {
      prisma.cart.findUnique.mockResolvedValue(mockCart);

      const result = await service.getCart(userId);

      expect(result.id).toBe(cartId);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.quantity).toBe(2);
      expect(result.items[0]!.unitPrice).toBe(29.99);
      expect(result.items[0]!.lineTotal).toBe(59.98);
      expect(result.totalItems).toBe(2);
      expect(result.subtotal).toBe(59.98);
      expect(result.couponCode).toBeNull();
      expect(result.discountAmount).toBe(0);
      expect(result.estimatedTotal).toBe(59.98);
    });

    it('should validate and apply coupon discount when cart has coupon', async () => {
      prisma.cart.findUnique.mockResolvedValue({
        ...mockCart,
        couponCode: 'SAVE10',
      });
      couponsService.validateCoupon.mockResolvedValue({ discountAmount: 5.99 });

      const result = await service.getCart(userId);

      expect(result.couponCode).toBe('SAVE10');
      expect(result.discountAmount).toBe(5.99);
      expect(result.estimatedTotal).toBe(53.99);
      expect(couponsService.validateCoupon).toHaveBeenCalledWith('SAVE10', userId, 59.98);
    });

    it('should clear invalid coupon from cart', async () => {
      prisma.cart.findUnique.mockResolvedValue({
        ...mockCart,
        couponCode: 'EXPIRED',
      });
      couponsService.validateCoupon.mockRejectedValue(new BadRequestException('Coupon expired'));
      prisma.cart.update.mockResolvedValue({});

      const result = await service.getCart(userId);

      expect(result.couponCode).toBeNull();
      expect(result.discountAmount).toBe(0);
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: cartId },
        data: { couponCode: null },
      });
    });
  });

  describe('addItem', () => {
    it('should add new item to cart', async () => {
      // validateProduct
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        isActive: true,
        stock: 100,
        reservedStock: 10,
      });
      // getOrCreateCart
      prisma.cart.findUnique
        .mockResolvedValueOnce({ id: cartId }) // getOrCreateCart
        .mockResolvedValueOnce(mockCart); // getCart at end
      // existing item check
      prisma.cartItem.findUnique.mockResolvedValue(null);
      prisma.cartItem.create.mockResolvedValue({});

      const result = await service.addItem(userId, { productId, quantity: 1 });

      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId, productId, quantity: 1 },
      });
      expect(result.id).toBe(cartId);
    });

    it('should increment quantity when product already in cart', async () => {
      // validateProduct (called twice — initial + re-validate total)
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
      // getOrCreateCart
      prisma.cart.findUnique
        .mockResolvedValueOnce({ id: cartId }) // getOrCreateCart
        .mockResolvedValueOnce(mockCart); // getCart at end
      // existing item found
      prisma.cartItem.findUnique.mockResolvedValue({ id: itemId, quantity: 2 });
      prisma.cartItem.update.mockResolvedValue({});

      await service.addItem(userId, { productId, quantity: 3 });

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: itemId },
        data: { quantity: 5 },
      });
    });

    it('should throw NotFoundException when product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.addItem(userId, { productId, quantity: 1 })).rejects.toThrow(
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

      await expect(service.addItem(userId, { productId, quantity: 1 })).rejects.toThrow(
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

      await expect(service.addItem(userId, { productId, quantity: 5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create cart if user has no cart', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        isActive: true,
        stock: 100,
        reservedStock: 0,
      });
      prisma.cart.findUnique
        .mockResolvedValueOnce(null) // getOrCreateCart — no existing
        .mockResolvedValueOnce(mockCart); // getCart at end
      prisma.cart.create.mockResolvedValue({ id: cartId });
      prisma.cartItem.findUnique.mockResolvedValue(null);
      prisma.cartItem.create.mockResolvedValue({});

      await service.addItem(userId, { productId, quantity: 1 });

      expect(prisma.cart.create).toHaveBeenCalledWith({
        data: { userId },
        select: { id: true },
      });
    });
  });

  describe('updateItem', () => {
    it('should update cart item quantity', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({
        id: itemId,
        productId,
        cart: { userId },
      });
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        isActive: true,
        stock: 100,
        reservedStock: 10,
      });
      prisma.cartItem.update.mockResolvedValue({});
      prisma.cart.findUnique.mockResolvedValue(mockCart);

      const result = await service.updateItem(userId, itemId, { quantity: 5 });

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: itemId },
        data: { quantity: 5 },
      });
      expect(result.id).toBe(cartId);
    });

    it('should throw NotFoundException when item does not exist', async () => {
      prisma.cartItem.findUnique.mockResolvedValue(null);

      await expect(service.updateItem(userId, 'nonexistent', { quantity: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when item belongs to another user', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({
        id: itemId,
        productId,
        cart: { userId: 'other-user-id' },
      });

      await expect(service.updateItem(userId, itemId, { quantity: 1 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when insufficient stock for new quantity', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({
        id: itemId,
        productId,
        cart: { userId },
      });
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        isActive: true,
        stock: 10,
        reservedStock: 8,
      });

      await expect(service.updateItem(userId, itemId, { quantity: 5 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('removeItem', () => {
    it('should remove item from cart', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({
        id: itemId,
        cart: { userId },
      });
      prisma.cartItem.delete.mockResolvedValue({});
      prisma.cart.findUnique.mockResolvedValue({ ...mockCart, items: [] });

      await service.removeItem(userId, itemId);

      expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: itemId } });
    });

    it('should throw NotFoundException when item does not exist', async () => {
      prisma.cartItem.findUnique.mockResolvedValue(null);

      await expect(service.removeItem(userId, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when item belongs to another user', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({
        id: itemId,
        cart: { userId: 'other-user-id' },
      });

      await expect(service.removeItem(userId, itemId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('clearCart', () => {
    it('should clear all items and coupon from cart', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: cartId });

      const result = await service.clearCart(userId);

      expect(result).toEqual({
        id: cartId,
        items: [],
        totalItems: 0,
        subtotal: 0,
        couponCode: null,
        discountAmount: 0,
        estimatedTotal: 0,
      });
    });

    it('should return empty cart when no cart exists', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      const result = await service.clearCart(userId);

      expect(result).toEqual({
        id: '',
        items: [],
        totalItems: 0,
        subtotal: 0,
        couponCode: null,
        discountAmount: 0,
        estimatedTotal: 0,
      });
      expect(prisma.cartItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('applyCoupon', () => {
    it('should apply valid coupon to cart', async () => {
      prisma.cart.findUnique
        .mockResolvedValueOnce({
          id: cartId,
          items: [{ quantity: 2, product: { price: 29.99 } }],
        })
        .mockResolvedValueOnce({ ...mockCart, couponCode: 'SAVE10' });
      couponsService.validateCoupon.mockResolvedValue({
        discountAmount: 5.99,
        couponId: 'coupon1',
      });
      prisma.cart.update.mockResolvedValue({});

      await service.applyCoupon(userId, 'SAVE10');

      expect(couponsService.validateCoupon).toHaveBeenCalledWith('SAVE10', userId, 59.98);
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: cartId },
        data: { couponCode: 'SAVE10' },
      });
    });

    it('should throw BadRequestException when cart is empty', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: cartId, items: [] });

      await expect(service.applyCoupon(userId, 'SAVE10')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no cart exists', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      await expect(service.applyCoupon(userId, 'SAVE10')).rejects.toThrow(BadRequestException);
    });

    it('should propagate validation error from CouponsService', async () => {
      prisma.cart.findUnique.mockResolvedValue({
        id: cartId,
        items: [{ quantity: 1, product: { price: 10 } }],
      });
      couponsService.validateCoupon.mockRejectedValue(
        new BadRequestException('Coupon has expired'),
      );

      await expect(service.applyCoupon(userId, 'EXPIRED')).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeCoupon', () => {
    it('should remove coupon from cart', async () => {
      prisma.cart.findUnique
        .mockResolvedValueOnce({ id: cartId }) // removeCoupon
        .mockResolvedValueOnce(mockCart); // getCart at end
      prisma.cart.update.mockResolvedValue({});

      const result = await service.removeCoupon(userId);

      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: cartId },
        data: { couponCode: null },
      });
      expect(result.id).toBe(cartId);
    });

    it('should throw NotFoundException when cart does not exist', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      await expect(service.removeCoupon(userId)).rejects.toThrow(NotFoundException);
    });
  });
});
