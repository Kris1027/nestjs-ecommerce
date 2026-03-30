import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, truncateAllTables } from './helpers/test-app.factory';
import { createAdminAndLogin } from './helpers/auth.helper';

/**
 * Products E2E Tests
 *
 * Tests public product browsing (listing, filtering, search, detail)
 * and admin product creation. Seeds a category first since products
 * require a categoryId foreign key.
 */
describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let categoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await truncateAllTables(prisma);

    // Every product test needs an admin + a category
    const admin = await createAdminAndLogin(app, {
      name: 'Admin',
      email: 'admin@example.com',
      password: 'Password123',
    });
    adminToken = admin.accessToken;

    const catRes = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Electronics' })
      .expect(201);

    categoryId = catRes.body.data.id;
  });

  /**
   * Helper to create a product via the admin API.
   * Returns the supertest Test object (not a Promise) so .expect() chains work.
   */
  function createProduct(overrides: Record<string, unknown> = {}): request.Test {
    const defaults = {
      name: 'Wireless Headphones',
      price: '99.99',
      categoryId,
      stock: 50,
      description: 'High quality wireless headphones',
    };

    return request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...defaults, ...overrides });
  }

  describe('Public endpoints', () => {
    it('GET /products should return paginated list', async () => {
      const response = await request(app.getHttpServer()).get('/products').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        meta: expect.objectContaining({
          total: expect.any(Number),
          page: expect.any(Number),
          limit: expect.any(Number),
        }),
      });
    });

    it('GET /products should filter by categoryId', async () => {
      // Create a product in our category
      await createProduct().expect(201);

      const response = await request(app.getHttpServer())
        .get(`/products?categoryId=${categoryId}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /products should search by name', async () => {
      await createProduct({ name: 'Bluetooth Speaker' }).expect(201);
      await createProduct({ name: 'USB Cable' }).expect(201);

      const response = await request(app.getHttpServer())
        .get('/products?search=bluetooth')
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].name).toBe('Bluetooth Speaker');
    });

    it('GET /products/:slug should return product detail', async () => {
      const createRes = await createProduct().expect(201);
      const slug = createRes.body.data.slug;

      const response = await request(app.getHttpServer()).get(`/products/${slug}`).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          name: 'Wireless Headphones',
          slug,
          price: expect.any(String),
          category: expect.objectContaining({
            name: 'Electronics',
          }),
        }),
      });
    });

    it('GET /products/:slug should return 404 for non-existent slug', async () => {
      await request(app.getHttpServer()).get('/products/does-not-exist').expect(404);
    });
  });

  describe('Admin endpoints', () => {
    it('POST /products should create a product', async () => {
      const response = await createProduct().expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          id: expect.any(String),
          name: 'Wireless Headphones',
          slug: 'wireless-headphones',
          description: 'High quality wireless headphones',
        }),
      });
    });

    it('POST /products should return 400 for missing required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'No Price Product' })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
      });
    });

    it('POST /products should return 400 for invalid categoryId', async () => {
      const response = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Bad Category Product',
          price: '10.00',
          categoryId: 'clxxxxxxxxxxxxxxxxxxxxxxxxx',
        })
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 404,
      });
    });
  });
});
