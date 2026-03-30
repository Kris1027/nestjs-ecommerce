import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { createTestApp } from './helpers/test-app.factory';

/**
 * Health Check E2E Tests
 *
 * Validates that liveness and readiness probes work against real
 * PostgreSQL and Redis instances. These are @Public() endpoints —
 * no authentication required.
 *
 * If these tests fail, the infrastructure (Docker services, test DB,
 * migrations) is broken — fix that before running other E2E suites.
 */
describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /health', () => {
    it('should return liveness status ok', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'ok',
        },
      });
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status with all indicators up', async () => {
      const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'ok',
          info: {
            database: { status: 'up' },
            redis: { status: 'up' },
            cache: { status: 'up' },
          },
        },
      });
    });
  });
});
