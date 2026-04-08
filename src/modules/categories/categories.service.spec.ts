import { Test, type TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CategoriesService } from './categories.service';
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
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

describe('CategoriesService', () => {
  let service: CategoriesService;
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
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CloudinaryService, useValue: cloudinaryService },
        { provide: CacheService, useValue: cacheService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    resetMockPrismaClient(prisma);
  });

  const mockCategory = {
    id: 'clcat1234567890123456789',
    name: 'Electronics',
    slug: 'electronics',
    description: 'Electronic devices and gadgets',
    imageUrl: 'https://example.com/electronics.jpg',
    cloudinaryPublicId: null,
    parentId: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return cached result on cache hit', async () => {
      const cachedResult = {
        data: [mockCategory],
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
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('should cache result on miss and return it', async () => {
      prisma.category.findMany.mockResolvedValue([mockCategory]);
      prisma.category.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 10, sortOrder: 'desc', isActive: true });

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('cache:categories:list:'),
        expect.objectContaining({ data: [mockCategory] }),
        expect.any(Number),
      );
    });

    it('should return paginated active categories', async () => {
      prisma.category.findMany.mockResolvedValue([mockCategory]);
      prisma.category.count.mockResolvedValue(1);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        sortOrder: 'desc',
        isActive: true,
      });

      expect(result.data).toEqual([mockCategory]);
      expect(result.meta).toEqual(expect.objectContaining({ total: 1, page: 1, limit: 10 }));
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          skip: 0,
          take: 10,
        }),
      );
    });
  });

  describe('findAllTree', () => {
    it('should return cached tree on cache hit', async () => {
      const cachedTree = [{ ...mockCategory, children: [] }];
      cacheService.get.mockResolvedValue(cachedTree);

      const result = await service.findAllTree();

      expect(result).toEqual(cachedTree);
      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('should cache tree on miss', async () => {
      prisma.category.findMany.mockResolvedValue([mockCategory]);

      await service.findAllTree();

      expect(cacheService.set).toHaveBeenCalledWith(
        'cache:categories:tree',
        expect.any(Array),
        expect.any(Number),
      );
    });

    it('should return hierarchical tree of active categories', async () => {
      const parent = { ...mockCategory };
      const child = {
        ...mockCategory,
        id: 'clcat_child_12345678901234',
        name: 'Smartphones',
        slug: 'smartphones',
        parentId: mockCategory.id,
      };
      prisma.category.findMany.mockResolvedValue([parent, child]);

      const result = await service.findAllTree();

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe(parent.id);
      expect(result[0]!.children).toHaveLength(1);
      expect(result[0]!.children[0]!.id).toBe(child.id);
    });

    it('should return multiple roots when no parent relationship', async () => {
      const cat1 = { ...mockCategory };
      const cat2 = { ...mockCategory, id: 'clcat2', name: 'Clothing', slug: 'clothing' };
      prisma.category.findMany.mockResolvedValue([cat1, cat2]);

      const result = await service.findAllTree();

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no categories exist', async () => {
      prisma.category.findMany.mockResolvedValue([]);

      const result = await service.findAllTree();

      expect(result).toEqual([]);
    });
  });

  describe('findBySlug', () => {
    it('should return cached category on cache hit', async () => {
      cacheService.get.mockResolvedValue(mockCategory);

      const result = await service.findBySlug('electronics');

      expect(result).toEqual(mockCategory);
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
    });

    it('should return category by slug and cache it', async () => {
      prisma.category.findUnique.mockResolvedValue(mockCategory);

      const result = await service.findBySlug('electronics');

      expect(result).toEqual(mockCategory);
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { slug: 'electronics' },
        select: expect.objectContaining({ id: true, name: true, slug: true }),
      });
      expect(cacheService.set).toHaveBeenCalledWith(
        'cache:categories:detail:electronics',
        mockCategory,
        expect.any(Number),
      );
    });

    it('should throw NotFoundException if category not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.findBySlug('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if category is inactive', async () => {
      prisma.category.findUnique.mockResolvedValue({ ...mockCategory, isActive: false });

      await expect(service.findBySlug('electronics')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create category with auto-generated slug', async () => {
      prisma.category.findUnique.mockResolvedValue(null); // slug doesn't exist
      prisma.category.create.mockResolvedValue(mockCategory);

      const result = await service.create({ name: 'Electronics', sortOrder: 0 });

      expect(result).toEqual(mockCategory);
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Electronics',
          slug: 'electronics',
        }),
        select: expect.objectContaining({ id: true }),
      });
    });

    it('should create category with custom slug', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue(mockCategory);

      await service.create({ name: 'Electronics', slug: 'custom-slug', sortOrder: 0 });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slug: 'custom-slug' }),
        select: expect.objectContaining({ id: true }),
      });
    });

    it('should validate parent category exists and is active', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(null) // validateUniqueName — no duplicate
        .mockResolvedValueOnce({ id: 'parent-1', isActive: true }); // validateParent
      prisma.category.create.mockResolvedValue(mockCategory);

      await service.create({
        name: 'Smartphones',
        parentId: 'parent-1',
        sortOrder: 0,
      });

      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { id: 'parent-1' },
        select: { id: true, isActive: true },
      });
    });

    it('should emit CATEGORY_CHANGED event after creation', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue(mockCategory);

      await service.create({ name: 'Electronics', sortOrder: 0 });

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        CacheEvents.CATEGORY_CHANGED,
        expect.objectContaining({ categoryId: mockCategory.id, action: 'create' }),
      );
    });

    it('should throw NotFoundException if parent does not exist', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(null) // validateUniqueName — no duplicate
        .mockResolvedValueOnce(null); // validateParent — not found

      await expect(
        service.create({ name: 'Child', parentId: 'nonexistent', sortOrder: 0 }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if parent is inactive', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce(null) // validateUniqueName — no duplicate
        .mockResolvedValueOnce({ id: 'parent-1', isActive: false }); // validateParent — inactive

      await expect(
        service.create({ name: 'Child', parentId: 'parent-1', sortOrder: 0 }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.category.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if category name already exists', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'existing-id' }); // validateUniqueName — duplicate found

      await expect(service.create({ name: 'Electronics', sortOrder: 0 })).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.category.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update category', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: mockCategory.id });
      const updated = { ...mockCategory, name: 'Updated Electronics' };
      prisma.category.update.mockResolvedValue(updated);

      const result = await service.update(mockCategory.id, { name: 'Updated Electronics' });

      expect(result).toEqual(updated);
    });

    it('should emit CATEGORY_CHANGED event after update', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: mockCategory.id });
      prisma.category.update.mockResolvedValue(mockCategory);

      await service.update(mockCategory.id, { name: 'Updated Electronics' });

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        CacheEvents.CATEGORY_CHANGED,
        expect.objectContaining({ categoryId: mockCategory.id, action: 'update' }),
      );
    });

    it('should throw NotFoundException if category not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow(NotFoundException);

      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if updating name to an existing name', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce({ id: mockCategory.id }) // find category being updated
        .mockResolvedValueOnce({ id: 'other-category-id' }); // validateUniqueName — different category owns this name

      await expect(service.update(mockCategory.id, { name: 'Existing Category' })).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if setting self as parent', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: mockCategory.id });

      await expect(service.update(mockCategory.id, { parentId: mockCategory.id })).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('should validate parent when parentId is provided', async () => {
      // First call: find the category being updated
      // Second call: validate parent exists
      prisma.category.findUnique
        .mockResolvedValueOnce({ id: mockCategory.id })
        .mockResolvedValueOnce({ id: 'parent-1', isActive: true });
      prisma.category.update.mockResolvedValue(mockCategory);

      await service.update(mockCategory.id, { parentId: 'parent-1' });

      expect(prisma.category.findUnique).toHaveBeenCalledTimes(2);
    });

    it('should allow setting parentId to null', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: mockCategory.id });
      prisma.category.update.mockResolvedValue({ ...mockCategory, parentId: null });

      await service.update(mockCategory.id, { parentId: null });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: expect.objectContaining({ parentId: null }),
        select: expect.objectContaining({ id: true }),
      });
    });

    it('should generate unique slug when slug is provided', async () => {
      prisma.category.findUnique
        .mockResolvedValueOnce({ id: mockCategory.id }) // find category
        .mockResolvedValueOnce(null); // slug doesn't exist
      prisma.category.update.mockResolvedValue({ ...mockCategory, slug: 'new-slug' });

      await service.update(mockCategory.id, { slug: 'new-slug' });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: expect.objectContaining({ slug: 'new-slug' }),
        select: expect.objectContaining({ id: true }),
      });
    });
  });

  describe('deactivate', () => {
    it('should deactivate active category', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: mockCategory.id, isActive: true });
      prisma.category.update.mockResolvedValue({} as never);

      const result = await service.deactivate(mockCategory.id);

      expect(result).toEqual({ message: 'Category deactivated successfully' });
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: { isActive: false },
      });
    });

    it('should emit CATEGORY_CHANGED event after deactivation', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: mockCategory.id, isActive: true });
      prisma.category.update.mockResolvedValue({} as never);

      await service.deactivate(mockCategory.id);

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        CacheEvents.CATEGORY_CHANGED,
        expect.objectContaining({ categoryId: mockCategory.id, action: 'deactivate' }),
      );
    });

    it('should throw NotFoundException if category not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already deactivated', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: mockCategory.id, isActive: false });

      await expect(service.deactivate(mockCategory.id)).rejects.toThrow(BadRequestException);

      expect(prisma.category.update).not.toHaveBeenCalled();
    });
  });

  describe('hardDelete', () => {
    it('should permanently delete category without cloudinary image', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: mockCategory.id,
        cloudinaryPublicId: null,
      });
      prisma.category.delete.mockResolvedValue({} as never);

      const result = await service.hardDelete(mockCategory.id);

      expect(result).toEqual({ message: 'Category permanently deleted' });
      expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: mockCategory.id } });
      expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();
    });

    it('should emit CATEGORY_CHANGED event after deletion', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: mockCategory.id,
        cloudinaryPublicId: null,
      });
      prisma.category.delete.mockResolvedValue({} as never);

      await service.hardDelete(mockCategory.id);

      expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
        CacheEvents.CATEGORY_CHANGED,
        expect.objectContaining({ categoryId: mockCategory.id, action: 'delete' }),
      );
    });

    it('should delete cloudinary image when present', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: mockCategory.id,
        cloudinaryPublicId: 'categories/test-id',
      });
      prisma.category.delete.mockResolvedValue({} as never);

      await service.hardDelete(mockCategory.id);

      expect(cloudinaryService.deleteImage).toHaveBeenCalledWith('categories/test-id');
    });

    it('should not throw if cloudinary cleanup fails', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: mockCategory.id,
        cloudinaryPublicId: 'categories/test-id',
      });
      prisma.category.delete.mockResolvedValue({} as never);
      cloudinaryService.deleteImage.mockRejectedValue(new Error('Cloudinary error'));

      const result = await service.hardDelete(mockCategory.id);

      expect(result).toEqual({ message: 'Category permanently deleted' });
    });

    it('should throw NotFoundException if category not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.hardDelete('nonexistent')).rejects.toThrow(NotFoundException);

      expect(prisma.category.delete).not.toHaveBeenCalled();
    });
  });

  describe('uploadImage', () => {
    const mockFile = {
      buffer: Buffer.from('fake-image'),
      originalname: 'test.jpg',
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    it('should upload image and update category', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: mockCategory.id,
        cloudinaryPublicId: null,
      });
      prisma.category.update.mockResolvedValue({
        ...mockCategory,
        imageUrl: 'https://res.cloudinary.com/test/image/upload/test.jpg',
        cloudinaryPublicId: 'test-public-id',
      });

      const result = await service.uploadImage(mockCategory.id, mockFile);

      expect(result.imageUrl).toBe('https://res.cloudinary.com/test/image/upload/test.jpg');
      expect(cloudinaryService.uploadImage).toHaveBeenCalledWith(mockFile.buffer, 'categories');
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: mockCategory.id },
        data: {
          imageUrl: 'https://res.cloudinary.com/test/image/upload/test.jpg',
          cloudinaryPublicId: 'test-public-id',
        },
        select: expect.objectContaining({ id: true }),
      });
    });

    it('should delete old cloudinary image after successful upload', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: mockCategory.id,
        cloudinaryPublicId: 'categories/old-id',
      });
      prisma.category.update.mockResolvedValue(mockCategory);

      await service.uploadImage(mockCategory.id, mockFile);

      expect(cloudinaryService.deleteImage).toHaveBeenCalledWith('categories/old-id');
    });

    it('should not delete old image if there was none', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: mockCategory.id,
        cloudinaryPublicId: null,
      });
      prisma.category.update.mockResolvedValue(mockCategory);

      await service.uploadImage(mockCategory.id, mockFile);

      expect(cloudinaryService.deleteImage).not.toHaveBeenCalled();
    });

    it('should cleanup new image if DB update fails', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: mockCategory.id,
        cloudinaryPublicId: null,
      });
      prisma.category.update.mockRejectedValue(new Error('DB error'));

      await expect(service.uploadImage(mockCategory.id, mockFile)).rejects.toThrow('DB error');

      expect(cloudinaryService.deleteImage).toHaveBeenCalledWith('test-public-id');
    });

    it('should throw NotFoundException if category not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.uploadImage('nonexistent', mockFile)).rejects.toThrow(NotFoundException);

      expect(cloudinaryService.uploadImage).not.toHaveBeenCalled();
    });
  });
});
