import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import type { Env } from '../../config/env.validation';
import { CacheService } from './cache.service';
import { CacheInvalidationListener } from './cache-invalidation.listener';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      isGlobal: true,
      useFactory: (configService: ConfigService<Env, true>) => {
        const redisUrl = configService.getOrThrow<string>('REDIS_URL');

        return {
          stores: [new KeyvRedis(redisUrl)],
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [CacheService, CacheInvalidationListener],
  exports: [CacheService],
})
export class AppCacheModule {}
