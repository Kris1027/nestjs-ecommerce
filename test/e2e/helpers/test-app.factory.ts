import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { type App } from 'supertest/types';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../../../src/app.module';
import { EmailService } from '../../../src/modules/notifications/email.service';
import { CloudinaryService } from '../../../src/modules/cloudinary/cloudinary.service';
import { STRIPE } from '../../../src/modules/payments/payments.provider';
import { type PrismaService } from '../../../src/prisma/prisma.service';

/**
 * Creates a real NestJS application for E2E testing.
 *
 * What's real:
 * - Database (Prisma + PostgreSQL) — tests hit the actual test database
 * - Redis (cache + BullMQ) — tests use real Redis
 * - Guards, pipes, interceptors, filters — full middleware pipeline
 * - JWT authentication — real token generation and validation
 *
 * What's mocked:
 * - EmailService — no real emails sent
 * - CloudinaryService — no real image uploads
 * - Stripe — no real payment processing
 * - ThrottlerGuard — disabled so rapid test requests aren't rate-limited
 *
 * Why mock these specifically? They're third-party services that cost money,
 * require network access, and have side effects we can't undo.
 */
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    // Disable rate limiting — tests fire requests rapidly
    .overrideGuard(ThrottlerGuard)
    .useValue({ canActivate: () => true })

    // Mock email — no real emails in tests
    .overrideProvider(EmailService)
    .useValue({
      send: jest.fn().mockResolvedValue(undefined),
      sendToMany: jest.fn().mockResolvedValue(undefined),
    })

    // Mock Cloudinary — no real image uploads
    .overrideProvider(CloudinaryService)
    .useValue({
      uploadImage: jest.fn().mockResolvedValue({
        url: 'https://res.cloudinary.com/test/image/upload/test.jpg',
        publicId: 'test-public-id',
      }),
      deleteImage: jest.fn().mockResolvedValue(undefined),
      deleteImages: jest.fn().mockResolvedValue(undefined),
    })

    // Mock Stripe — no real payments
    .overrideProvider(STRIPE)
    .useValue({
      paymentIntents: {
        create: jest.fn().mockResolvedValue({
          id: 'pi_test_123',
          client_secret: 'pi_test_123_secret_456',
          status: 'requires_payment_method',
        }),
        retrieve: jest.fn().mockResolvedValue({
          id: 'pi_test_123',
          status: 'succeeded',
        }),
        cancel: jest.fn().mockResolvedValue({
          id: 'pi_test_123',
          status: 'canceled',
        }),
      },
      refunds: {
        create: jest.fn().mockResolvedValue({
          id: 're_test_123',
          status: 'succeeded',
        }),
      },
      webhooks: {
        constructEvent: jest.fn().mockReturnValue({
          id: 'evt_test_123',
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_test_123' } },
        }),
      },
    })

    .compile();

  const app = moduleFixture.createNestApplication();

  // Enable shutdown hooks so onModuleDestroy fires during app.close()
  // This prevents connection leaks between test suites
  app.enableShutdownHooks();

  await app.init();
  return app;
}

/**
 * Truncates all application tables (preserves Prisma migration history).
 *
 * Why TRUNCATE instead of DELETE? TRUNCATE is faster — it doesn't scan rows,
 * doesn't fire triggers, and resets auto-increment counters.
 *
 * Why CASCADE? Foreign key constraints would block truncation otherwise.
 * CASCADE propagates the truncation to dependent tables automatically.
 *
 * Call this in beforeAll() of each test suite to start with a clean slate.
 */
export async function truncateAllTables(prisma: PrismaService): Promise<void> {
  const tableNames = [
    'notification_preferences',
    'notifications',
    'reviews',
    'refund_requests',
    'payments',
    'webhook_events',
    'order_items',
    'orders',
    'coupon_usages',
    'coupons',
    'cart_items',
    'carts',
    'guest_cart_items',
    'guest_carts',
    'stock_movements',
    'product_images',
    'products',
    'categories',
    'addresses',
    'refresh_tokens',
    'users',
    'shipping_methods',
    'tax_rates',
  ];

  // Single TRUNCATE statement is faster than truncating one-by-one
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames.join(', ')} CASCADE`);
}
