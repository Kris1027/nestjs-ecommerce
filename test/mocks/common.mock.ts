import { type ConfigService } from '@nestjs/config';
import { type JwtService } from '@nestjs/jwt';
import { type EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Mock ConfigService that returns predefined values
 * Extend the defaults object for test-specific config
 */
export function createMockConfigService(
  overrides: Record<string, unknown> = {},
): jest.Mocked<ConfigService> {
  const defaults: Record<string, unknown> = {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    JWT_SECRET: 'test-jwt-secret-key-for-testing-purposes-only',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-key-for-testing',
    JWT_REFRESH_EXPIRES_IN: '7d',
    STORE_URL: 'http://localhost:3002',
    ADMIN_URL: 'http://localhost:3001',
    REDIS_URL: 'redis://localhost:6379',
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
    CLOUDINARY_CLOUD_NAME: 'test-cloud',
    CLOUDINARY_API_KEY: 'test-api-key',
    CLOUDINARY_API_SECRET: 'test-api-secret',
    RESEND_API_KEY: 're_test_fake',
    EMAIL_FROM: 'test@example.com',
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => defaults[key]),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in defaults)) {
        throw new Error(`Config key "${key}" not found`);
      }
      return defaults[key];
    }),
  } as unknown as jest.Mocked<ConfigService>;
}

/**
 * Mock JwtService for authentication testing
 */
export function createMockJwtService(): jest.Mocked<JwtService> {
  return {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    verify: jest.fn().mockReturnValue({
      sub: 'user-id',
      email: 'test@example.com',
      role: 'CUSTOMER',
    }),
    verifyAsync: jest.fn().mockResolvedValue({
      sub: 'user-id',
      email: 'test@example.com',
      role: 'CUSTOMER',
    }),
    decode: jest.fn().mockReturnValue({
      sub: 'user-id',
      email: 'test@example.com',
      role: 'CUSTOMER',
    }),
  } as unknown as jest.Mocked<JwtService>;
}

/**
 * Mock EventEmitter2 for event-driven testing
 */
export function createMockEventEmitter(): jest.Mocked<EventEmitter2> {
  return {
    emit: jest.fn().mockReturnValue(true),
    emitAsync: jest.fn().mockResolvedValue([]),
    on: jest.fn().mockReturnThis(),
    once: jest.fn().mockReturnThis(),
    off: jest.fn().mockReturnThis(),
    removeListener: jest.fn().mockReturnThis(),
    removeAllListeners: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<EventEmitter2>;
}

/**
 * Mock EmailService for notification testing
 */
export function createMockEmailService(): {
  send: jest.Mock;
  sendToMany: jest.Mock;
} {
  return {
    send: jest.fn().mockResolvedValue(undefined),
    sendToMany: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Mock GuestCartService for auth testing
 */
export function createMockGuestCartService(): {
  mergeIntoUserCart: jest.Mock;
  getCart: jest.Mock;
  addItem: jest.Mock;
  updateItem: jest.Mock;
  removeItem: jest.Mock;
  clearCart: jest.Mock;
} {
  return {
    mergeIntoUserCart: jest.fn().mockResolvedValue(undefined),
    getCart: jest.fn().mockResolvedValue(null),
    addItem: jest.fn().mockResolvedValue({}),
    updateItem: jest.fn().mockResolvedValue({}),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clearCart: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Mock CloudinaryService for file upload testing
 */
export function createMockCloudinaryService(): {
  uploadImage: jest.Mock;
  deleteImage: jest.Mock;
  deleteImages: jest.Mock;
} {
  return {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://res.cloudinary.com/test/image/upload/test.jpg',
      publicId: 'test-public-id',
    }),
    deleteImage: jest.fn().mockResolvedValue(undefined),
    deleteImages: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Mock Stripe client for payment testing
 */
export function createMockStripeClient(): {
  paymentIntents: {
    create: jest.Mock;
    retrieve: jest.Mock;
    cancel: jest.Mock;
  };
  refunds: {
    create: jest.Mock;
  };
  webhooks: {
    constructEvent: jest.Mock;
  };
} {
  return {
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
  };
}

/**
 * Mock NotificationsService for listener testing
 */
export function createMockNotificationsService(): {
  notify: jest.Mock;
} {
  return { notify: jest.fn().mockResolvedValue(undefined) };
}

/**
 * Mock Logger for testing log output
 */
export function createMockLogger(): {
  log: jest.Mock;
  error: jest.Mock;
  warn: jest.Mock;
  debug: jest.Mock;
  verbose: jest.Mock;
} {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
}
