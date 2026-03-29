/**
 * Prisma Mock Factory
 *
 * Creates a mock PrismaClient for unit testing.
 * Each model has all standard Prisma methods as jest.fn()
 */

// All Prisma model methods we need to mock
const PRISMA_METHODS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
] as const;

// All models in your Prisma schema
const PRISMA_MODELS = [
  'user',
  'address',
  'refreshToken',
  'category',
  'product',
  'productImage',
  'stockMovement',
  'cart',
  'cartItem',
  'guestCart',
  'guestCartItem',
  'order',
  'orderItem',
  'payment',
  'webhookEvent',
  'review',
  'coupon',
  'couponUsage',
  'shippingMethod',
  'notification',
  'notificationPreference',
  'refundRequest',
  'taxRate',
] as const;

type PrismaMethod = (typeof PRISMA_METHODS)[number];
type PrismaModel = (typeof PRISMA_MODELS)[number];

// Type for mocked model - all methods are jest.Mock
type MockedModel = {
  [K in PrismaMethod]: jest.Mock;
};

// Type for the entire mock Prisma client
export type MockPrismaClient = {
  [K in PrismaModel]: MockedModel;
} & {
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
};

/**
 * Creates a mock PrismaClient with all models and methods as jest.fn()
 *
 * Usage in tests:
 * ```ts
 * const prisma = createMockPrismaClient();
 * prisma.user.findUnique.mockResolvedValue({ id: '1', email: 'test@test.com' });
 * ```
 */
export function createMockPrismaClient(): MockPrismaClient {
  const mockPrisma = {} as Record<string, unknown>;

  // Create mock methods for each model
  for (const model of PRISMA_MODELS) {
    const modelMock = {} as Record<string, jest.Mock>;
    for (const method of PRISMA_METHODS) {
      modelMock[method] = jest.fn();
    }
    mockPrisma[model] = modelMock;
  }

  // Add $transaction mock - handles both array and callback patterns
  mockPrisma['$transaction'] = jest.fn().mockImplementation((arg: unknown) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    if (typeof arg === 'function') {
      return (arg as (prisma: unknown) => unknown)(mockPrisma);
    }
    return Promise.resolve(arg);
  });

  // Add $queryRaw mock for raw SQL queries (e.g. full-text search)
  mockPrisma['$queryRaw'] = jest.fn().mockResolvedValue([]);

  // Add $connect and $disconnect mocks
  mockPrisma['$connect'] = jest.fn().mockResolvedValue(undefined);
  mockPrisma['$disconnect'] = jest.fn().mockResolvedValue(undefined);

  return mockPrisma as MockPrismaClient;
}

/**
 * Resets all mocks on a MockPrismaClient
 * Call this in beforeEach() to ensure clean state
 */
export function resetMockPrismaClient(prisma: MockPrismaClient): void {
  for (const model of PRISMA_MODELS) {
    const modelMock = prisma[model];
    for (const method of PRISMA_METHODS) {
      modelMock[method].mockReset();
    }
  }

  prisma.$queryRaw.mockReset();
  prisma.$queryRaw.mockResolvedValue([]);

  prisma.$connect.mockReset();
  prisma.$connect.mockResolvedValue(undefined);
  prisma.$disconnect.mockReset();
  prisma.$disconnect.mockResolvedValue(undefined);

  prisma.$transaction.mockReset();
  prisma.$transaction.mockImplementation((arg: unknown) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    if (typeof arg === 'function') {
      return (arg as (prisma: unknown) => unknown)(prisma);
    }
    return Promise.resolve(arg);
  });
}
