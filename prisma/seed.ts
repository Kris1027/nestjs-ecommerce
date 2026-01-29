import {
  PrismaClient,
  Role,
  AddressType,
  StockMovementType,
} from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../src/config/env.validation';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BCRYPT_ROUNDS = 12; // Must match PASSWORD_BCRYPT_ROUNDS in users.service.ts

async function main(): Promise<void> {
  console.log('Seeding database...');

  // ============================================
  // USERS
  // ============================================

  const adminPassword = await bcrypt.hash('Admin123!', BCRYPT_ROUNDS);
  const customerPassword = await bcrypt.hash('Customer123!', BCRYPT_ROUNDS);

  // admin@example.com / Admin123!
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: Role.ADMIN,
    },
  });

  // customer@example.com / Customer123!
  const customer = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      email: 'customer@example.com',
      password: customerPassword,
      firstName: 'Test',
      lastName: 'Customer',
      role: Role.CUSTOMER,
    },
  });

  console.log('Seeded users:', { admin: admin.email, customer: customer.email });

  // ============================================
  // ADDRESSES
  // ============================================

  const shippingAddress = await prisma.address.upsert({
    where: { id: 'seed-address-shipping' },
    update: {},
    create: {
      id: 'seed-address-shipping',
      userId: customer.id,
      type: AddressType.SHIPPING,
      isDefault: true,
      fullName: 'Test Customer',
      phone: '+48123456789',
      street: 'ul. Testowa 1',
      city: 'Warszawa',
      region: 'Mazowieckie',
      postalCode: '00-001',
      country: 'PL',
    },
  });

  const billingAddress = await prisma.address.upsert({
    where: { id: 'seed-address-billing' },
    update: {},
    create: {
      id: 'seed-address-billing',
      userId: customer.id,
      type: AddressType.BILLING,
      isDefault: true,
      fullName: 'Test Customer',
      phone: '+48123456789',
      street: 'ul. Testowa 1',
      city: 'Warszawa',
      region: 'Mazowieckie',
      postalCode: '00-001',
      country: 'PL',
    },
  });

  console.log('Seeded addresses:', {
    shippingAddress: shippingAddress.id,
    billingAddress: billingAddress.id,
  });

  // ============================================
  // CATEGORIES (hierarchical)
  // ============================================

  const electronics = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: {
      name: 'Electronics',
      slug: 'electronics',
      description: 'Electronic devices and accessories',
      sortOrder: 0,
    },
  });

  const phones = await prisma.category.upsert({
    where: { slug: 'phones' },
    update: {},
    create: {
      name: 'Phones',
      slug: 'phones',
      description: 'Smartphones and mobile phones',
      parentId: electronics.id,
      sortOrder: 0,
    },
  });

  const laptops = await prisma.category.upsert({
    where: { slug: 'laptops' },
    update: {},
    create: {
      name: 'Laptops',
      slug: 'laptops',
      description: 'Laptops and notebooks',
      parentId: electronics.id,
      sortOrder: 1,
    },
  });

  const clothing = await prisma.category.upsert({
    where: { slug: 'clothing' },
    update: {},
    create: {
      name: 'Clothing',
      slug: 'clothing',
      description: 'Apparel and fashion',
      sortOrder: 1,
    },
  });

  console.log('Seeded categories:', {
    electronics: electronics.slug,
    phones: phones.slug,
    laptops: laptops.slug,
    clothing: clothing.slug,
  });

  // ============================================
  // PRODUCTS (with images)
  // ============================================

  const iphone = await prisma.product.upsert({
    where: { slug: 'iphone-15-pro' },
    update: {},
    create: {
      name: 'iPhone 15 Pro',
      slug: 'iphone-15-pro',
      description: 'Latest iPhone with A17 Pro chip and titanium design.',
      price: 4999.99,
      comparePrice: 5499.99,
      sku: 'IPHONE-15-PRO',
      stock: 25,
      lowStockThreshold: 5,
      categoryId: phones.id,
      isFeatured: true,
      images: {
        create: [
          {
            url: 'https://placehold.co/800x800?text=iPhone+15+Pro+Front',
            alt: 'iPhone 15 Pro front view',
            sortOrder: 0,
          },
          {
            url: 'https://placehold.co/800x800?text=iPhone+15+Pro+Back',
            alt: 'iPhone 15 Pro back view',
            sortOrder: 1,
          },
        ],
      },
    },
  });

  const macbook = await prisma.product.upsert({
    where: { slug: 'macbook-pro-16' },
    update: {},
    create: {
      name: 'MacBook Pro 16"',
      slug: 'macbook-pro-16',
      description: 'Powerful laptop with M3 Max chip for professionals.',
      price: 12999.99,
      sku: 'MACBOOK-PRO-16',
      stock: 10,
      lowStockThreshold: 3,
      categoryId: laptops.id,
      isFeatured: true,
      images: {
        create: [
          {
            url: 'https://placehold.co/800x800?text=MacBook+Pro+16',
            alt: 'MacBook Pro 16 inch',
            sortOrder: 0,
          },
        ],
      },
    },
  });

  const galaxyS24 = await prisma.product.upsert({
    where: { slug: 'samsung-galaxy-s24' },
    update: {},
    create: {
      name: 'Samsung Galaxy S24',
      slug: 'samsung-galaxy-s24',
      description: 'Samsung flagship with Galaxy AI features.',
      price: 3999.99,
      comparePrice: 4299.99,
      sku: 'GALAXY-S24',
      stock: 30,
      lowStockThreshold: 5,
      categoryId: phones.id,
      images: {
        create: [
          {
            url: 'https://placehold.co/800x800?text=Galaxy+S24',
            alt: 'Samsung Galaxy S24',
            sortOrder: 0,
          },
        ],
      },
    },
  });

  const lowStockProduct = await prisma.product.upsert({
    where: { slug: 'pixel-9-pro' },
    update: {},
    create: {
      name: 'Google Pixel 9 Pro',
      slug: 'pixel-9-pro',
      description: 'Google Pixel with best-in-class camera and AI.',
      price: 4499.99,
      sku: 'PIXEL-9-PRO',
      stock: 2,
      lowStockThreshold: 5,
      categoryId: phones.id,
      images: {
        create: [
          {
            url: 'https://placehold.co/800x800?text=Pixel+9+Pro',
            alt: 'Google Pixel 9 Pro',
            sortOrder: 0,
          },
        ],
      },
    },
  });

  console.log('Seeded products:', {
    iphone: iphone.slug,
    macbook: macbook.slug,
    galaxyS24: galaxyS24.slug,
    lowStockProduct: lowStockProduct.slug,
  });

  // ============================================
  // STOCK MOVEMENTS (initial restock audit trail)
  // ============================================

  const productsToTrack = [
    { productId: iphone.id, stock: 25 },
    { productId: macbook.id, stock: 10 },
    { productId: galaxyS24.id, stock: 30 },
    { productId: lowStockProduct.id, stock: 2 },
  ];

  for (const { productId, stock } of productsToTrack) {
    await prisma.stockMovement.create({
      data: {
        productId,
        type: StockMovementType.RESTOCK,
        quantity: stock,
        reason: 'Initial inventory',
        stockBefore: 0,
        stockAfter: stock,
        userId: admin.id,
      },
    });
  }

  console.log('Seeded stock movements for', productsToTrack.length, 'products');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
