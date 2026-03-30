import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, truncateAllTables } from './helpers/test-app.factory';

/**
 * Auth E2E Tests
 *
 * Tests the full authentication lifecycle against real PostgreSQL:
 * register, login, token refresh, logout.
 *
 * All responses are wrapped by TransformInterceptor:
 *   Success: { success: true, data: {...}, timestamp }
 *   Error:   { success: false, statusCode, message, error, path, timestamp }
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const testUser = {
    email: 'test@example.com',
    password: 'Password123',
    firstName: 'Test',
    lastName: 'User',
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // Clean slate before each describe block
  beforeEach(async () => {
    await truncateAllTables(prisma);
  });

  describe('POST /auth/register', () => {
    it('should register a new user and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        },
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return 409 when email is already registered', async () => {
      // Register first time
      await request(app.getHttpServer()).post('/auth/register').send(testUser).expect(201);

      // Register same email again
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(409);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 409,
        message: 'Email already registered',
      });
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...testUser, email: 'not-an-email' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
      });
    });

    it('should return 400 for weak password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...testUser, password: 'short' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
      });
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Register a user for login tests
      await request(app.getHttpServer()).post('/auth/register').send(testUser);
    });

    it('should login with valid credentials and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        },
      });
    });

    it('should return 401 for wrong password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: 'WrongPassword123' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 401,
        message: 'Invalid email or password',
      });
    });

    it('should return 401 for non-existent email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'noone@example.com', password: 'Password123' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 401,
        message: 'Invalid email or password',
      });
    });

    it('should return 401 for deactivated user', async () => {
      // Deactivate the user directly in DB
      await prisma.$executeRaw`
        UPDATE users SET is_active = false WHERE email = ${testUser.email}
      `;

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 401,
        message: 'Account is deactivated',
      });
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Register and login to get a refresh token
      const registerRes = await request(app.getHttpServer()).post('/auth/register').send(testUser);

      refreshToken = registerRes.body.data.refreshToken;
    });

    it('should return new token pair with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        },
      });
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 401,
      });
    });
  });

  describe('POST /auth/logout', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const registerRes = await request(app.getHttpServer()).post('/auth/register').send(testUser);

      refreshToken = registerRes.body.data.refreshToken;
    });

    it('should invalidate the refresh token', async () => {
      // Logout
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'Logged out successfully',
        },
      });

      // Refresh should now fail
      await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(401);
    });
  });
});
