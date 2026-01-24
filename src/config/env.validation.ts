import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  // CORS origin - required in production, optional in development
  CORS_ORIGIN: z.string().url().optional(),
});

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
