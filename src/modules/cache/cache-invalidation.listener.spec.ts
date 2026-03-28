import { Test } from '@nestjs/testing';
import { CacheInvalidationListener } from './cache-invalidation.listener';
import { CacheService } from './cache.service';
import { INVALIDATION_PREFIXES } from './cache.constants';
import { ProductChangedEvent, CategoryChangedEvent } from './cache.events';
import { createMockCacheService } from '../../../test/mocks/common.mock';

describe('CacheInvalidationListener', () => {
  let listener: CacheInvalidationListener;
  let cacheService: ReturnType<typeof createMockCacheService>;

  beforeEach(async () => {
    cacheService = createMockCacheService();

    const module = await Test.createTestingModule({
      providers: [CacheInvalidationListener, { provide: CacheService, useValue: cacheService }],
    }).compile();

    listener = module.get(CacheInvalidationListener);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleProductChanged', () => {
    it('should invalidate all product caches', async () => {
      const event = new ProductChangedEvent('product-1', 'create');

      await listener.handleProductChanged(event);

      expect(cacheService.invalidateByPrefix).toHaveBeenCalledWith(
        INVALIDATION_PREFIXES.ALL_PRODUCTS,
      );
    });
  });

  describe('handleCategoryChanged', () => {
    it('should invalidate all category caches', async () => {
      const event = new CategoryChangedEvent('category-1', 'update');

      await listener.handleCategoryChanged(event);

      expect(cacheService.invalidateByPrefix).toHaveBeenCalledWith(
        INVALIDATION_PREFIXES.ALL_CATEGORIES,
      );
    });
  });

  describe('handleOrderCreated', () => {
    it('should invalidate product caches on order creation', async () => {
      await listener.handleOrderCreated();

      expect(cacheService.invalidateByPrefix).toHaveBeenCalledWith(
        INVALIDATION_PREFIXES.ALL_PRODUCTS,
      );
    });
  });

  describe('handleOrderStatusChanged', () => {
    it('should invalidate product caches on order status change', async () => {
      await listener.handleOrderStatusChanged();

      expect(cacheService.invalidateByPrefix).toHaveBeenCalledWith(
        INVALIDATION_PREFIXES.ALL_PRODUCTS,
      );
    });
  });

  describe('handleLowStock', () => {
    it('should invalidate product caches on low stock', async () => {
      await listener.handleLowStock();

      expect(cacheService.invalidateByPrefix).toHaveBeenCalledWith(
        INVALIDATION_PREFIXES.ALL_PRODUCTS,
      );
    });
  });
});
