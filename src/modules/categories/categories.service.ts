import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto';
import {
  getPrismaPageArgs,
  paginate,
  type PaginatedResult,
} from '../../common/utils/pagination.util';
import { generateSlug, ensureUniqueSlug } from '../../common/utils/slug.util';
import type { PaginationQuery } from '../../common/dto/pagination.dto';

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  parentId: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

type CategoryResponse = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;

type CategoryWithChildren = CategoryResponse & {
  children: CategoryWithChildren[];
};

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // HELPER METHODS
  // ============================================

  private slugExists = (slug: string): Promise<{ id: string } | null> =>
    this.prisma.category.findUnique({ where: { slug }, select: { id: true } });

  private async validateParent(parentId: string): Promise<void> {
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true, isActive: true },
    });

    if (!parent) {
      throw new NotFoundException('Parent category not found');
    }

    if (!parent.isActive) {
      throw new BadRequestException('Cannot assign to inactive parent category');
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  async findAll(query: PaginationQuery): Promise<PaginatedResult<CategoryResponse>> {
    const { skip, take } = getPrismaPageArgs(query);

    const [categories, total] = await Promise.all([
      this.prisma.category.findMany({
        where: { isActive: true },
        select: categorySelect,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.category.count({ where: { isActive: true } }),
    ]);

    return paginate(categories, total, query);
  }

  async findAllTree(): Promise<CategoryWithChildren[]> {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      select: categorySelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const categoryMap = new Map<string, CategoryWithChildren>();
    const roots: CategoryWithChildren[] = [];

    for (const category of categories) {
      categoryMap.set(category.id, { ...category, children: [] });
    }

    for (const category of categories) {
      const node = categoryMap.get(category.id)!;

      if (category.parentId && categoryMap.has(category.parentId)) {
        categoryMap.get(category.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async findBySlug(slug: string): Promise<CategoryResponse> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      select: categorySelect,
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (!category.isActive) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async create(data: CreateCategoryDto): Promise<CategoryResponse> {
    if (data.parentId) {
      await this.validateParent(data.parentId);
    }

    // Generate unique slug
    const baseSlug = data.slug || generateSlug(data.name);
    const slug = await ensureUniqueSlug({ slug: baseSlug, exists: this.slugExists });

    return this.prisma.category.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        imageUrl: data.imageUrl,
        parentId: data.parentId,
        sortOrder: data.sortOrder ?? 0,
      },
      select: categorySelect,
    });
  }

  async update(id: string, data: UpdateCategoryDto): Promise<CategoryResponse> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (data.parentId !== undefined) {
      if (data.parentId === id) {
        throw new BadRequestException('Category cannot be its own parent');
      }

      if (data.parentId !== null) {
        await this.validateParent(data.parentId);
      }
    }

    let slug: string | undefined;
    if (data.slug !== undefined) {
      slug = await ensureUniqueSlug({ slug: data.slug, exists: this.slugExists, excludeId: id });
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        ...data,
        ...(slug && { slug }),
      },
      select: categorySelect,
    });
  }

  async deactivate(id: string): Promise<{ message: string }> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (!category.isActive) {
      throw new BadRequestException('Category is already deactivated');
    }

    await this.prisma.category.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Category deactivated successfully' };
  }

  async hardDelete(id: string): Promise<{ message: string }> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    await this.prisma.category.delete({
      where: { id },
    });

    return { message: 'Category permanently deleted' };
  }
}
