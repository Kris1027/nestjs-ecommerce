import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import { Public, Roles, CurrentUser } from '../../common/decorators';
import {
  AdminUpdateReviewDto,
  CreateReviewDto,
  ReviewDto,
  ReviewQueryDto,
  UpdateReviewDto,
} from './dto';
import { MessageResponseDto } from '../users/dto';
import { ApiErrorResponses, ApiPaginatedResponse, ApiSuccessResponse } from '../../common/swagger';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ============================================
  // PUBLIC ENDPOINTS
  // ============================================

  @Get('product/:productId')
  @Public()
  @Throttle({
    short: { limit: 5, ttl: 1000 },
    medium: { limit: 40, ttl: 10000 },
    long: { limit: 200, ttl: 60000 },
  })
  @ApiOperation({ summary: 'List approved reviews for a product' })
  @ApiParam({ name: 'productId', description: 'Product CUID' })
  @ApiQuery({
    name: 'rating',
    required: false,
    type: Number,
    description: 'Filter by star rating (1-5)',
  })
  @ApiPaginatedResponse(ReviewDto, 'Paginated approved reviews')
  @ApiErrorResponses(404, 429)
  findByProduct(
    @Param('productId') productId: string,
    @Query() query: ReviewQueryDto,
  ): ReturnType<ReviewsService['findByProduct']> {
    return this.reviewsService.findByProduct(productId, query);
  }

  // ============================================
  // CUSTOMER ENDPOINTS (authenticated, any role)
  // ============================================

  @Post('product/:productId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a review (purchase required)' })
  @ApiParam({ name: 'productId', description: 'Product CUID' })
  @ApiSuccessResponse(ReviewDto, 201, 'Review created')
  @ApiErrorResponses(400, 401, 404, 409, 429)
  create(
    @CurrentUser('sub') userId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateReviewDto,
  ): ReturnType<ReviewsService['create']> {
    return this.reviewsService.create(userId, productId, dto);
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update own review (resets to PENDING)' })
  @ApiParam({ name: 'id', description: 'Review CUID' })
  @ApiSuccessResponse(ReviewDto, 200, 'Review updated')
  @ApiErrorResponses(400, 401, 404, 429)
  update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ): ReturnType<ReviewsService['update']> {
    return this.reviewsService.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete own review' })
  @ApiParam({ name: 'id', description: 'Review CUID' })
  @ApiSuccessResponse(MessageResponseDto, 200, 'Review deleted')
  @ApiErrorResponses(401, 404, 429)
  delete(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ): ReturnType<ReviewsService['delete']> {
    return this.reviewsService.delete(userId, id);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Get('admin')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all reviews with filters (admin)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    description: 'Filter by moderation status',
  })
  @ApiQuery({
    name: 'rating',
    required: false,
    type: Number,
    description: 'Filter by star rating (1-5)',
  })
  @ApiPaginatedResponse(ReviewDto, 'Paginated review list')
  @ApiErrorResponses(401, 403, 429)
  findAll(@Query() query: ReviewQueryDto): ReturnType<ReviewsService['findAll']> {
    return this.reviewsService.findAll(query);
  }

  @Patch(':id/moderate')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Approve or reject a review (admin)' })
  @ApiParam({ name: 'id', description: 'Review CUID' })
  @ApiSuccessResponse(ReviewDto, 200, 'Review moderated')
  @ApiErrorResponses(400, 401, 403, 404, 429)
  adminUpdate(
    @Param('id') id: string,
    @Body() dto: AdminUpdateReviewDto,
  ): ReturnType<ReviewsService['adminUpdate']> {
    return this.reviewsService.adminUpdate(id, dto);
  }

  @Delete(':id/admin')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Permanently delete any review (admin)' })
  @ApiParam({ name: 'id', description: 'Review CUID' })
  @ApiSuccessResponse(MessageResponseDto, 200, 'Review deleted')
  @ApiErrorResponses(401, 403, 404, 429)
  adminDelete(@Param('id') id: string): ReturnType<ReviewsService['adminDelete']> {
    return this.reviewsService.adminDelete(id);
  }
}
