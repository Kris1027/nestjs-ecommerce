import { Test, type TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockMovementType } from '../../generated/prisma/client';

function createMockInventoryService(): Record<keyof InventoryService, jest.Mock> {
  return {
    getStock: jest.fn(),
    getMovementHistory: jest.fn(),
    adjustStock: jest.fn(),
    getAllProducts: jest.fn(),
    getLowStockProducts: jest.fn(),
    reserveStock: jest.fn(),
    releaseStock: jest.fn(),
    confirmSale: jest.fn(),
  };
}

describe('InventoryController', () => {
  let controller: InventoryController;
  let service: ReturnType<typeof createMockInventoryService>;

  const userId = 'user123';

  beforeEach(async () => {
    service = createMockInventoryService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [{ provide: InventoryService, useValue: service }],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProducts', () => {
    it('should call getAllProducts when filter is all', async () => {
      const query = { page: 1, limit: 10, sortOrder: 'desc' as const, filter: 'all' as const };
      const expected = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      service.getAllProducts.mockResolvedValue(expected);

      const result = await controller.getProducts(query);

      expect(service.getAllProducts).toHaveBeenCalledWith(query);
      expect(result).toEqual(expected);
    });

    it('should call getLowStockProducts when filter is low-stock', async () => {
      const query = {
        page: 1,
        limit: 10,
        sortOrder: 'desc' as const,
        filter: 'low-stock' as const,
      };
      const expected = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      service.getLowStockProducts.mockResolvedValue(expected);

      const result = await controller.getProducts(query);

      expect(service.getLowStockProducts).toHaveBeenCalledWith(query);
      expect(result).toEqual(expected);
    });
  });

  describe('getLowStockProducts', () => {
    it('should call inventoryService.getLowStockProducts with query', async () => {
      const query = { page: 1, limit: 10, sortOrder: 'desc' as const };
      const expected = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      service.getLowStockProducts.mockResolvedValue(expected);

      const result = await controller.getLowStockProducts(query);

      expect(service.getLowStockProducts).toHaveBeenCalledWith(query);
      expect(result).toEqual(expected);
    });
  });

  describe('getStock', () => {
    it('should call inventoryService.getStock with productId', async () => {
      const productId = 'prod1';
      const expected = { productId, stock: 50, reservedStock: 5 };
      service.getStock.mockResolvedValue(expected);

      const result = await controller.getStock(productId);

      expect(service.getStock).toHaveBeenCalledWith(productId);
      expect(result).toEqual(expected);
    });
  });

  describe('getMovementHistory', () => {
    it('should call inventoryService.getMovementHistory with productId and query', async () => {
      const productId = 'prod1';
      const query = { page: 1, limit: 10, sortOrder: 'desc' as const };
      const expected = { data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } };
      service.getMovementHistory.mockResolvedValue(expected);

      const result = await controller.getMovementHistory(productId, query);

      expect(service.getMovementHistory).toHaveBeenCalledWith(productId, query);
      expect(result).toEqual(expected);
    });
  });

  describe('adjustStock', () => {
    it('should destructure DTO and pass individual args with resolved enum', async () => {
      const productId = 'prod1';
      const dto = { quantity: 10, type: 'ADJUSTMENT' as const, reason: 'Inventory correction' };
      const expected = { productId, stock: 60, movement: { type: 'ADJUSTMENT' } };
      service.adjustStock.mockResolvedValue(expected);

      const result = await controller.adjustStock(productId, dto as any, userId);

      // Controller destructures DTO and resolves StockMovementType enum
      expect(service.adjustStock).toHaveBeenCalledWith(
        productId,
        dto.quantity,
        StockMovementType[dto.type],
        userId,
        dto.reason,
      );
      expect(result).toEqual(expected);
    });
  });
});
