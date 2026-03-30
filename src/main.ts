import { version } from '../package.json';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { env } from './config/env.validation';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';

/**
 * OWASP Top 10 Security Coverage
 *
 * A01 Broken Access Control — JWT + RolesGuard globally applied, @Public() opt-in only
 * A02 Cryptographic Failures — bcrypt 12 rounds, min 32-char JWT secrets, HSTS preload
 * A03 Injection — Prisma parameterized queries (incl. $queryRaw), Zod validation on all DTOs,
 *     HTML stripped from user-generated text at write-time (sanitize.util.ts)
 * A04 Insecure Design — Tiered rate limits per endpoint group, review moderation workflow
 * A05 Security Misconfiguration — Helmet with strict CSP/HSTS, CORS whitelist required in prod,
 *     Swagger disabled in production, env validation fails fast on missing/invalid config
 * A06 Vulnerable Components — Managed via pnpm audit (outside application code)
 * A07 Auth Failures — Token family rotation, strict auth rate limits (10/min), session revocation
 *     on password reset, email enumeration prevention (generic responses)
 * A08 Data Integrity — Stripe webhook signature verification, Zod schema validation
 * A09 Logging Failures — Pino structured logging with request IDs, 5xx logged with stack traces
 * A10 SSRF — No user-controlled URL fetching; images uploaded to Cloudinary via SDK
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  app.useLogger(app.get(Logger));

  app.use(
    helmet({
      // Strict CSP for production (JSON API — block all resource loading).
      // Disabled in dev/test because Swagger UI needs inline scripts and styles.
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'none'"],
                frameAncestors: ["'none'"],
              },
            }
          : false,
      strictTransportSecurity:
        env.NODE_ENV === 'production'
          ? { maxAge: 63072000, includeSubDomains: true, preload: true }
          : false,
    }),
  );

  app.enableCors({
    // In production, CORS_ORIGIN is required (enforced by env validation).
    // Accepts a comma-separated list of allowed origins (e.g., "https://store.com,https://admin.com").
    // In development, falls back to true (allow all) for convenience.
    origin: env.CORS_ORIGIN ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposedHeaders: ['x-guest-cart-token'],
  });

  app.use(compression());

  // Swagger setup — only available in development/test
  if (env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('NestJS Ecommerce API')
      .setDescription('Single-vendor ecommerce backend API')
      .setVersion(version)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT access token (15m expiry)',
        },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    const cleanedDocument = cleanupOpenApiDoc(document);

    SwaggerModule.setup('docs', app, cleanedDocument, {
      customSiteTitle: 'Ecommerce API Docs',
      jsonDocumentUrl: '/docs-json',
      yamlDocumentUrl: '/docs-yaml',
    });
  }

  app.enableShutdownHooks();

  await app.listen(env.PORT);
}
bootstrap().catch((err: Error) => {
  console.error('Failed to start application', err);
  process.exit(1);
});
