import { Test, type TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

function createMockProductsService(): Record<keyof ProductsService, jest.Mock> {
  return {
    findAll: jest.fn(),
    findBySlug: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    hardDelete: jest.fn(),
    addImage: jest.fn(),
    uploadImage: jest.fn(),
    reorderImages: jest.fn(),
    removeImage: jest.fn(),
  };
}

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: ReturnType<typeof createMockProductsService>;

  beforeEach(async () => {
    service = createMockProductsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
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
      const query = { page: 1, limit: 10, sortOrder: 'desc' as const };
      const expected = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      service.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(query as any);

      expect(service.findAll).toHaveBeenCalledWith({ ...query, isActive: true });
      expect(result).toEqual(expected);
    });
  });

  describe('findBySlug', () => {
    it('should call productsService.findBySlug with the slug', async () => {
      const expected = { id: '1', name: 'Wireless Headphones', slug: 'wireless-headphones' };
      service.findBySlug.mockResolvedValue(expected);

      const result = await controller.findBySlug('wireless-headphones');

      expect(service.findBySlug).toHaveBeenCalledWith('wireless-headphones');
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

      const result = await controller.findAllAdmin(query as any);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toEqual(expected);
    });
  });

  describe('create', () => {
    it('should call productsService.create with the DTO', async () => {
      const dto = { name: 'Wireless Headphones', price: '49.99', categoryId: 'cat1' };
      const expected = { id: '1', name: 'Wireless Headphones' };
      service.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('update', () => {
    it('should call productsService.update with id and DTO', async () => {
      const id = 'prod1';
      const dto = { name: 'Updated Headphones' };
      const expected = { id, name: 'Updated Headphones' };
      service.update.mockResolvedValue(expected);

      const result = await controller.update(id, dto as any);

      expect(service.update).toHaveBeenCalledWith(id, dto);
      expect(result).toEqual(expected);
    });
  });

  describe('deactivate', () => {
    it('should call productsService.deactivate with id', async () => {
      const id = 'prod1';
      const expected = { message: 'Product deactivated' };
      service.deactivate.mockResolvedValue(expected);

      const result = await controller.deactivate(id);

      expect(service.deactivate).toHaveBeenCalledWith(id);
      expect(result).toEqual(expected);
    });
  });

  describe('hardDelete', () => {
    it('should call productsService.hardDelete with id', async () => {
      const id = 'prod1';
      const expected = { message: 'Product deleted' };
      service.hardDelete.mockResolvedValue(expected);

      const result = await controller.hardDelete(id);

      expect(service.hardDelete).toHaveBeenCalledWith(id);
      expect(result).toEqual(expected);
    });
  });

  // ============================================
  // IMAGE ENDPOINTS
  // ============================================

  describe('addImage', () => {
    it('should call productsService.addImage with id and image data', async () => {
      const productId = 'prod1';
      const imageData = { url: 'https://example.com/image.jpg', alt: 'Product shot' };
      const expected = { id: 'img1', url: imageData.url, alt: imageData.alt };
      service.addImage.mockResolvedValue(expected);

      const result = await controller.addImage(productId, imageData);

      expect(service.addImage).toHaveBeenCalledWith(productId, imageData);
      expect(result).toEqual(expected);
    });
  });

  describe('uploadImage', () => {
    it('should call productsService.uploadImage with id, file, and alt text', async () => {
      const productId = 'prod1';
      const dto = { alt: 'Product photo' };
      const file = { buffer: Buffer.from('fake'), mimetype: 'image/jpeg' } as Express.Multer.File;
      const expected = { id: 'img1', url: 'https://res.cloudinary.com/test.jpg' };
      service.uploadImage.mockResolvedValue(expected);

      // Controller extracts dto.alt and passes it as a separate arg
      const result = await controller.uploadImage(productId, dto as any, file);

      expect(service.uploadImage).toHaveBeenCalledWith(productId, file, dto.alt);
      expect(result).toEqual(expected);
    });
  });

  describe('removeImage', () => {
    it('should call productsService.removeImage with productId and imageId', async () => {
      const productId = 'prod1';
      const imageId = 'img1';
      const expected = { id: productId, images: [] };
      service.removeImage.mockResolvedValue(expected);

      // Two @Param decorators — controller extracts both from the URL
      const result = await controller.removeImage(productId, imageId);

      expect(service.removeImage).toHaveBeenCalledWith(productId, imageId);
      expect(result).toEqual(expected);
    });
  });
});
