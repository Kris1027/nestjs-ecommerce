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
import { CategoriesService } from './categories.service';
import { Public, Roles } from '../../common/decorators';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ============================================
  // PUBLIC ENDPOINTS
  // ============================================

  @Get()
  @Public()
  findAll(@Query() query: PaginationQueryDto): ReturnType<CategoriesService['findAll']> {
    return this.categoriesService.findAll(query);
  }

  @Get('tree')
  @Public()
  findAllTree(): ReturnType<CategoriesService['findAllTree']> {
    return this.categoriesService.findAllTree();
  }

  @Get(':slug')
  @Public()
  findBySlug(@Param('slug') slug: string): ReturnType<CategoriesService['findBySlug']> {
    return this.categoriesService.findBySlug(slug);
  }

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateCategoryDto): ReturnType<CategoriesService['create']> {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ): ReturnType<CategoriesService['update']> {
    return this.categoriesService.update(id, dto);
  }

  @Post(':id/deactivate')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id') id: string): ReturnType<CategoriesService['deactivate']> {
    return this.categoriesService.deactivate(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  hardDelete(@Param('id') id: string): ReturnType<CategoriesService['hardDelete']> {
    return this.categoriesService.hardDelete(id);
  }
}
