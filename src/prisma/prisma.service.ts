import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.validation';

const SLOW_QUERY_THRESHOLD_MS = 100;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS,
    });

    super({
      adapter,
      log:
        env.NODE_ENV === 'development'
          ? [
              { level: 'query', emit: 'event' },
              { level: 'warn', emit: 'stdout' },
              { level: 'error', emit: 'stdout' },
            ]
          : [
              { level: 'warn', emit: 'stdout' },
              { level: 'error', emit: 'stdout' },
            ],
    });
  }

  async onModuleInit(): Promise<void> {
    if (env.NODE_ENV === 'development') {
      // @ts-expect-error Prisma event types not fully typed with adapter pattern
      this.$on('query', (e: { query: string; duration: number; params: string }) => {
        if (e.duration > SLOW_QUERY_THRESHOLD_MS) {
          this.logger.warn(`SLOW QUERY (${e.duration}ms): ${e.query}`);
          this.logger.warn(`Params: ${e.params}`);
        }
      });
    }

    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
