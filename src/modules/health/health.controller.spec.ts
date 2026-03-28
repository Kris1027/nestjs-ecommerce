import { Test, type TestingModule } from '@nestjs/testing';
import { type HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { CacheHealthIndicator } from './indicators/cache.health';

function createMockHealthCheckService(): Record<keyof HealthCheckService, jest.Mock> {
  return {
    check: jest.fn(),
  } as unknown as Record<keyof HealthCheckService, jest.Mock>;
}

function createMockPrismaHealth(): Record<keyof PrismaHealthIndicator, jest.Mock> {
  return {
    isHealthy: jest.fn(),
  } as unknown as Record<keyof PrismaHealthIndicator, jest.Mock>;
}

function createMockRedisHealth(): Record<keyof RedisHealthIndicator, jest.Mock> {
  return {
    isHealthy: jest.fn(),
  } as unknown as Record<keyof RedisHealthIndicator, jest.Mock>;
}

function createMockCacheHealth(): Record<keyof CacheHealthIndicator, jest.Mock> {
  return {
    isHealthy: jest.fn(),
  } as unknown as Record<keyof CacheHealthIndicator, jest.Mock>;
}

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: ReturnType<typeof createMockHealthCheckService>;

  beforeEach(async () => {
    healthService = createMockHealthCheckService();
    const prismaHealth = createMockPrismaHealth();
    const redisHealth = createMockRedisHealth();
    const cacheHealth = createMockCacheHealth();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthService },
        { provide: PrismaHealthIndicator, useValue: prismaHealth },
        { provide: RedisHealthIndicator, useValue: redisHealth },
        { provide: CacheHealthIndicator, useValue: cacheHealth },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('checkLiveness', () => {
    it('should call health.check with empty array', async () => {
      const expected: HealthCheckResult = { status: 'ok', details: {}, info: {}, error: {} };
      healthService.check.mockResolvedValue(expected);

      const result = await controller.checkLiveness();

      // Liveness probe: no indicators, just checks if app is running
      expect(healthService.check).toHaveBeenCalledWith([]);
      expect(result).toEqual(expected);
    });
  });

  describe('checkReadiness', () => {
    it('should call health.check with database and redis indicators', async () => {
      const expected: HealthCheckResult = {
        status: 'ok',
        details: { database: { status: 'up' }, redis: { status: 'up' } },
        info: { database: { status: 'up' }, redis: { status: 'up' } },
        error: {},
      };
      healthService.check.mockResolvedValue(expected);

      const result = await controller.checkReadiness();

      // Readiness probe: passes indicator functions (3 of them: database, redis, cache)
      expect(healthService.check).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(Function), expect.any(Function), expect.any(Function)]),
      );
      expect(result).toEqual(expected);
    });
  });
});
