import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { PrismaService } from '../../../src/prisma/prisma.service';

/**
 * Registers a new user via the real /auth/register endpoint.
 * Returns the response body for assertion.
 *
 * Why use the real endpoint instead of direct Prisma insert?
 * Because E2E tests should exercise the full stack — validation,
 * password hashing, event emission, response transformation.
 */
export async function registerUser(
  app: INestApplication<App>,
  data: { name: string; email: string; password: string },
): Promise<request.Response> {
  return request(app.getHttpServer()).post('/auth/register').send(data);
}

/**
 * Logs in a user via the real /auth/login endpoint.
 * Returns the full response (check .body.data for tokens).
 */
export async function loginUser(
  app: INestApplication<App>,
  data: { email: string; password: string },
): Promise<request.Response> {
  return request(app.getHttpServer()).post('/auth/login').send(data);
}

/**
 * Registers a user and logs them in, returning the access token.
 *
 * Shortcut for tests that need an authenticated user but aren't
 * testing the auth flow itself. Skips email verification by
 * directly updating the database — in production, users must
 * verify their email before logging in.
 */
export async function registerAndLogin(
  app: INestApplication<App>,
  data: { name: string; email: string; password: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  // Register via real endpoint
  await registerUser(app, data);

  // Bypass email verification (E2E tests don't send real emails)
  const prisma = app.get(PrismaService);
  await prisma.$executeRaw`
    UPDATE users SET "emailVerified" = true WHERE email = ${data.email}
  `;

  // Login to get tokens
  const loginRes = await loginUser(app, {
    email: data.email,
    password: data.password,
  });

  return {
    accessToken: loginRes.body.data.accessToken,
    refreshToken: loginRes.body.data.refreshToken,
  };
}

/**
 * Creates an admin user by registering and then promoting via direct DB update.
 *
 * Why not a separate admin registration endpoint? There isn't one — the API
 * only creates CUSTOMER users via /auth/register. Admin promotion is a
 * database-level operation (as it should be in production too).
 */
export async function createAdminAndLogin(
  app: INestApplication<App>,
  data: { name: string; email: string; password: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  // Register and verify email
  await registerUser(app, data);

  const prisma = app.get(PrismaService);
  await prisma.$executeRaw`
    UPDATE users SET "emailVerified" = true, role = 'ADMIN' WHERE email = ${data.email}
  `;

  // Login to get admin tokens
  const loginRes = await loginUser(app, {
    email: data.email,
    password: data.password,
  });

  return {
    accessToken: loginRes.body.data.accessToken,
    refreshToken: loginRes.body.data.refreshToken,
  };
}
