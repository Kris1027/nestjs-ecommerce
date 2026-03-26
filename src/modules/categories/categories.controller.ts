import {
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
  Body,
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
import { CategoriesService } from './categories.service';
import { Public, Roles } from '../../common/decorators';
import { CreateCategoryDto, UpdateCategoryDto, CategoryResponseDto, CategoryQueryDto } from './dto';
import { multerConfig } from '../cloudinary/multer.config';
import { ApiSuccessResponse, ApiPaginatedResponse, ApiErrorResponses } from '../../common/swagger';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ============================================
  // PUBLIC ENDPOINTS
  // ============================================

  @Get()
  @Public()
  @ApiOperation({ summary: 'List categories with optional isActive filter' })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: String,
    description: 'Filter by active status ("true", "false", or "all"). Default: "true"',
  })
  @ApiPaginatedResponse(CategoryResponseDto, 'Paginated category list')
  findAll(@Query() query: CategoryQueryDto): ReturnType<CategoriesService['findAll']> {
    return this.categoriesService.findAll(query);
  }

  @Get('tree')
  @Public()
  @ApiOperation({ summary: 'Get category tree hierarchy (public)' })
  @ApiSuccessResponse(CategoryResponseDto)
  @ApiErrorResponses(429)
  findAllTree(): ReturnType<CategoriesService['findAllTree']> {
    return this.categoriesService.findAllTree();
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Get a category by slug (public)' })
  @ApiParam({ name: 'slug', description: 'URL-friendly category slug', example: 'electronics' })
  @ApiSuccessResponse(CategoryResponseDto)
  @ApiErrorResponses(404)
  findBySlug(@Param('slug') slug: string): ReturnType<CategoriesService['findBySlug']> {
    return this.categoriesService.findBySlug(slug);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Post()
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new category (admin)' })
  @ApiSuccessResponse(CategoryResponseDto, 201, 'Category created')
  @ApiErrorResponses(400, 401, 403, 409)
  create(@Body() dto: CreateCategoryDto): ReturnType<CategoriesService['create']> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a category (admin)' })
  @ApiParam({ name: 'id', description: 'Category CUID' })
  @ApiSuccessResponse(CategoryResponseDto)
  @ApiErrorResponses(400, 401, 403, 404)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): ReturnType<CategoriesService['update']> {
    return this.categoriesService.update(id, dto);
  }

  @Post(':id/deactivate')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Soft-delete a category (admin)' })
  @ApiParam({ name: 'id', description: 'Category CUID' })
  @ApiSuccessResponse(CategoryResponseDto)
  @ApiErrorResponses(401, 403, 404)
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id') id: string): ReturnType<CategoriesService['deactivate']> {
    return this.categoriesService.deactivate(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Permanently delete a category (admin)' })
  @ApiParam({ name: 'id', description: 'Category CUID' })
  @ApiSuccessResponse(CategoryResponseDto)
  @ApiErrorResponses(401, 403, 404)
  hardDelete(@Param('id') id: string): ReturnType<CategoriesService['hardDelete']> {
    return this.categoriesService.hardDelete(id);
  }

  @Post(':id/image/upload')
  @Roles('ADMIN')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload or replace category image (admin)' })
  @ApiParam({ name: 'id', description: 'Category CUID' })
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
      },
    },
  })
  @ApiSuccessResponse(CategoryResponseDto)
  @ApiErrorResponses(401, 403, 404, 422, 429)
  @Throttle({
    short: { limit: 1, ttl: 1000 },
    medium: { limit: 5, ttl: 10000 },
    long: { limit: 10, ttl: 60000 },
  })
  @UseInterceptors(FileInterceptor('file', multerConfig))
  uploadImage(
    @Param('id') id: string,
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
  ): ReturnType<CategoriesService['uploadImage']> {
    return this.categoriesService.uploadImage(id, file);
  }
}
