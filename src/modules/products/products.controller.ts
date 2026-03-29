import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { Public, Roles } from '../../common/decorators';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductQueryDto,
  UploadImageDto,
  ProductListItemDto,
  ProductDetailDto,
  ProductImageDto,
} from './dto';
import { multerConfig } from '../cloudinary/multer.config';
import { ApiSuccessResponse, ApiPaginatedResponse, ApiErrorResponses } from '../../common/swagger';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ============================================
  // PUBLIC ENDPOINTS
  // ============================================

  @Get()
  @Public()
  @Throttle({
    short: { limit: 5, ttl: 1000 },
    medium: { limit: 40, ttl: 10000 },
    long: { limit: 200, ttl: 60000 },
  })
  @ApiOperation({ summary: 'List products with filters and pagination (public)' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (1-100, default: 10)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by product name or description',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    type: String,
    description: 'Filter by category CUID',
  })
  @ApiQuery({
    name: 'minPrice',
    required: false,
    type: String,
    description: 'Minimum price filter (e.g. "10.00")',
  })
  @ApiQuery({
    name: 'maxPrice',
    required: false,
    type: String,
    description: 'Maximum price filter (e.g. "99.99")',
  })
  @ApiQuery({
    name: 'isFeatured',
    required: false,
    type: String,
    description: 'Filter featured products ("true" or "false")',
  })
  @ApiPaginatedResponse(ProductListItemDto, 'Paginated product list')
  findAll(@Query() query: ProductQueryDto): ReturnType<ProductsService['findAll']> {
    return this.productsService.findAll({ ...query, isActive: true });
  }

  @Get('manage')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List products with isActive filter (admin)' })
  @ApiQuery({
    name: 'isActive',
    required: false,
    enum: ['true', 'false', 'all'],
    description: 'Filter by active status. Default: "true"',
  })
  @ApiPaginatedResponse(ProductListItemDto, 'Paginated product list')
  @ApiErrorResponses(401, 403)
  findAllAdmin(@Query() query: ProductQueryDto): ReturnType<ProductsService['findAll']> {
    return this.productsService.findAll(query);
  }

  @Get(':slug')
  @Public()
  @Throttle({
    short: { limit: 5, ttl: 1000 },
    medium: { limit: 40, ttl: 10000 },
    long: { limit: 200, ttl: 60000 },
  })
  @ApiOperation({ summary: 'Get full product details by slug (public)' })
  @ApiParam({
    name: 'slug',
    description: 'URL-friendly product slug',
    example: 'wireless-headphones',
  })
  @ApiSuccessResponse(ProductDetailDto)
  @ApiErrorResponses(404)
  findBySlug(@Param('slug') slug: string): ReturnType<ProductsService['findBySlug']> {
    return this.productsService.findBySlug(slug);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new product (admin)' })
  @ApiSuccessResponse(ProductDetailDto, 201, 'Product created')
  @ApiErrorResponses(400, 401, 403, 409)
  create(@Body() dto: CreateProductDto): ReturnType<ProductsService['create']> {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a product (admin)' })
  @ApiParam({ name: 'id', description: 'Product CUID' })
  @ApiSuccessResponse(ProductDetailDto)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): ReturnType<ProductsService['update']> {
    return this.productsService.update(id, dto);
  }

  @Post(':id/deactivate')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Soft-delete a product (admin)' })
  @ApiParam({ name: 'id', description: 'Product CUID' })
  @ApiSuccessResponse(ProductDetailDto)
  @ApiErrorResponses(401, 403, 404)
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id') id: string): ReturnType<ProductsService['deactivate']> {
    return this.productsService.deactivate(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Permanently delete a product (admin)' })
  @ApiParam({ name: 'id', description: 'Product CUID' })
  @ApiSuccessResponse(ProductDetailDto)
  @ApiErrorResponses(401, 403, 404)
  hardDelete(@Param('id') id: string): ReturnType<ProductsService['hardDelete']> {
    return this.productsService.hardDelete(id);
  }

  // ============================================
  // IMAGE ENDPOINTS
  // ============================================

  @Post(':id/images')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Add a product image by URL (admin)' })
  @ApiParam({ name: 'id', description: 'Product CUID' })
  @ApiSuccessResponse(ProductImageDto, 201, 'Image added')
  @ApiErrorResponses(400, 401, 403, 404)
  addImage(
    @Param('id') productId: string,
    @Body() imageData: { url: string; alt?: string },
  ): ReturnType<ProductsService['addImage']> {
    return this.productsService.addImage(productId, imageData);
  }

  @Post(':id/images/upload')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload a product image file (admin)' })
  @ApiParam({ name: 'id', description: 'Product CUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, or WebP, max 5MB)',
        },
        alt: {
          type: 'string',
          description: 'Alt text for the image',
          maxLength: 200,
        },
      },
    },
  })
  @ApiSuccessResponse(ProductImageDto, 201, 'Image uploaded')
  @ApiErrorResponses(401, 403, 404, 422, 429)
  @Throttle({
    short: { limit: 1, ttl: 1000 },
    medium: { limit: 5, ttl: 10000 },
    long: { limit: 10, ttl: 60000 },
  })
  @UseInterceptors(FileInterceptor('file', multerConfig))
  uploadImage(
    @Param('id') productId: string,
    @Body() dto: UploadImageDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: /image\/(jpeg|png|webp)/ })
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          fileIsRequired: true,
        }),
    )
    file: Express.Multer.File,
  ): ReturnType<ProductsService['uploadImage']> {
    return this.productsService.uploadImage(productId, file, dto.alt);
  }

  @Delete(':id/images/:imageId')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove a product image (admin)' })
  @ApiParam({ name: 'id', description: 'Product CUID' })
  @ApiParam({ name: 'imageId', description: 'Image CUID' })
  @ApiSuccessResponse(ProductImageDto)
  @ApiErrorResponses(401, 403, 404)
  removeImage(
    @Param('id') productId: string,
    @Param('imageId') imageId: string,
  ): ReturnType<ProductsService['removeImage']> {
    return this.productsService.removeImage(productId, imageId);
  }
}
