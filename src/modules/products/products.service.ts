import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateProductDto, UpdateProductDto, ProductQuery } from './dto';
import {
  getPrismaPageArgs,
  paginate,
  type PaginatedResult,
} from '../../common/utils/pagination.util';
import { generateSlug, ensureUniqueSlug } from '../../common/utils/slug.util';
import { Prisma } from '../../generated/prisma/client';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CacheService } from '../cache/cache.service';
import { CACHE_PREFIXES, CACHE_TTL } from '../cache/cache.constants';
import { CacheEvents, ProductChangedEvent } from '../cache/cache.events';

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
  updatedAt: true,
  category: {
    select: { id: true, name: true, slug: true },
  },
  images: {
    select: { id: true, url: true, alt: true, cloudinaryPublicId: true, sortOrder: true },
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
    select: { id: true, url: true, alt: true, cloudinaryPublicId: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
  },
} as const;

type ProductListItem = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;
type ProductDetail = Prisma.ProductGetPayload<{ select: typeof productDetailSelect }>;

// Raw SQL result shape for full-text search queries
type RawProductRow = {
  id: string;
  name: string;
  slug: string;
  price: string;
  compare_price: string | null;
  stock: number;
  is_active: boolean;
  is_featured: boolean;
  created_at: Date;
  updated_at: Date;
  category_id: string;
  category_name: string;
  category_slug: string;
  image_id: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_cloudinary_public_id: string | null;
  image_sort_order: number | null;
  rank: number;
  total_count: bigint;
};

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly cacheService: CacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ============================================
  // HELPER METHODS
  // ============================================

  private slugExists = (slug: string): Promise<{ id: string } | null> =>
    this.prisma.product.findUnique({ where: { slug }, select: { id: true } });

  private buildProductListCacheKey(query: ProductQuery): string {
    const params = Object.entries(query)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('&');

    return `${CACHE_PREFIXES.PRODUCTS_LIST}:${params}`;
  }

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

  private mapRawProductToListItem(row: RawProductRow): ProductListItem {
    const images: ProductListItem['images'] = row.image_id
      ? [
          {
            id: row.image_id,
            url: row.image_url!,
            alt: row.image_alt,
            cloudinaryPublicId: row.image_cloudinary_public_id,
            sortOrder: row.image_sort_order!,
          },
        ]
      : [];

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      price: new Prisma.Decimal(row.price),
      comparePrice: row.compare_price ? new Prisma.Decimal(row.compare_price) : null,
      stock: row.stock,
      isActive: row.is_active,
      isFeatured: row.is_featured,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      category: {
        id: row.category_id,
        name: row.category_name,
        slug: row.category_slug,
      },
      images,
    };
  }

  private async findAllWithSearch(
    searchTerm: string,
    query: ProductQuery,
  ): Promise<{ products: ProductListItem[]; total: number }> {
    const { skip, take } = getPrismaPageArgs(query);

    const isActive = query.isActive ?? null;
    const categoryId = query.categoryId ?? null;
    const isFeatured = query.isFeatured ?? null;
    const minPrice = query.minPrice ?? null;
    const maxPrice = query.maxPrice ?? null;

    const rows = await this.prisma.$queryRaw<RawProductRow[]>`
      WITH search_query AS (
        SELECT websearch_to_tsquery('english', ${searchTerm}) AS q
      )
      SELECT
        p.id,
        p.name,
        p.slug,
        p.price::text,
        p.compare_price::text,
        p.stock,
        p.is_active,
        p.is_featured,
        p.created_at,
        p.updated_at,
        c.id AS category_id,
        c.name AS category_name,
        c.slug AS category_slug,
        pi.id AS image_id,
        pi.url AS image_url,
        pi.alt AS image_alt,
        pi.cloudinary_public_id AS image_cloudinary_public_id,
        pi.sort_order AS image_sort_order,
        ts_rank(p.search_vector, sq.q) AS rank,
        COUNT(*) OVER() AS total_count
      FROM products p
      CROSS JOIN search_query sq
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN LATERAL (
        SELECT pi2.id, pi2.url, pi2.alt, pi2.cloudinary_public_id, pi2.sort_order
        FROM product_images pi2
        WHERE pi2.product_id = p.id
        ORDER BY pi2.sort_order ASC
        LIMIT 1
      ) pi ON true
      WHERE p.search_vector @@ sq.q
        AND (${isActive}::boolean IS NULL OR p.is_active = ${isActive})
        AND (${categoryId}::text IS NULL OR p.category_id = ${categoryId})
        AND (${isFeatured}::boolean IS NULL OR p.is_featured = ${isFeatured})
        AND (${minPrice}::decimal IS NULL OR p.price >= ${minPrice})
        AND (${maxPrice}::decimal IS NULL OR p.price <= ${maxPrice})
      ORDER BY rank DESC, p.created_at DESC, p.id DESC
      LIMIT ${take}
      OFFSET ${skip}
    `;

    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
    const products = rows.map((row) => this.mapRawProductToListItem(row));

    return { products, total };
  }

  // ============================================
  // PUBLIC METHODS
  // ============================================

  async findAll(query: ProductQuery): Promise<PaginatedResult<ProductListItem>> {
    const search = query.search?.trim() || undefined;
    const normalizedQuery = { ...query, search };

    const cacheKey = this.buildProductListCacheKey(normalizedQuery);
    const cached = await this.cacheService.get<PaginatedResult<ProductListItem>>(cacheKey);
    if (cached) {
      return cached;
    }

    const useFullTextSearch = search && search.length >= 3;

    let result: PaginatedResult<ProductListItem>;

    if (useFullTextSearch) {
      const { products, total } = await this.findAllWithSearch(search, normalizedQuery);
      result = paginate(products, total, normalizedQuery);
    } else {
      const { skip, take } = getPrismaPageArgs(normalizedQuery);

      // Build where clause with filters
      const where: {
        isActive?: boolean;
        categoryId?: string;
        isFeatured?: boolean;
        price?: { gte?: number; lte?: number };
        OR?: {
          name?: { contains: string; mode: 'insensitive' };
          description?: { contains: string; mode: 'insensitive' };
        }[];
      } = {};

      if (normalizedQuery.isActive !== undefined) {
        where.isActive = normalizedQuery.isActive;
      }

      if (normalizedQuery.categoryId) {
        where.categoryId = normalizedQuery.categoryId;
      }

      if (normalizedQuery.isFeatured !== undefined) {
        where.isFeatured = normalizedQuery.isFeatured;
      }

      if (normalizedQuery.minPrice !== undefined || normalizedQuery.maxPrice !== undefined) {
        where.price = {};
        if (normalizedQuery.minPrice !== undefined) {
          where.price.gte = normalizedQuery.minPrice;
        }
        if (normalizedQuery.maxPrice !== undefined) {
          where.price.lte = normalizedQuery.maxPrice;
        }
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Build orderBy
      const orderBy: Record<string, 'asc' | 'desc'> = {};
      const sortField = normalizedQuery.sortBy || 'createdAt';
      const sortOrder = normalizedQuery.sortOrder || 'desc';
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

      result = paginate(products as ProductListItem[], total, normalizedQuery);
    }

    await this.cacheService.set(cacheKey, result, CACHE_TTL.PRODUCTS_LIST);

    return result;
  }

  async findBySlug(slug: string): Promise<ProductDetail> {
    const cacheKey = `${CACHE_PREFIXES.PRODUCTS_DETAIL}:${slug}`;
    const cached = await this.cacheService.get<ProductDetail>(cacheKey);
    if (cached) {
      return cached;
    }

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

    await this.cacheService.set(cacheKey, product, CACHE_TTL.PRODUCTS_DETAIL);

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

    this.eventEmitter.emit(
      CacheEvents.PRODUCT_CHANGED,
      new ProductChangedEvent(product.id, 'create'),
    );

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

    this.eventEmitter.emit(CacheEvents.PRODUCT_CHANGED, new ProductChangedEvent(id, 'update'));

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

    this.eventEmitter.emit(CacheEvents.PRODUCT_CHANGED, new ProductChangedEvent(id, 'deactivate'));

    return { message: 'Product deactivated successfully' };
  }

  async hardDelete(id: string): Promise<{ message: string }> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        images: { select: { cloudinaryPublicId: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Collect Cloudinary public IDs before cascade delete removes the records
    const publicIds = product.images
      .map((img) => img.cloudinaryPublicId)
      .filter((id): id is string => id !== null);

    await this.prisma.product.delete({
      where: { id },
    });

    this.eventEmitter.emit(CacheEvents.PRODUCT_CHANGED, new ProductChangedEvent(id, 'delete'));

    // Batch delete from Cloudinary after DB cascade (best-effort)
    if (publicIds.length > 0) {
      await this.cloudinaryService.deleteImages(publicIds).catch((error) => {
        this.logger.error('Failed to batch-delete Cloudinary images', error);
      });
    }

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

    this.eventEmitter.emit(
      CacheEvents.PRODUCT_CHANGED,
      new ProductChangedEvent(productId, 'image_change'),
    );

    return this.findById(productId);
  }

  async uploadImage(
    productId: string,
    file: Express.Multer.File,
    alt?: string,
  ): Promise<ProductDetail> {
    // Verify product exists and get current image count for sortOrder
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, _count: { select: { images: true } } },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Track Cloudinary result for cleanup if DB write fails
    let cloudinaryResult: { url: string; publicId: string } | null = null;

    try {
      // Step 1: Upload to Cloudinary
      cloudinaryResult = await this.cloudinaryService.uploadImage(file.buffer, 'products');

      // Step 2: Save URL + publicId to database
      await this.prisma.productImage.create({
        data: {
          productId,
          url: cloudinaryResult.url,
          cloudinaryPublicId: cloudinaryResult.publicId,
          alt,
          sortOrder: product._count.images, // Add at end
        },
      });

      this.eventEmitter.emit(
        CacheEvents.PRODUCT_CHANGED,
        new ProductChangedEvent(productId, 'image_change'),
      );

      return await this.findById(productId);
    } catch (error) {
      // Cleanup: if Cloudinary upload succeeded but DB write failed,
      // delete the orphaned Cloudinary asset
      if (cloudinaryResult?.publicId) {
        await this.cloudinaryService
          .deleteImage(cloudinaryResult.publicId)
          .catch((cleanupError) => {
            this.logger.error(
              `Failed to cleanup Cloudinary image ${cloudinaryResult!.publicId} after DB error`,
              cleanupError,
            );
          });
      }
      throw error;
    }
  }

  async removeImage(productId: string, imageId: string): Promise<ProductDetail> {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
      select: { id: true, productId: true, cloudinaryPublicId: true },
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

    // Clean up Cloudinary asset (skip for legacy URL-only images)
    if (image.cloudinaryPublicId) {
      await this.cloudinaryService.deleteImage(image.cloudinaryPublicId).catch((error) => {
        this.logger.error(`Failed to delete Cloudinary image ${image.cloudinaryPublicId}`, error);
      });
    }

    this.eventEmitter.emit(
      CacheEvents.PRODUCT_CHANGED,
      new ProductChangedEvent(productId, 'image_change'),
    );

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
