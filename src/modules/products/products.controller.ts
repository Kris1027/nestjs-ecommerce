import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { Public, Roles } from '../../common/decorators';
import { CreateProductDto, UpdateProductDto, ProductQueryDto } from './dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ============================================
  // PUBLIC ENDPOINTS
  // ============================================

  @Get()
  @Public()
  findAll(@Query() query: ProductQueryDto): ReturnType<ProductsService['findAll']> {
    return this.productsService.findAll(query);
  }

  @Get(':slug')
  @Public()
  findBySlug(@Param('slug') slug: string): ReturnType<ProductsService['findBySlug']> {
    return this.productsService.findBySlug(slug);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateProductDto): ReturnType<ProductsService['create']> {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): ReturnType<ProductsService['update']> {
    return this.productsService.update(id, dto);
  }

  @Post(':id/deactivate')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id') id: string): ReturnType<ProductsService['deactivate']> {
    return this.productsService.deactivate(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  hardDelete(@Param('id') id: string): ReturnType<ProductsService['hardDelete']> {
    return this.productsService.hardDelete(id);
  }

  // ============================================
  // IMAGE ENDPOINTS
  // ============================================

  @Post(':id/images')
  @Roles('ADMIN')
  addImage(
    @Param('id') productId: string,
    @Body() imageData: { url: string; alt?: string },
  ): ReturnType<ProductsService['addImage']> {
    return this.productsService.addImage(productId, imageData);
  }

  @Delete(':id/images/:imageId')
  @Roles('ADMIN')
  removeImage(
    @Param('id') productId: string,
    @Param('imageId') imageId: string,
  ): ReturnType<ProductsService['removeImage']> {
    return this.productsService.removeImage(productId, imageId);
  }
}
