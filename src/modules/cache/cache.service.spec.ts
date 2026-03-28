import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';
import { createMockConfigService } from '../../../test/mocks/common.mock';

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockPipeline = {
  del: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedisInstance = {
  scan: jest.fn(),
  pipeline: jest.fn().mockReturnValue(mockPipeline),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: ConfigService, useValue: createMockConfigService() },
      ],
    }).compile();

    service = module.get(CacheService);
  });

  describe('get', () => {
    it('should return cached value on hit', async () => {
      const cached = { id: '1', name: 'Test Product' };
      mockCacheManager.get.mockResolvedValue(cached);

      const result = await service.get('cache:products:detail:test');

      expect(result).toEqual(cached);
      expect(mockCacheManager.get).toHaveBeenCalledWith('cache:products:detail:test');
    });

    it('should return undefined on cache miss', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.get('cache:products:detail:missing');

      expect(result).toBeUndefined();
    });

    it('should return undefined on error without throwing', async () => {
      mockCacheManager.get.mockRejectedValue(new Error('Redis down'));

      const result = await service.get('cache:products:detail:test');

      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('should store value with custom TTL', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set('cache:products:detail:test', { id: '1' }, 300_000);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'cache:products:detail:test',
        { id: '1' },
        300_000,
      );
    });

    it('should store value with default TTL when not specified', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set('cache:products:detail:test', { id: '1' });

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'cache:products:detail:test',
        { id: '1' },
        undefined,
      );
    });

    it('should not throw on error', async () => {
      mockCacheManager.set.mockRejectedValue(new Error('Redis down'));

      await expect(service.set('cache:products:detail:test', { id: '1' })).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('should delete a single key', async () => {
      mockCacheManager.del.mockResolvedValue(undefined);

      await service.del('cache:products:detail:test');

      expect(mockCacheManager.del).toHaveBeenCalledWith('cache:products:detail:test');
    });

    it('should not throw on error', async () => {
      mockCacheManager.del.mockRejectedValue(new Error('Redis down'));

      await expect(service.del('cache:products:detail:test')).resolves.toBeUndefined();
    });
  });

  describe('invalidateByPrefix', () => {
    it('should scan and delete matching keys', async () => {
      mockRedisInstance.scan.mockResolvedValueOnce([
        '0',
        ['keyv:cache:products:list:a', 'keyv:cache:products:list:b'],
      ]);

      await service.invalidateByPrefix('cache:products:');

      expect(mockRedisInstance.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'keyv:cache:products:*',
        'COUNT',
        100,
      );
      expect(mockPipeline.del).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple SCAN iterations', async () => {
      mockRedisInstance.scan
        .mockResolvedValueOnce(['42', ['keyv:cache:products:list:a']])
        .mockResolvedValueOnce(['0', ['keyv:cache:products:list:b']]);

      await service.invalidateByPrefix('cache:products:');

      expect(mockRedisInstance.scan).toHaveBeenCalledTimes(2);
      expect(mockPipeline.del).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(2);
    });

    it('should handle no matching keys gracefully', async () => {
      mockRedisInstance.scan.mockResolvedValueOnce(['0', []]);

      await service.invalidateByPrefix('cache:products:');

      expect(mockPipeline.del).not.toHaveBeenCalled();
    });

    it('should not throw on error', async () => {
      mockRedisInstance.scan.mockRejectedValue(new Error('Redis down'));

      await expect(service.invalidateByPrefix('cache:products:')).resolves.toBeUndefined();
    });
  });
});
