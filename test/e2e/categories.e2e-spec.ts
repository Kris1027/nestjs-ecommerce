import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, truncateAllTables } from './helpers/test-app.factory';
import { createAdminAndLogin, registerAndLogin } from './helpers/auth.helper';
import { api } from './helpers/api-path.helper';

/**
 * Categories E2E Tests
 *
 * Tests public category browsing and admin CRUD operations.
 * Validates RBAC enforcement: CUSTOMER cannot create/update/delete.
 */
describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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
  });

  describe('Public endpoints', () => {
    it('GET /categories should return paginated list', async () => {
      const response = await request(app.getHttpServer()).get(api('/categories')).expect(200);

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

    it('GET /categories/tree should return category hierarchy', async () => {
      const response = await request(app.getHttpServer()).get(api('/categories/tree')).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('GET /categories/:slug should return 404 for non-existent slug', async () => {
      const response = await request(app.getHttpServer())
        .get(api('/categories/non-existent-slug'))
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 404,
      });
    });

    it('GET /categories/:slug should return category by slug', async () => {
      // Seed a category via admin
      const { accessToken } = await createAdminAndLogin(app, {
        firstName: 'Admin',
        email: 'admin@example.com',
        password: 'Password123',
      });

      const createRes = await request(app.getHttpServer())
        .post(api('/categories'))
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Electronics' })
        .expect(201);

      const slug = createRes.body.data.slug;

      // Fetch by slug (public, no auth)
      const response = await request(app.getHttpServer())
        .get(api(`/categories/${slug}`))
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          name: 'Electronics',
          slug,
        }),
      });
    });
  });

  describe('RBAC enforcement', () => {
    it('POST /categories should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .post(api('/categories'))
        .send({ name: 'Test Category' })
        .expect(401);
    });

    it('POST /categories should return 403 for CUSTOMER role', async () => {
      const { accessToken } = await registerAndLogin(app, {
        firstName: 'Customer',
        email: 'customer@example.com',
        password: 'Password123',
      });

      await request(app.getHttpServer())
        .post(api('/categories'))
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Category' })
        .expect(403);
    });
  });

  describe('Admin CRUD', () => {
    let adminToken: string;

    beforeEach(async () => {
      const { accessToken } = await createAdminAndLogin(app, {
        firstName: 'Admin',
        email: 'admin@example.com',
        password: 'Password123',
      });
      adminToken = accessToken;
    });

    it('POST /categories should create a category', async () => {
      const response = await request(app.getHttpServer())
        .post(api('/categories'))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Electronics', description: 'Gadgets and devices' })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          id: expect.any(String),
          name: 'Electronics',
          slug: 'electronics',
          description: 'Gadgets and devices',
        }),
      });
    });

    it('PATCH /categories/:id should update a category', async () => {
      // Create first
      const createRes = await request(app.getHttpServer())
        .post(api('/categories'))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Electronics' })
        .expect(201);

      const categoryId = createRes.body.data.id;

      // Update
      const response = await request(app.getHttpServer())
        .patch(api(`/categories/${categoryId}`))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Electronics' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          id: categoryId,
          name: 'Updated Electronics',
        }),
      });
    });

    it('POST /categories/:id/deactivate should soft-delete', async () => {
      const createRes = await request(app.getHttpServer())
        .post(api('/categories'))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'To Deactivate' })
        .expect(201);

      const categoryId = createRes.body.data.id;

      const response = await request(app.getHttpServer())
        .post(api(`/categories/${categoryId}/deactivate`))
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'Category deactivated successfully',
        },
      });

      // Should not appear in public listing (which filters isActive: true)
      const listRes = await request(app.getHttpServer()).get(api('/categories')).expect(200);

      const slugs = listRes.body.data.map((c: { slug: string }) => c.slug);
      expect(slugs).not.toContain('to-deactivate');
    });

    it('DELETE /categories/:id should permanently delete', async () => {
      const createRes = await request(app.getHttpServer())
        .post(api('/categories'))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'To Delete' })
        .expect(201);

      const categoryId = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(api(`/categories/${categoryId}`))
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Should be gone entirely
      await request(app.getHttpServer()).get(api('/categories/to-delete')).expect(404);
    });
  });
});
