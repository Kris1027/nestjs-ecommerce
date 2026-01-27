import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate, env } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { IncomingMessage } from 'http';
import { randomUUID } from 'crypto';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),

    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'short',
          ttl: 1000,
          limit: 3,
        },
        {
          name: 'medium',
          ttl: 10000,
          limit: 20,
        },
        {
          name: 'long',
          ttl: 60000,
          limit: 100,
        },
      ],
    }),

    LoggerModule.forRoot({
      pinoHttp: {
        level: env.NODE_ENV === 'production' ? 'info' : 'debug',

        genReqId: (req: IncomingMessage) => {
          const existingId = req.headers['x-request-id'];
          if (existingId) {
            return existingId as string;
          }
          return randomUUID();
        },

        transport:
          env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'SYS:standard',
                },
              }
            : undefined,

        customAttributeKeys: {
          req: 'request',
          res: 'response',
          err: 'error',
          responseTime: 'duration',
          reqId: 'requestId',
        },

        serializers: {
          req: (req: { method: string; url: string }) => ({
            method: req.method,
            url: req.url,
          }),
          res: (res: { statusCode: number }) => ({
            statusCode: res.statusCode,
          }),
        },
      },
      exclude: [{ method: RequestMethod.ALL, path: 'health' }],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
