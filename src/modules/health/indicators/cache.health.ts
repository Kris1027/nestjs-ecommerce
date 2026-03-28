import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { CacheService } from '../../cache/cache.service';

const HEALTH_CHECK_KEY = 'health:cache:ping';
const HEALTH_CHECK_VALUE = 'pong';
const HEALTH_CHECK_TTL = 10_000;

@Injectable()
export class CacheHealthIndicator {
  private readonly logger = new Logger(CacheHealthIndicator.name);

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly cacheService: CacheService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.cacheService.set(HEALTH_CHECK_KEY, HEALTH_CHECK_VALUE, HEALTH_CHECK_TTL);
      const value = await this.cacheService.get<string>(HEALTH_CHECK_KEY);
      await this.cacheService.del(HEALTH_CHECK_KEY);

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
