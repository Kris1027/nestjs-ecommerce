import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateProductDto, UpdateProductDto, ProductQuery } from './dto';
import {
  getPrismaPageArgs,
  paginate,
  type PaginatedResult,
} from '../../common/utils/pagination.util';
import { generateSlug, ensureUniqueSlug } from '../../common/utils/slug.util';
import { Prisma } from '../../generated/prisma/client';

// Fields to return for product listings (without full description)
const productListSelect = {
  id: true,
  name: true,
  slug: true,
  price: true,
  comparePrice: true,
  stock: true,
  isActive: true,
  isFeatured: true,
  createdAt: true,
  category: {
    select: { id: true, name: true, slug: true },
  },
  images: {
    select: { id: true, url: true, alt: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
    take: 1, // Only first image for listings
  },
} as const;

// Fields for full product detail
const productDetailSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  comparePrice: true,
  sku: true,
  stock: true,
  isActive: true,
  isFeatured: true,
  categoryId: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: { id: true, name: true, slug: true },
  },
  images: {
    select: { id: true, url: true, alt: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
  },
} as const;

type ProductListItem = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;
type ProductDetail = Prisma.ProductGetPayload<{ select: typeof productDetailSelect }>;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // HELPER METHODS
  // ============================================

  private slugExists = (slug: string): Promise<{ id: string } | null> =>
    this.prisma.product.findUnique({ where: { slug }, select: { id: true } });

  private async validateCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, isActive: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (!category.isActive) {
      throw new BadRequestException('Cannot assign product to inactive category');
    }
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  async findAll(query: ProductQuery): Promise<PaginatedResult<ProductListItem>> {
    const { skip, take } = getPrismaPageArgs(query);

    // Build where clause with filters
    const where: {
      isActive: boolean;
      categoryId?: string;
      isFeatured?: boolean;
      price?: { gte?: number; lte?: number };
      OR?: {
        name?: { contains: string; mode: 'insensitive' };
        description?: { contains: string; mode: 'insensitive' };
      }[];
    } = {
      isActive: true,
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.isFeatured !== undefined) {
      where.isFeatured = query.isFeatured;
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {};
      if (query.minPrice !== undefined) {
        where.price.gte = query.minPrice;
      }
      if (query.maxPrice !== undefined) {
        where.price.lte = query.maxPrice;
      }
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy
    const orderBy: Record<string, 'asc' | 'desc'> = {};
    const sortField = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';
    orderBy[sortField] = sortOrder;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: productListSelect,
        orderBy,
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginate(products as ProductListItem[], total, query);
  }

  async findBySlug(slug: string): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: productDetailSelect,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new NotFoundException('Product not found');
    }

    return product as ProductDetail;
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async create(data: CreateProductDto): Promise<ProductDetail> {
    // Validate category
    await this.validateCategory(data.categoryId);

    // Generate unique slug
    const baseSlug = data.slug || generateSlug(data.name);
    const slug = await ensureUniqueSlug({ slug: baseSlug, exists: this.slugExists });

    // Create product with images
    const product = await this.prisma.product.create({
      data: {
        name: data.name,
        slug,
        description: data.description,
        price: data.price,
        comparePrice: data.comparePrice,
        sku: data.sku,
        stock: data.stock ?? 0,
        categoryId: data.categoryId,
        isActive: data.isActive ?? true,
        isFeatured: data.isFeatured ?? false,
        images: data.images
          ? {
              create: data.images.map((img, index) => ({
                url: img.url,
                alt: img.alt,
                sortOrder: index,
              })),
            }
          : undefined,
      },
      select: productDetailSelect,
    });

    return product as ProductDetail;
  }

  async update(id: string, data: UpdateProductDto): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Validate category if changing
    if (data.categoryId) {
      await this.validateCategory(data.categoryId);
    }

    // Handle slug update
    let slug: string | undefined;
    if (data.slug !== undefined) {
      slug = await ensureUniqueSlug({ slug: data.slug, exists: this.slugExists, excludeId: id });
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...data,
        ...(slug && { slug }),
      },
      select: productDetailSelect,
    });

    return updated as ProductDetail;
  }

  async deactivate(id: string): Promise<{ message: string }> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new BadRequestException('Product is already deactivated');
    }

    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Product deactivated successfully' };
  }

  async hardDelete(id: string): Promise<{ message: string }> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.product.delete({
      where: { id },
    });

    return { message: 'Product permanently deleted' };
  }

  // ============================================
  // IMAGE METHODS
  // ============================================

  async addImage(
    productId: string,
    imageData: { url: string; alt?: string },
  ): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, _count: { select: { images: true } } },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.prisma.productImage.create({
      data: {
        productId,
        url: imageData.url,
        alt: imageData.alt,
        sortOrder: product._count.images, // Add at end
      },
    });

    return this.findById(productId);
  }

  async removeImage(productId: string, imageId: string): Promise<ProductDetail> {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
      select: { id: true, productId: true },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (image.productId !== productId) {
      throw new BadRequestException('Image does not belong to this product');
    }

    await this.prisma.productImage.delete({
      where: { id: imageId },
    });

    return this.findById(productId);
  }

  // Helper for admin - get by ID (includes inactive)
  private async findById(id: string): Promise<ProductDetail> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: productDetailSelect,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product as ProductDetail;
  }
}
