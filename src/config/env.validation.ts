import { z } from 'zod';
import 'dotenv/config';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1),
    CORS_ORIGIN: z
      .string()
      .transform((val) => val.split(',').map((s) => s.trim()))
      .optional(),
    JWT_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
    RESEND_API_KEY: z.string().startsWith('re_'),
    EMAIL_FROM: z.email(),
    STORE_URL: z.url(),
    ADMIN_URL: z.url(),
    REDIS_URL: z.url(),
    DB_POOL_MAX: z.coerce.number().default(20),
    DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().default(300_000),
    DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().default(5_000),
  })
  .refine(
    (data) =>
      data.NODE_ENV !== 'production' ||
      (data.CORS_ORIGIN !== undefined && data.CORS_ORIGIN.length > 0),
    {
      message: 'CORS_ORIGIN is required in production (comma-separated URLs)',
      path: ['CORS_ORIGIN'],
    },
  );

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = z.treeifyError(result.error);
    throw new Error(`Environment validation failed: ${JSON.stringify(errors, null, 2)}`);
  }

  return result.data;
}

// Validated & typed env object - use this everywhere
export const env = validateEnv();

// NestJS ConfigModule validate function
export function validate(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errors = z.treeifyError(result.error);
    throw new Error(`Environment validation failed: ${JSON.stringify(errors, null, 2)}`);
  }

  return result.data;
}
