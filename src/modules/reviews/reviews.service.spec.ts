import { Test, type TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReviewsService } from './reviews.service';
import { createMockPrismaClient, resetMockPrismaClient } from '@test/mocks/prisma.mock';
import { createMockEventEmitter } from '@test/mocks/common.mock';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let eventEmitter: ReturnType<typeof createMockEventEmitter>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    eventEmitter = createMockEventEmitter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetMockPrismaClient(prisma);
  });

  const userId = 'cluser123456789012345678';
  const productId = 'clprod123456789012345678';
  const reviewId = 'clrev1234567890123456789';

  const mockReview = {
    id: reviewId,
    rating: 5,
    title: 'Great product',
    comment: 'Absolutely love it',
    status: 'PENDING',
    adminNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: userId, firstName: 'John', lastName: 'Doe' },
    product: { id: productId, name: 'Test Product', slug: 'test-product' },
  };

  const setupRecalculateMocks = (avgRating: number | null, count: number): void => {
    prisma.review.aggregate.mockResolvedValue({
      _avg: { rating: avgRating },
      _count: { rating: count },
    });
    prisma.product.update.mockResolvedValue({} as never);
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      rating: 5,
      title: 'Great product',
      comment: 'Absolutely love it',
    };

    it('should create a review and recalculate product rating', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: productId, isActive: true });
      prisma.orderItem.findFirst.mockResolvedValue({ id: 'order-item-1' });
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(mockReview);
      prisma.user.findUnique.mockResolvedValue({ email: 'john@example.com', firstName: 'John' });
      setupRecalculateMocks(4.5, 10);

      const result = await service.create(userId, productId, createDto as never);

      expect(result).toEqual(mockReview);
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          productId,
          rating: 5,
          title: 'Great product',
        }),
        select: expect.objectContaining({ id: true, rating: true }),
      });
      expect(prisma.review.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId, status: 'APPROVED' },
        }),
      );
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: { averageRating: 4.5, reviewCount: 10 },
      });
      // Verify review.created event emitted for admin notification
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'review.created',
        expect.objectContaining({
          userId,
          reviewId: reviewId,
          productName: 'Test Product',
          rating: 5,
        }),
      );
    });

    it('should throw NotFoundException when product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.create(userId, productId, createDto as never)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when product is inactive', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: productId, isActive: false });

      await expect(service.create(userId, productId, createDto as never)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.orderItem.findFirst).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user has not purchased the product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: productId, isActive: true });
      prisma.orderItem.findFirst.mockResolvedValue(null);

      await expect(service.create(userId, productId, createDto as never)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when user already reviewed this product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: productId, isActive: true });
      prisma.orderItem.findFirst.mockResolvedValue({ id: 'order-item-1' });
      prisma.review.findUnique.mockResolvedValue({ id: 'existing-review' });

      await expect(service.create(userId, productId, createDto as never)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it('should verify purchase using confirmed/processing/shipped/delivered statuses', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: productId, isActive: true });
      prisma.orderItem.findFirst.mockResolvedValue({ id: 'order-item-1' });
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(mockReview);
      setupRecalculateMocks(null, 0);

      await service.create(userId, productId, createDto as never);

      expect(prisma.orderItem.findFirst).toHaveBeenCalledWith({
        where: {
          productId,
          order: {
            userId,
            status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
          },
        },
        select: { id: true },
      });
    });
  });

  describe('update', () => {
    const updateDto = {
      rating: 4,
      title: 'Updated review',
      comment: 'Changed my mind slightly',
    };

    it('should update review, reset status to PENDING, and recalculate rating', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: reviewId,
        userId,
        productId,
      });
      const updatedReview = { ...mockReview, ...updateDto, status: 'PENDING', adminNote: null };
      prisma.review.update.mockResolvedValue(updatedReview);
      setupRecalculateMocks(4.2, 8);

      const result = await service.update(userId, reviewId, updateDto as never);

      expect(result).toEqual(updatedReview);
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: reviewId },
        data: expect.objectContaining({
          ...updateDto,
          status: 'PENDING',
          adminNote: null,
        }),
        select: expect.objectContaining({ id: true, rating: true }),
      });
      expect(prisma.review.aggregate).toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not own the review', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: reviewId,
        userId: 'other-user-id',
        productId,
      });

      await expect(service.update(userId, reviewId, updateDto as never)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.review.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when review does not exist', async () => {
      prisma.review.findUnique.mockResolvedValue(null);

      await expect(service.update(userId, 'nonexistent', updateDto as never)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.review.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete review and recalculate product rating', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: reviewId,
        userId,
        productId,
      });
      prisma.review.delete.mockResolvedValue({} as never);
      setupRecalculateMocks(4.0, 5);

      const result = await service.delete(userId, reviewId);

      expect(result).toEqual({ message: 'Review deleted successfully' });
      expect(prisma.review.delete).toHaveBeenCalledWith({ where: { id: reviewId } });
      expect(prisma.review.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId, status: 'APPROVED' },
        }),
      );
    });

    it('should throw NotFoundException when user does not own the review', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: reviewId,
        userId: 'other-user-id',
        productId,
      });

      await expect(service.delete(userId, reviewId)).rejects.toThrow(NotFoundException);

      expect(prisma.review.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when review does not exist', async () => {
      prisma.review.findUnique.mockResolvedValue(null);

      await expect(service.delete(userId, 'nonexistent')).rejects.toThrow(NotFoundException);

      expect(prisma.review.delete).not.toHaveBeenCalled();
    });
  });

  describe('findByProduct', () => {
    it('should return only APPROVED reviews for a product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: productId });
      prisma.review.findMany.mockResolvedValue([{ ...mockReview, status: 'APPROVED' }]);
      prisma.review.count.mockResolvedValue(1);

      const result = await service.findByProduct(productId, {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
      });

      expect(result.data).toHaveLength(1);
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productId,
            status: 'APPROVED',
          }),
        }),
      );
    });

    it('should filter by rating when provided', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: productId });
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(0);

      await service.findByProduct(productId, {
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        rating: 5,
      });

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ rating: 5 }),
        }),
      );
    });

    it('should throw NotFoundException when product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.findByProduct('nonexistent', { page: 1, limit: 10, sortOrder: 'desc' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.review.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated reviews without status filter', async () => {
      prisma.review.findMany.mockResolvedValue([mockReview]);
      prisma.review.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10, sortOrder: 'desc' });

      expect(result.data).toEqual([mockReview]);
      expect(result.meta).toEqual(expect.objectContaining({ total: 1 }));
    });

    it('should filter by status', async () => {
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10, sortOrder: 'desc', status: 'PENDING' });

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('should filter by rating', async () => {
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 10, sortOrder: 'desc', rating: 3 });

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ rating: 3 }),
        }),
      );
    });
  });

  describe('adminUpdate', () => {
    it('should approve a review and recalculate rating', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: reviewId, productId });
      const approvedReview = { ...mockReview, status: 'APPROVED', adminNote: 'Looks good' };
      prisma.review.update.mockResolvedValue(approvedReview);
      setupRecalculateMocks(4.5, 10);

      const result = await service.adminUpdate(reviewId, {
        status: 'APPROVED',
        adminNote: 'Looks good',
      } as never);

      expect(result).toEqual(approvedReview);
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: reviewId },
        data: { status: 'APPROVED', adminNote: 'Looks good' },
        select: expect.objectContaining({ id: true, rating: true }),
      });
      expect(prisma.review.aggregate).toHaveBeenCalled();
    });

    it('should reject a review and recalculate rating', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: reviewId, productId });
      const rejectedReview = { ...mockReview, status: 'REJECTED', adminNote: 'Spam content' };
      prisma.review.update.mockResolvedValue(rejectedReview);
      setupRecalculateMocks(4.8, 7);

      const result = await service.adminUpdate(reviewId, {
        status: 'REJECTED',
        adminNote: 'Spam content',
      } as never);

      expect(result).toEqual(rejectedReview);
      expect(prisma.review.aggregate).toHaveBeenCalled();
    });

    it('should throw NotFoundException when review does not exist', async () => {
      prisma.review.findUnique.mockResolvedValue(null);

      await expect(
        service.adminUpdate('nonexistent', { status: 'APPROVED' } as never),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.review.update).not.toHaveBeenCalled();
    });
  });

  describe('adminDelete', () => {
    it('should permanently delete any review and recalculate rating', async () => {
      prisma.review.findUnique.mockResolvedValue({ id: reviewId, productId });
      prisma.review.delete.mockResolvedValue({} as never);
      setupRecalculateMocks(4.0, 3);

      const result = await service.adminDelete(reviewId);

      expect(result).toEqual({ message: 'Review permanently deleted' });
      expect(prisma.review.delete).toHaveBeenCalledWith({ where: { id: reviewId } });
      expect(prisma.review.aggregate).toHaveBeenCalled();
    });

    it('should throw NotFoundException when review does not exist', async () => {
      prisma.review.findUnique.mockResolvedValue(null);

      await expect(service.adminDelete('nonexistent')).rejects.toThrow(NotFoundException);

      expect(prisma.review.delete).not.toHaveBeenCalled();
    });
  });
});
