import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, ReviewStatus, OrderStatus } from '../../generated/prisma/client';
import {
  getPrismaPageArgs,
  paginate,
  type PaginatedResult,
} from '../../common/utils/pagination.util';
import type { CreateReviewDto } from './dto/create-review.dto';
import type { UpdateReviewDto } from './dto/update-review.dto';
import type { AdminUpdateReviewDto } from './dto/admin-update-review.dto';
import type { ReviewQuery } from './dto';
import { NotificationEvents, ReviewCreatedEvent } from '../notifications/events';

// ============================================
// SELECT OBJECT & TYPE
// ============================================

// Define exactly which fields to return — never expose raw DB rows
const reviewSelect = {
  id: true,
  rating: true,
  title: true,
  comment: true,
  status: true,
  adminNote: true,
  createdAt: true,
  updatedAt: true,
  // Include reviewer's public info (not password/email)
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  },
  // Include product basic info for admin listings
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
} as const;

// Auto-generate TypeScript type from Prisma select — stays in sync with DB
type ReviewResponse = Prisma.ReviewGetPayload<{ select: typeof reviewSelect }>;

// Statuses that prove a customer paid for the product
const PURCHASED_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ============================================
  // CUSTOMER METHODS
  // ============================================

  async create(userId: string, productId: string, dto: CreateReviewDto): Promise<ReviewResponse> {
    // 1. Verify product exists and is active
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isActive: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new BadRequestException('Cannot review an inactive product');
    }

    // 2. Verify purchase — customer must have bought this product
    const purchasedItem = await this.prisma.orderItem.findFirst({
      where: {
        productId,
        order: {
          userId,
          status: { in: PURCHASED_STATUSES },
        },
      },
      select: { id: true },
    });

    if (!purchasedItem) {
      throw new BadRequestException('You must purchase this product before reviewing');
    }

    // 3. Check if user already reviewed this product (friendly error before DB constraint)
    const existingReview = await this.prisma.review.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { id: true },
    });

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this product');
    }

    // 4. Create the review (status defaults to PENDING in schema)
    const review = await this.prisma.review.create({
      data: {
        userId,
        productId,
        rating: dto.rating,
        title: dto.title,
        comment: dto.comment,
      },
      select: reviewSelect,
    });

    // 5. Recalculate product rating (only APPROVED reviews are included;
    //    this new PENDING review won't affect the average until approved)
    await this.recalculateRating(productId);

    // 6. Emit event so admins get notified for moderation
    const reviewer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    if (reviewer) {
      this.eventEmitter.emit(
        NotificationEvents.REVIEW_CREATED,
        new ReviewCreatedEvent(
          userId,
          reviewer.email,
          reviewer.firstName,
          review.id,
          review.product.name,
          review.rating,
          review.title ?? '',
        ),
      );
    }

    return review;
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto): Promise<ReviewResponse> {
    // 1. Find the review and verify ownership
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, userId: true, productId: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== userId) {
      throw new NotFoundException('Review not found');
    }

    // 2. Update review and reset status to PENDING (needs re-moderation)
    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        ...dto,
        status: ReviewStatus.PENDING, // Edited reviews must be re-approved
        adminNote: null, // Clear any previous admin note
      },
      select: reviewSelect,
    });

    // 3. Recalculate since status changed (was possibly APPROVED before)
    await this.recalculateRating(review.productId);

    return updated;
  }

  async delete(userId: string, reviewId: string): Promise<{ message: string }> {
    // 1. Find and verify ownership
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, userId: true, productId: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.userId !== userId) {
      throw new NotFoundException('Review not found');
    }

    // 2. Delete and recalculate
    await this.prisma.review.delete({ where: { id: reviewId } });
    await this.recalculateRating(review.productId);

    return { message: 'Review deleted successfully' };
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  async findByProduct(
    productId: string,
    query: ReviewQuery,
  ): Promise<PaginatedResult<ReviewResponse>> {
    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const { skip, take } = getPrismaPageArgs(query);

    // Only show APPROVED reviews to the public
    const where: Prisma.ReviewWhereInput = {
      productId,
      status: ReviewStatus.APPROVED,
    };

    // Optional: filter by star rating
    if (query.rating !== undefined) {
      where.rating = query.rating;
    }

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: reviewSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.review.count({ where }),
    ]);

    return paginate(reviews, total, query);
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async findAll(query: ReviewQuery): Promise<PaginatedResult<ReviewResponse>> {
    const { skip, take } = getPrismaPageArgs(query);

    // Build dynamic where clause from filters
    const where: Prisma.ReviewWhereInput = {};

    if (query.status) {
      where.status = query.status as ReviewStatus;
    }

    if (query.rating !== undefined) {
      where.rating = query.rating;
    }

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: reviewSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.review.count({ where }),
    ]);

    return paginate(reviews, total, query);
  }

  async adminUpdate(reviewId: string, dto: AdminUpdateReviewDto): Promise<ReviewResponse> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, productId: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: dto.status as ReviewStatus,
        adminNote: dto.adminNote,
      },
      select: reviewSelect,
    });

    // Recalculate — approval/rejection changes the public average
    await this.recalculateRating(review.productId);

    return updated;
  }

  async adminDelete(reviewId: string): Promise<{ message: string }> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, productId: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await this.prisma.review.delete({ where: { id: reviewId } });
    await this.recalculateRating(review.productId);

    return { message: 'Review permanently deleted' };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async recalculateRating(productId: string): Promise<void> {
    // Aggregate only APPROVED reviews — pending/rejected don't affect public rating
    const result = await this.prisma.review.aggregate({
      where: {
        productId,
        status: ReviewStatus.APPROVED,
      },
      _avg: { rating: true },
      _count: { rating: true },
    });

    // Update the denormalized fields on Product
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        // Round to 1 decimal place (matches Decimal(2,1)), null if no approved reviews
        averageRating: result._avg.rating ? Math.round(result._avg.rating * 10) / 10 : null,
        reviewCount: result._count.rating,
      },
    });
  }
}
