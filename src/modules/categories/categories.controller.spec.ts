import { Test, type TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

function createMockCategoriesService(): Record<keyof CategoriesService, jest.Mock> {
  return {
    findAll: jest.fn(),
    findAllTree: jest.fn(),
    findBySlug: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    hardDelete: jest.fn(),
    uploadImage: jest.fn(),
  };
}

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: ReturnType<typeof createMockCategoriesService>;

  beforeEach(async () => {
    service = createMockCategoriesService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: service }],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ============================================
  // PUBLIC ENDPOINTS
  // ============================================

  describe('findAll', () => {
    it('should always pass isActive: true for public endpoint', async () => {
      const query = {
        page: 1,
        limit: 10,
        sortOrder: 'desc' as const,
        isActive: undefined as boolean | undefined,
      };
      const expected = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith({ ...query, isActive: true });
      expect(result).toEqual(expected);
    });
  });

  describe('findAllTree', () => {
    it('should call categoriesService.findAllTree', async () => {
      const expected = [{ id: '1', name: 'Electronics', children: [] }];
      service.findAllTree.mockResolvedValue(expected);

      const result = await controller.findAllTree();

      expect(service.findAllTree).toHaveBeenCalledWith();
      expect(result).toEqual(expected);
    });
  });

  describe('findBySlug', () => {
    it('should call categoriesService.findBySlug with the slug', async () => {
      const expected = { id: '1', name: 'Electronics', slug: 'electronics' };
      service.findBySlug.mockResolvedValue(expected);

      const result = await controller.findBySlug('electronics');

      expect(service.findBySlug).toHaveBeenCalledWith('electronics');
      expect(result).toEqual(expected);
    });
  });

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  describe('findAllAdmin', () => {
    it('should pass isActive filter through to service', async () => {
      const query = {
        page: 1,
        limit: 10,
        sortOrder: 'desc' as const,
        isActive: undefined as boolean | undefined,
      };
      const expected = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAllAdmin(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(expected);
    });
  });

  describe('create', () => {
    it('should call categoriesService.create with the DTO', async () => {
      const dto = { name: 'Electronics' };
      const expected = { id: '1', name: 'Electronics', slug: 'electronics' };
      service.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('update', () => {
    it('should call categoriesService.update with id and DTO', async () => {
      const id = 'clcat1234567890123456789';
      const dto = { name: 'Updated Electronics' };
      const expected = { id, name: 'Updated Electronics', slug: 'updated-electronics' };
      service.update.mockResolvedValue(expected);

      const result = await controller.update(id, dto as any);

      expect(service.update).toHaveBeenCalledWith(id, dto);
      expect(result).toEqual(expected);
    });
  });

  describe('deactivate', () => {
    it('should call categoriesService.deactivate with id', async () => {
      const id = 'clcat1234567890123456789';
      const expected = { id, isActive: false };
      service.deactivate.mockResolvedValue(expected);

      const result = await controller.deactivate(id);

      expect(service.deactivate).toHaveBeenCalledWith(id);
      expect(result).toEqual(expected);
    });
  });

  describe('hardDelete', () => {
    it('should call categoriesService.hardDelete with id', async () => {
      const id = 'clcat1234567890123456789';
      const expected = { id, name: 'Electronics' };
      service.hardDelete.mockResolvedValue(expected);

      const result = await controller.hardDelete(id);

      expect(service.hardDelete).toHaveBeenCalledWith(id);
      expect(result).toEqual(expected);
    });
  });

  describe('uploadImage', () => {
    it('should call categoriesService.uploadImage with id and file', async () => {
      const id = 'clcat1234567890123456789';
      const file = { buffer: Buffer.from('fake'), mimetype: 'image/jpeg' } as Express.Multer.File;
      const expected = { id, imageUrl: 'https://res.cloudinary.com/test.jpg' };
      service.uploadImage.mockResolvedValue(expected);

      const result = await controller.uploadImage(id, file);

      expect(service.uploadImage).toHaveBeenCalledWith(id, file);
      expect(result).toEqual(expected);
    });
  });
});
