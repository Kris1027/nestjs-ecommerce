import { Test, type TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from './products.service';
import { createMockPrismaClient, resetMockPrismaClient } from '@test/mocks/prisma.mock';
import {
  createMockCloudinaryService,
  createMockEventEmitter,
  createMockCacheService,
} from '@test/mocks/common.mock';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CacheService } from '../cache/cache.service';
import { CacheEvents } from '../cache/cache.events';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let cloudinaryService: ReturnType<typeof createMockCloudinaryService>;
  let cacheService: ReturnType<typeof createMockCacheService>;
  let eventEmitter: ReturnType<typeof createMockEventEmitter>;

  beforeEach(async () => {
    prisma = createMockPrismaClient();
    cloudinaryService = createMockCloudinaryService();
    cacheService = createMockCacheService();
    eventEmitter = createMockEventEmitter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: cloudinaryService },
        { provide: CacheService, useValue: cacheService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetMockPrismaClient(prisma);
  });

  const mockProduct = {
    id: 'clprod123456789012345678',
    name: 'iPhone 15',
    slug: 'iphone-15',
    description: 'Latest iPhone model',
    price: 999.99,
    comparePrice: 1099.99,
    sku: 'IP15-001',
    stock: 50,
    isActive: true,
    isFeatured: false,
    categoryId: 'clcat1234567890123456789',
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: 'clcat1234567890123456789', name: 'Electronics', slug: 'electronics' },
    images: [
      {
        id: 'climg1234567890123456789',
        url: 'https://example.com/iphone.jpg',
        alt: 'iPhone 15',
        cloudinaryPublicId: 'products/iphone-1',
        sortOrder: 0,
      },
    ],
  };

  const mockProductList = {
    ...mockProduct,
    images: [mockProduct.images[0]],
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return cached result on cache hit', async () => {
      const cachedResult = {
        data: [mockProductList],
        meta: {
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
      cacheService.get.mockResolvedValue(cachedResult);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
      });

      expect(result).toEqual(cachedResult);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
      expect(prisma.product.count).not.toHaveBeenCalled();
    });

    it('should return paginated active products and cache result', async () => {
      prisma.product.findMany.mockResolvedValue([mockProductList]);
      prisma.product.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
      });

      expect(result.data).toEqual([mockProductList]);
      expect(result.meta).toEqual(expect.objectContaining({ total: 1, page: 1, limit: 10 }));
      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('cache:products:list:'),
        expect.objectContaining({ data: [mockProductList] }),
        expect.any(Number),
      );
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('should filter by categoryId', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
        categoryId: 'clcat1234567890123456789',
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'clcat1234567890123456789' }),
        }),
      );
    });

    it('should filter by isFeatured', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
        isFeatured: true,
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isFeatured: true }),
        }),
      );
    });

    it('should filter by price range', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
        minPrice: 100,
        maxPrice: 500,
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ price: { gte: 100, lte: 500 } }),
        }),
      );
    });

    it('should fall back to ILIKE search for short queries (1-2 chars)', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
        search: 'ip',
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'ip', mode: 'insensitive' } },
              { description: { contains: 'ip', mode: 'insensitive' } },
            ],
          }),
        }),
      );
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('should fall back to LIKE search when full-text returns no results for 3+ character queries', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
        search: 'wireless headphones',
      });

      expect(prisma.$queryRaw).toHaveBeenCalled();
      // Falls back to LIKE search when full-text returns no results
      expect(prisma.product.findMany).toHaveBeenCalled();
    });

    it('should return paginated results from full-text search', async () => {
      const mockRawRow = {
        id: 'clprod123456789012345678',
        name: 'Wireless Headphones',
        slug: 'wireless-headphones',
        price: '79.99',
        compare_price: null,
        stock: 25,
        is_active: true,
        is_featured: false,
        created_at: new Date(),
        category_id: 'clcat1234567890123456789',
        category_name: 'Electronics',
        category_slug: 'electronics',
        image_id: 'climg1234567890123456789',
        image_url: 'https://example.com/headphones.jpg',
        image_alt: 'Headphones',
        image_cloudinary_public_id: 'products/headphones-1',
        image_sort_order: 0,
        rank: 0.85,
        total_count: BigInt(1),
      };
      prisma.$queryRaw.mockResolvedValue([mockRawRow]);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
        search: 'wireless headphones',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Wireless Headphones');
      expect(result.data[0].category.name).toBe('Electronics');
      expect(result.data[0].images).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should return empty results from full-text search with no matches', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
        search: 'nonexistent product xyz',
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('should cache search results after LIKE fallback', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
        search: 'laptop',
      });

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('cache:products:list:'),
        expect.objectContaining({ data: [], meta: expect.any(Object) }),
        expect.any(Number),
      );
    });

    it('should handle full-text search with products that have no images', async () => {
      const mockRawRow = {
        id: 'clprod123456789012345678',
        name: 'Basic Laptop',
        slug: 'basic-laptop',
        price: '499.99',
        compare_price: '599.99',
        stock: 10,
        is_active: true,
        is_featured: true,
        created_at: new Date(),
        category_id: 'clcat1234567890123456789',
        category_name: 'Electronics',
        category_slug: 'electronics',
        image_id: null,
        image_url: null,
        image_alt: null,
        image_cloudinary_public_id: null,
        image_sort_order: null,
        rank: 0.6,
        total_count: BigInt(1),
      };
      prisma.$queryRaw.mockResolvedValue([mockRawRow]);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
        search: 'basic laptop',
      });

      expect(result.data[0].images).toHaveLength(0);
      expect(result.data[0].isFeatured).toBe(true);
    });

    it('should sort by specified field and order', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 10,
        sortBy: 'price',
        sortOrder: 'asc',
        isActive: true,
      });

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { price: 'asc' },
        }),
      );
    });
  });

  describe('findBySlug', () => {
    it('should return cached product on cache hit', async () => {
      cacheService.get.mockResolvedValue(mockProduct);

      const result = await service.findBySlug('iphone-15');

      expect(result).toEqual(mockProduct);
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });

    it('should return product by slug and cache it', async () => {
      prisma.product.findUnique.mockResolvedValue(mockProduct);

      const result = await service.findBySlug('iphone-15');

      expect(result).toEqual(mockProduct);
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { slug: 'iphone-15' },
        select: expect.objectContaining({ id: true, name: true, description: true }),
      });
      expect(cacheService.set).toHaveBeenCalledWith(
        'cache:products:detail:iphone-15',
        mockProduct,
        expect.any(Number),
      );
    });

    it('should throw NotFoundException if product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if product is inactive', async () => {
      prisma.product.findUnique.mockResolvedValue({ ...mockProduct, isActive: false });

      await expect(service.findBySlug('iphone-15')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = {
      name: 'iPhone 15',
      price: 999.99,
      categoryId: 'clcat1234567890123456789',
      stock: 50,
      isActive: true,
      isFeatured: false,
    };

    it('should create product with auto-generated slug', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: createDto.categoryId, isActive: true });
      prisma.product.findUnique.mockResolvedValue(null); // slug doesn't exist
      prisma.product.create.mockResolvedValue(mockProduct);

      const result = await service.create(createDto);

      expect(result).toEqual(mockProduct);
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'iPhone 15',
          slug: 'iphone-15',
          categoryId: createDto.categoryId,
        }),
        select: expect.objectContaining({ id: true }),
      });
    });

    it('should create product with nested images', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: createDto.categoryId, isActive: true });
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue(mockProduct);

      await service.create({
        ...createDto,
        images: [{ url: 'https://example.com/img.jpg', alt: 'Image' }],
      });

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          images: {
            create: [{ url: 'https://example.com/img.jpg', alt: 'Image', sortOrder: 0 }],
          },
        }),
        select: expect.objectContaining({ id: true }),
      });
    });

    it('should emit PRODUCT_CHANGED event after creation', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: createDto.categoryId, isActive: true });
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.product.create.mockResolvedValue(mockProduct);

      await service.create(createDto);

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        CacheEvents.PRODUCT_CHANGED,
        expect.objectContaining({ productId: mockProduct.id, action: 'create' }),
      );
    });

    it('should throw NotFoundException if category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);

      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if category is inactive', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: createDto.categoryId, isActive: false });

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);

      expect(prisma.product.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: mockProduct.id });
      const updated = { ...mockProduct, name: 'iPhone 16' };
      prisma.product.update.mockResolvedValue(updated);

      const result = await service.update(mockProduct.id, { name: 'iPhone 16' });

      expect(result).toEqual(updated);
    });

    it('should emit PRODUCT_CHANGED event after update', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: mockProduct.id });
      prisma.product.update.mockResolvedValue(mockProduct);

      await service.update(mockProduct.id, { name: 'iPhone 16' });

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        CacheEvents.PRODUCT_CHANGED,
        expect.objectContaining({ productId: mockProduct.id, action: 'update' }),
      );
    });

    it('should throw NotFoundException if product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow(NotFoundException);

      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('should validate category when categoryId is provided', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: mockProduct.id });
      prisma.category.findUnique.mockResolvedValue({ id: 'new-cat', isActive: true });
      prisma.product.update.mockResolvedValue(mockProduct);

      await service.update(mockProduct.id, { categoryId: 'new-cat' });

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'new-cat' },
        select: { id: true, isActive: true },
      });
    });

    it('should throw NotFoundException if new category does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: mockProduct.id });
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.update(mockProduct.id, { categoryId: 'bad-cat' })).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.product.update).not.toHaveBeenCalled();
    });

    it('should generate unique slug when slug is provided', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce({ id: mockProduct.id }) // find product
        .mockResolvedValueOnce(null); // slug doesn't exist
      prisma.product.update.mockResolvedValue({ ...mockProduct, slug: 'new-slug' });

      await service.update(mockProduct.id, { slug: 'new-slug' });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: mockProduct.id },
        data: expect.objectContaining({ slug: 'new-slug' }),
        select: expect.objectContaining({ id: true }),
      });
    });
  });

  describe('deactivate', () => {
    it('should deactivate active product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: mockProduct.id, isActive: true });
      prisma.product.update.mockResolvedValue({} as never);

      const result = await service.deactivate(mockProduct.id);

      expect(result).toEqual({ message: 'Product deactivated successfully' });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: mockProduct.id },
        data: { isActive: false },
      });
    });

    it('should emit PRODUCT_CHANGED event after deactivation', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: mockProduct.id, isActive: true });
      prisma.product.update.mockResolvedValue({} as never);

      await service.deactivate(mockProduct.id);

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        CacheEvents.PRODUCT_CHANGED,
        expect.objectContaining({ productId: mockProduct.id, action: 'deactivate' }),
      );
    });

    it('should throw NotFoundException if product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already deactivated', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: mockProduct.id, isActive: false });

      await expect(service.deactivate(mockProduct.id)).rejects.toThrow(BadRequestException);

      expect(prisma.product.update).not.toHaveBeenCalled();
    });
  });

  describe('hardDelete', () => {
    it('should permanently delete product and batch-delete cloudinary images', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: mockProduct.id,
        images: [
          { cloudinaryPublicId: 'products/img-1' },
          { cloudinaryPublicId: 'products/img-2' },
        ],
      });
      prisma.product.delete.mockResolvedValue({} as never);

      const result = await service.hardDelete(mockProduct.id);

      expect(result).toEqual({ message: 'Product permanently deleted' });
      expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: mockProduct.id } });
      expect(cloudinaryService.deleteImages).toHaveBeenCalledWith([
        'products/img-1',
        'products/img-2',
      ]);
    });

    it('should emit PRODUCT_CHANGED event after deletion', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: mockProduct.id,
        images: [],
      });
      prisma.product.delete.mockResolvedValue({} as never);

      await service.hardDelete(mockProduct.id);

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        CacheEvents.PRODUCT_CHANGED,
        expect.objectContaining({ productId: mockProduct.id, action: 'delete' }),
      );
    });

    it('should skip cloudinary cleanup when no images have publicIds', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: mockProduct.id,
        images: [{ cloudinaryPublicId: null }],
      });
      prisma.product.delete.mockResolvedValue({} as never);

      await service.hardDelete(mockProduct.id);

      expect(cloudinaryService.deleteImages).not.toHaveBeenCalled();
    });

    it('should not throw if cloudinary batch delete fails', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: mockProduct.id,
        images: [{ cloudinaryPublicId: 'products/img-1' }],
      });
      prisma.product.delete.mockResolvedValue({} as never);
      cloudinaryService.deleteImages.mockRejectedValue(new Error('Cloudinary error'));

      const result = await service.hardDelete(mockProduct.id);

      expect(result).toEqual({ message: 'Product permanently deleted' });
    });

    it('should throw NotFoundException if product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.hardDelete('nonexistent')).rejects.toThrow(NotFoundException);

      expect(prisma.product.delete).not.toHaveBeenCalled();
    });
  });

  describe('addImage', () => {
    it('should add image to product and return updated product', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce({ id: mockProduct.id, _count: { images: 2 } }) // exists check
        .mockResolvedValueOnce(mockProduct); // findById after create
      prisma.productImage.create.mockResolvedValue({} as never);

      const result = await service.addImage(mockProduct.id, {
        url: 'https://example.com/new.jpg',
        alt: 'New image',
      });

      expect(result).toEqual(mockProduct);
      expect(prisma.productImage.create).toHaveBeenCalledWith({
        data: {
          productId: mockProduct.id,
          url: 'https://example.com/new.jpg',
          alt: 'New image',
          sortOrder: 2,
        },
      });
    });

    it('should throw NotFoundException if product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.addImage('nonexistent', { url: 'https://example.com/img.jpg' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.productImage.create).not.toHaveBeenCalled();
    });
  });

  describe('uploadImage', () => {
    const mockFile = {
      buffer: Buffer.from('fake-image'),
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    it('should upload image to cloudinary and save to database', async () => {
      prisma.product.findUnique
        .mockResolvedValueOnce({ id: mockProduct.id, _count: { images: 1 } }) // exists check
        .mockResolvedValueOnce(mockProduct); // findById after create
      prisma.productImage.create.mockResolvedValue({} as never);

      const result = await service.uploadImage(mockProduct.id, mockFile, 'Alt text');

      expect(result).toEqual(mockProduct);
      expect(cloudinaryService.uploadImage).toHaveBeenCalledWith(mockFile.buffer, 'products');
      expect(prisma.productImage.create).toHaveBeenCalledWith({
        data: {
          productId: mockProduct.id,
          url: 'https://res.cloudinary.com/test/image/upload/test.jpg',
          cloudinaryPublicId: 'test-public-id',
          alt: 'Alt text',
          sortOrder: 1,
        },
      });
    });

    it('should cleanup cloudinary image if DB write fails', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: mockProduct.id,
        _count: { images: 0 },
      });
      prisma.productImage.create.mockRejectedValue(new Error('DB error'));

      await expect(service.uploadImage(mockProduct.id, mockFile)).rejects.toThrow('DB error');

      expect(cloudinaryService.deleteImage).toHaveBeenCalledWith('test-public-id');
    });

    it('should throw NotFoundException if product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.uploadImage('nonexistent', mockFile)).rejects.toThrow(NotFoundException);

      expect(cloudinaryService.uploadImage).not.toHaveBeenCalled();
    });
  });

  describe('removeImage', () => {
    it('should remove image and cleanup cloudinary', async () => {
      prisma.productImage.findUnique.mockResolvedValue({
        id: 'img-1',
        productId: mockProduct.id,
        cloudinaryPublicId: 'products/img-1',
      });
      prisma.productImage.delete.mockResolvedValue({} as never);
      prisma.product.findUnique.mockResolvedValue(mockProduct); // findById

      const result = await service.removeImage(mockProduct.id, 'img-1');

      expect(result).toEqual(mockProduct);
      expect(prisma.productImage.delete).toHaveBeenCalledWith({ where: { id: 'img-1' } });
      expect(cloudinaryService.deleteImage).toHaveBeenCalledWith('products/img-1');
    });

    it('should skip cloudinary cleanup for legacy URL-only images', async () => {
      prisma.productImage.findUnique.mockResolvedValue({
        id: 'img-1',
        productId: mockProduct.id,
        cloudinaryPublicId: null,
      });
      prisma.productImage.delete.mockResolvedValue({} as never);
      prisma.product.findUnique.mockResolvedValue(mockProduct);

      await service.removeImage(mockProduct.id, 'img-1');

      expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if image not found', async () => {
      prisma.productImage.findUnique.mockResolvedValue(null);

      await expect(service.removeImage(mockProduct.id, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.productImage.delete).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if image belongs to another product', async () => {
      prisma.productImage.findUnique.mockResolvedValue({
        id: 'img-1',
        productId: 'other-product',
        cloudinaryPublicId: null,
      });

      await expect(service.removeImage(mockProduct.id, 'img-1')).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.productImage.delete).not.toHaveBeenCalled();
    });
  });
});
