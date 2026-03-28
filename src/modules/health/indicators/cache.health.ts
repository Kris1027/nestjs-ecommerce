import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';

const HEALTH_CHECK_KEY_PREFIX = 'health:cache:ping';
const HEALTH_CHECK_VALUE = 'pong';
const HEALTH_CHECK_TTL = 10_000;

@Injectable()
export class CacheHealthIndicator {
  private readonly logger = new Logger(CacheHealthIndicator.name);

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    const uniqueKey = `${HEALTH_CHECK_KEY_PREFIX}:${Date.now()}`;

    try {
      await this.cache.set(uniqueKey, HEALTH_CHECK_VALUE, HEALTH_CHECK_TTL);
      const value = await this.cache.get<string>(uniqueKey);
      await this.cache.del(uniqueKey);

      if (value !== HEALTH_CHECK_VALUE) {
        return indicator.down({ message: 'Cache read/write verification failed' });
      }

      return indicator.up();
    } catch (error) {
      this.logger.error('Cache health check failed', error instanceof Error ? error.stack : error);
      return indicator.down({ message: 'Cache connection failed' });
    }
  }
}
