import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import Redis from 'ioredis';
import type { Env } from '../../config/env.validation';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    configService: ConfigService<Env, true>,
  ) {
    const redisUrl = configService.get('REDIS_URL');
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cache.get<T>(key);
      if (value !== undefined && value !== null) {
        this.logger.debug(`Cache HIT: ${key}`);
      }
      return value ?? undefined;
    } catch (error) {
      this.logger.warn(`Cache GET failed for key "${key}"`, error);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttl);
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl ?? 'default'}ms)`);
    } catch (error) {
      this.logger.warn(`Cache SET failed for key "${key}"`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
      this.logger.debug(`Cache DEL: ${key}`);
    } catch (error) {
      this.logger.warn(`Cache DEL failed for key "${key}"`, error);
    }
  }

  async invalidateByPrefix(prefix: string): Promise<void> {
    try {
      const pattern = `keyv:${prefix}*`;
      let cursor = '0';
      let totalDeleted = 0;

      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          const pipeline = this.redis.pipeline();
          for (const key of keys) {
            pipeline.del(key);
          }
          await pipeline.exec();
          totalDeleted += keys.length;
        }
      } while (cursor !== '0');

      this.logger.debug(`Cache INVALIDATE: prefix "${prefix}" — ${totalDeleted} keys deleted`);
    } catch (error) {
      this.logger.warn(`Cache INVALIDATE failed for prefix "${prefix}"`, error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const QUIT_TIMEOUT_MS = 1000;

    try {
      await Promise.race([
        this.redis.quit(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis quit timeout')), QUIT_TIMEOUT_MS),
        ),
      ]);
    } catch {
      this.redis.disconnect();
    }
  }
}
