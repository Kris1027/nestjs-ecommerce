import {
  PrismaClient,
  Role,
  AddressType,
  StockMovementType,
  OrderStatus,
  PaymentStatus,
  CouponType,
  ReviewStatus,
  RefundRequestStatus,
  NotificationType,
  NotificationChannel,
} from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../src/config/env.validation';
import * as bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker/locale/pl';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BCRYPT_ROUNDS = 12;

faker.seed(42);

// ============================================
// HELPERS
// ============================================

const polishCities = [
  { city: 'Warszawa', region: 'Mazowieckie', postalCode: '00-001' },
  { city: 'Kraków', region: 'Małopolskie', postalCode: '30-001' },
  { city: 'Wrocław', region: 'Dolnośląskie', postalCode: '50-001' },
  { city: 'Poznań', region: 'Wielkopolskie', postalCode: '60-001' },
  { city: 'Gdańsk', region: 'Pomorskie', postalCode: '80-001' },
  { city: 'Łódź', region: 'Łódzkie', postalCode: '90-001' },
  { city: 'Katowice', region: 'Śląskie', postalCode: '40-001' },
  { city: 'Lublin', region: 'Lubelskie', postalCode: '20-001' },
  { city: 'Szczecin', region: 'Zachodniopomorskie', postalCode: '70-001' },
  { city: 'Bydgoszcz', region: 'Kujawsko-Pomorskie', postalCode: '85-001' },
];

const polishStreets = [
  'ul. Marszałkowska',
  'ul. Nowy Świat',
  'ul. Floriańska',
  'ul. Piotrkowska',
  'ul. Długa',
  'ul. Świdnicka',
  'ul. Półwiejska',
  'al. Jerozolimskie',
  'ul. Krakowska',
  'ul. Zamkowa',
];

function randomPolishAddress() {
  const loc = faker.helpers.arrayElement(polishCities);
  const street = `${faker.helpers.arrayElement(polishStreets)} ${faker.number.int({ min: 1, max: 150 })}`;
  return { street, ...loc, country: 'PL' as const };
}

function generateOrderNumber(index: number): string {
  const date = faker.date.recent({ days: 90 });
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `ORD-${y}${m}${d}-${String(index).padStart(4, '0')}`;
}

async function main(): Promise<void> {
  console.log('Seeding database...');

  // ============================================
  // RESET — delete in reverse FK order
  // ============================================

  console.log('Clearing existing data...');
  await prisma.$transaction([
    prisma.notificationPreference.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.guestCartItem.deleteMany(),
    prisma.guestCart.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.cart.deleteMany(),
    prisma.review.deleteMany(),
    prisma.refundRequest.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.couponUsage.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.productImage.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.shippingMethod.deleteMany(),
    prisma.taxRate.deleteMany(),
    prisma.address.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  console.log('Data cleared.');

  // ============================================
  // 1. USERS (1 admin + 19 customers)
  // ============================================

  const adminPassword = await bcrypt.hash('Admin123!', BCRYPT_ROUNDS);
  const customerPassword = await bcrypt.hash('Customer123!', BCRYPT_ROUNDS);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: Role.ADMIN,
      emailVerifiedAt: new Date(),
    },
  });

  const customerData = Array.from({ length: 19 }, (_, i) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const isInactive = i >= 17; // last 2 are inactive
    const isUnverified = i >= 15 && i < 17; // 2 unverified
    return {
      email:
        i === 0
          ? 'customer@example.com'
          : faker.internet.email({ firstName, lastName }).toLowerCase(),
      password: customerPassword,
      firstName,
      lastName,
      role: Role.CUSTOMER as Role,
      isActive: !isInactive,
      emailVerifiedAt: isUnverified ? null : faker.date.past({ years: 1 }),
    };
  });

  const customers = await Promise.all(customerData.map((data) => prisma.user.create({ data })));

  console.log(`Seeded ${1 + customers.length} users`);

  // ============================================
  // 2. ADDRESSES (~30, 1-2 per customer)
  // ============================================

  const addresses: Awaited<ReturnType<typeof prisma.address.create>>[] = [];

  for (const customer of customers) {
    const addr = randomPolishAddress();
    const shipping = await prisma.address.create({
      data: {
        userId: customer.id,
        type: AddressType.SHIPPING,
        isDefault: true,
        fullName: `${customer.firstName} ${customer.lastName}`,
        phone: `+48${faker.string.numeric(9)}`,
        ...addr,
      },
    });
    addresses.push(shipping);

    // ~60% of customers also have a billing address
    if (faker.number.float() < 0.6) {
      const billingAddr = randomPolishAddress();
      const billing = await prisma.address.create({
        data: {
          userId: customer.id,
          type: AddressType.BILLING,
          isDefault: true,
          fullName: `${customer.firstName} ${customer.lastName}`,
          phone: `+48${faker.string.numeric(9)}`,
          ...billingAddr,
        },
      });
      addresses.push(billing);
    }
  }

  console.log(`Seeded ${addresses.length} addresses`);

  // ============================================
  // 3. CATEGORIES (3 top-level + 5 children)
  // ============================================

  const electronics = await prisma.category.create({
    data: {
      name: 'Electronics',
      slug: 'electronics',
      description: 'Electronic devices and accessories',
      sortOrder: 0,
    },
  });

  const clothing = await prisma.category.create({
    data: {
      name: 'Clothing',
      slug: 'clothing',
      description: 'Apparel and fashion',
      sortOrder: 1,
    },
  });

  const homeGarden = await prisma.category.create({
    data: {
      name: 'Home & Garden',
      slug: 'home-garden',
      description: 'Furniture, decor, and garden supplies',
      sortOrder: 2,
    },
  });

  const phones = await prisma.category.create({
    data: {
      name: 'Phones',
      slug: 'phones',
      description: 'Smartphones and mobile phones',
      parentId: electronics.id,
      sortOrder: 0,
    },
  });

  const laptops = await prisma.category.create({
    data: {
      name: 'Laptops',
      slug: 'laptops',
      description: 'Laptops and notebooks',
      parentId: electronics.id,
      sortOrder: 1,
    },
  });

  const menswear = await prisma.category.create({
    data: {
      name: "Men's Clothing",
      slug: 'mens-clothing',
      description: "Men's apparel and accessories",
      parentId: clothing.id,
      sortOrder: 0,
    },
  });

  const womenswear = await prisma.category.create({
    data: {
      name: "Women's Clothing",
      slug: 'womens-clothing',
      description: "Women's apparel and accessories",
      parentId: clothing.id,
      sortOrder: 1,
    },
  });

  const furniture = await prisma.category.create({
    data: {
      name: 'Furniture',
      slug: 'furniture',
      description: 'Indoor and outdoor furniture',
      parentId: homeGarden.id,
      sortOrder: 0,
    },
  });

  console.log('Seeded 8 categories');

  // ============================================
  // 4. PRODUCTS + IMAGES (~15 products, ~25 images)
  // ============================================

  const productDefs = [
    {
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
      images: [
        {
          url: 'https://placehold.co/800x800?text=iPhone+15+Pro+Front',
          alt: 'iPhone 15 Pro front view',
        },
        {
          url: 'https://placehold.co/800x800?text=iPhone+15+Pro+Back',
          alt: 'iPhone 15 Pro back view',
        },
      ],
    },
    {
      name: 'Samsung Galaxy S24',
      slug: 'samsung-galaxy-s24',
      description: 'Samsung flagship with Galaxy AI features.',
      price: 3999.99,
      comparePrice: 4299.99,
      sku: 'GALAXY-S24',
      stock: 30,
      lowStockThreshold: 5,
      categoryId: phones.id,
      isFeatured: true,
      images: [
        { url: 'https://placehold.co/800x800?text=Galaxy+S24', alt: 'Samsung Galaxy S24' },
        {
          url: 'https://placehold.co/800x800?text=Galaxy+S24+Back',
          alt: 'Samsung Galaxy S24 back',
        },
      ],
    },
    {
      name: 'Google Pixel 9 Pro',
      slug: 'pixel-9-pro',
      description: 'Google Pixel with best-in-class camera and AI.',
      price: 4499.99,
      sku: 'PIXEL-9-PRO',
      stock: 2,
      lowStockThreshold: 5,
      categoryId: phones.id,
      isFeatured: false,
      images: [{ url: 'https://placehold.co/800x800?text=Pixel+9+Pro', alt: 'Google Pixel 9 Pro' }],
    },
    {
      name: 'MacBook Pro 16"',
      slug: 'macbook-pro-16',
      description: 'Powerful laptop with M3 Max chip for professionals.',
      price: 12999.99,
      sku: 'MACBOOK-PRO-16',
      stock: 10,
      lowStockThreshold: 3,
      categoryId: laptops.id,
      isFeatured: true,
      images: [
        { url: 'https://placehold.co/800x800?text=MacBook+Pro+16', alt: 'MacBook Pro 16 inch' },
        { url: 'https://placehold.co/800x800?text=MacBook+Pro+Side', alt: 'MacBook Pro side view' },
      ],
    },
    {
      name: 'Lenovo ThinkPad X1 Carbon',
      slug: 'thinkpad-x1-carbon',
      description: 'Business ultrabook with legendary keyboard.',
      price: 7499.99,
      comparePrice: 7999.99,
      sku: 'THINKPAD-X1',
      stock: 15,
      lowStockThreshold: 3,
      categoryId: laptops.id,
      isFeatured: false,
      images: [{ url: 'https://placehold.co/800x800?text=ThinkPad+X1', alt: 'ThinkPad X1 Carbon' }],
    },
    {
      name: 'Dell XPS 15',
      slug: 'dell-xps-15',
      description: 'InfinityEdge display with 12th gen Intel.',
      price: 6499.99,
      sku: 'DELL-XPS-15',
      stock: 0,
      lowStockThreshold: 3,
      categoryId: laptops.id,
      isFeatured: false,
      isActive: false,
      images: [{ url: 'https://placehold.co/800x800?text=Dell+XPS+15', alt: 'Dell XPS 15' }],
    },
    {
      name: 'Classic Oxford Shirt',
      slug: 'classic-oxford-shirt',
      description: 'Slim-fit cotton Oxford shirt in light blue.',
      price: 199.99,
      comparePrice: 249.99,
      sku: 'OXFORD-SHIRT-M',
      stock: 50,
      lowStockThreshold: 10,
      categoryId: menswear.id,
      isFeatured: true,
      images: [
        { url: 'https://placehold.co/800x800?text=Oxford+Shirt', alt: 'Classic Oxford Shirt' },
        { url: 'https://placehold.co/800x800?text=Oxford+Detail', alt: 'Oxford Shirt detail' },
      ],
    },
    {
      name: 'Wool Blend Overcoat',
      slug: 'wool-blend-overcoat',
      description: 'Double-breasted wool blend overcoat in charcoal.',
      price: 899.99,
      sku: 'OVERCOAT-CHAR',
      stock: 8,
      lowStockThreshold: 3,
      categoryId: menswear.id,
      isFeatured: false,
      images: [
        { url: 'https://placehold.co/800x800?text=Wool+Overcoat', alt: 'Wool Blend Overcoat' },
      ],
    },
    {
      name: 'Silk Midi Dress',
      slug: 'silk-midi-dress',
      description: 'Elegant silk midi dress with floral print.',
      price: 599.99,
      comparePrice: 799.99,
      sku: 'SILK-DRESS-F',
      stock: 12,
      lowStockThreshold: 3,
      categoryId: womenswear.id,
      isFeatured: true,
      images: [
        { url: 'https://placehold.co/800x800?text=Silk+Dress', alt: 'Silk Midi Dress' },
        { url: 'https://placehold.co/800x800?text=Silk+Dress+Back', alt: 'Silk Midi Dress back' },
      ],
    },
    {
      name: 'Cashmere Sweater',
      slug: 'cashmere-sweater',
      description: 'Ultra-soft cashmere crew neck sweater.',
      price: 449.99,
      sku: 'CASHMERE-SW',
      stock: 20,
      lowStockThreshold: 5,
      categoryId: womenswear.id,
      isFeatured: false,
      images: [
        { url: 'https://placehold.co/800x800?text=Cashmere+Sweater', alt: 'Cashmere Sweater' },
      ],
    },
    {
      name: 'Denim Jacket',
      slug: 'denim-jacket',
      description: 'Vintage wash denim jacket, unisex fit.',
      price: 349.99,
      sku: 'DENIM-JKT',
      stock: 3,
      lowStockThreshold: 5,
      categoryId: menswear.id,
      isFeatured: false,
      images: [{ url: 'https://placehold.co/800x800?text=Denim+Jacket', alt: 'Denim Jacket' }],
    },
    {
      name: 'Scandinavian Desk',
      slug: 'scandinavian-desk',
      description: 'Minimalist oak desk with cable management.',
      price: 1299.99,
      comparePrice: 1499.99,
      sku: 'SCAND-DESK',
      stock: 6,
      lowStockThreshold: 2,
      categoryId: furniture.id,
      isFeatured: true,
      images: [
        { url: 'https://placehold.co/800x800?text=Scand+Desk', alt: 'Scandinavian Desk' },
        {
          url: 'https://placehold.co/800x800?text=Scand+Desk+Side',
          alt: 'Scandinavian Desk side view',
        },
      ],
    },
    {
      name: 'Ergonomic Office Chair',
      slug: 'ergonomic-office-chair',
      description: 'Mesh-back ergonomic chair with lumbar support.',
      price: 1899.99,
      sku: 'ERGO-CHAIR',
      stock: 4,
      lowStockThreshold: 2,
      categoryId: furniture.id,
      isFeatured: false,
      images: [
        { url: 'https://placehold.co/800x800?text=Ergo+Chair', alt: 'Ergonomic Office Chair' },
      ],
    },
    {
      name: 'Velvet Sofa',
      slug: 'velvet-sofa',
      description: 'Mid-century modern velvet sofa in emerald green.',
      price: 3499.99,
      sku: 'VELVET-SOFA',
      stock: 0,
      lowStockThreshold: 1,
      categoryId: furniture.id,
      isFeatured: false,
      isActive: false,
      images: [{ url: 'https://placehold.co/800x800?text=Velvet+Sofa', alt: 'Velvet Sofa' }],
    },
    {
      name: 'OnePlus 12',
      slug: 'oneplus-12',
      description: 'Flagship killer with Snapdragon 8 Gen 3.',
      price: 3499.99,
      sku: 'ONEPLUS-12',
      stock: 18,
      lowStockThreshold: 5,
      categoryId: phones.id,
      isFeatured: false,
      images: [{ url: 'https://placehold.co/800x800?text=OnePlus+12', alt: 'OnePlus 12' }],
    },
  ];

  const products: Awaited<ReturnType<typeof prisma.product.create>>[] = [];

  for (const def of productDefs) {
    const { images, ...productData } = def;
    const product = await prisma.product.create({
      data: {
        ...productData,
        images: {
          create: images.map((img, i) => ({ ...img, sortOrder: i })),
        },
      },
    });
    products.push(product);
  }

  const totalImages = productDefs.reduce((sum, p) => sum + p.images.length, 0);
  console.log(`Seeded ${products.length} products with ${totalImages} images`);

  // ============================================
  // 5. STOCK MOVEMENTS (~30)
  // ============================================

  const stockMovements: Parameters<typeof prisma.stockMovement.create>[0]['data'][] = [];

  // Initial restocks for all products
  for (const product of products) {
    if (product.stock > 0) {
      stockMovements.push({
        productId: product.id,
        type: StockMovementType.RESTOCK,
        quantity: product.stock + 10, // originally had more
        reason: 'Initial inventory',
        stockBefore: 0,
        stockAfter: product.stock + 10,
        userId: admin.id,
      });
    }
  }

  // Some adjustments and sales
  const activeProducts = products.filter((p) => p.stock > 0);
  for (let i = 0; i < 8; i++) {
    const product = faker.helpers.arrayElement(activeProducts);
    const type = faker.helpers.arrayElement([
      StockMovementType.SALE,
      StockMovementType.ADJUSTMENT,
      StockMovementType.RETURN,
    ]);
    const qty =
      type === StockMovementType.SALE
        ? -faker.number.int({ min: 1, max: 3 })
        : type === StockMovementType.RETURN
          ? faker.number.int({ min: 1, max: 2 })
          : -faker.number.int({ min: 1, max: 5 });

    stockMovements.push({
      productId: product.id,
      type,
      quantity: qty,
      reason:
        type === StockMovementType.SALE
          ? 'Order fulfillment'
          : type === StockMovementType.RETURN
            ? 'Customer return'
            : 'Inventory adjustment',
      stockBefore: product.stock,
      stockAfter: product.stock + qty,
      userId: type === StockMovementType.SALE ? null : admin.id,
    });
  }

  for (const data of stockMovements) {
    await prisma.stockMovement.create({ data });
  }

  console.log(`Seeded ${stockMovements.length} stock movements`);

  // ============================================
  // 6. SHIPPING METHODS + TAX RATES
  // ============================================

  const shippingStandard = await prisma.shippingMethod.create({
    data: {
      name: 'Standard Shipping',
      description: 'Delivered in 3-5 business days',
      basePrice: 14.99,
      freeShippingThreshold: 200.0,
      estimatedDays: '3-5 business days',
      sortOrder: 0,
    },
  });

  const shippingExpress = await prisma.shippingMethod.create({
    data: {
      name: 'Express Shipping',
      description: 'Delivered in 1-2 business days',
      basePrice: 29.99,
      freeShippingThreshold: 500.0,
      estimatedDays: '1-2 business days',
      sortOrder: 1,
    },
  });

  await prisma.shippingMethod.create({
    data: {
      name: 'Next-Day Delivery',
      description: 'Delivered next business day',
      basePrice: 49.99,
      estimatedDays: 'Next business day',
      sortOrder: 2,
    },
  });

  await prisma.taxRate.create({
    data: {
      name: 'Standard VAT',
      rate: 0.23,
      isDefault: true,
    },
  });

  await prisma.taxRate.create({
    data: {
      name: 'Reduced VAT',
      rate: 0.08,
      isDefault: false,
    },
  });

  console.log('Seeded 3 shipping methods + 2 tax rates');

  // ============================================
  // 7. COUPONS (5)
  // ============================================

  const now = new Date();
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const oneMonthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const twoMonthsFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const couponSummer = await prisma.coupon.create({
    data: {
      code: 'SUMMER2026',
      description: 'Summer sale — 15% off',
      type: CouponType.PERCENTAGE,
      value: 15.0,
      minimumOrderAmount: 100.0,
      maximumDiscount: 500.0,
      usageLimit: 100,
      usageLimitPerUser: 1,
      usageCount: 5,
      validFrom: oneMonthAgo,
      validUntil: twoMonthsFromNow,
      isActive: true,
    },
  });

  const couponWelcome = await prisma.coupon.create({
    data: {
      code: 'WELCOME50',
      description: 'New customer — 50 PLN off',
      type: CouponType.FIXED_AMOUNT,
      value: 50.0,
      minimumOrderAmount: 200.0,
      usageLimit: 50,
      usageLimitPerUser: 1,
      usageCount: 12,
      validFrom: oneMonthAgo,
      validUntil: oneMonthFromNow,
      isActive: true,
    },
  });

  await prisma.coupon.create({
    data: {
      code: 'EXPIRED10',
      description: 'Expired promo — 10% off',
      type: CouponType.PERCENTAGE,
      value: 10.0,
      usageLimit: 20,
      usageCount: 20,
      validFrom: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      validUntil: twoWeeksAgo,
      isActive: false,
    },
  });

  await prisma.coupon.create({
    data: {
      code: 'FLASH100',
      description: 'Flash sale — 100 PLN off orders over 1000',
      type: CouponType.FIXED_AMOUNT,
      value: 100.0,
      minimumOrderAmount: 1000.0,
      usageLimit: 10,
      usageLimitPerUser: 1,
      usageCount: 0,
      validFrom: now,
      validUntil: oneMonthFromNow,
      isActive: true,
    },
  });

  await prisma.coupon.create({
    data: {
      code: 'VIP25',
      description: 'VIP customers — 25% off, no limit',
      type: CouponType.PERCENTAGE,
      value: 25.0,
      maximumDiscount: 1000.0,
      validFrom: oneMonthAgo,
      validUntil: twoMonthsFromNow,
      isActive: true,
    },
  });

  console.log('Seeded 5 coupons');

  // ============================================
  // 8. ORDERS + ORDER ITEMS (20 orders, ~50 items)
  // ============================================

  const orderStatuses: OrderStatus[] = [
    // 3 PENDING
    OrderStatus.PENDING,
    OrderStatus.PENDING,
    OrderStatus.PENDING,
    // 3 CONFIRMED
    OrderStatus.CONFIRMED,
    OrderStatus.CONFIRMED,
    OrderStatus.CONFIRMED,
    // 4 PROCESSING
    OrderStatus.PROCESSING,
    OrderStatus.PROCESSING,
    OrderStatus.PROCESSING,
    OrderStatus.PROCESSING,
    // 4 SHIPPED
    OrderStatus.SHIPPED,
    OrderStatus.SHIPPED,
    OrderStatus.SHIPPED,
    OrderStatus.SHIPPED,
    // 4 DELIVERED
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERED,
    // 2 CANCELLED
    OrderStatus.CANCELLED,
    OrderStatus.CANCELLED,
  ];

  const shippingMethods = [shippingStandard, shippingExpress];
  const ordersCreated: Awaited<ReturnType<typeof prisma.order.create>>[] = [];
  const orderItemsData: {
    orderId: string;
    product: (typeof products)[number];
    quantity: number;
  }[] = [];

  // Spread orders across March 1–18
  const orderDates = Array.from({ length: orderStatuses.length }, (_, i) => {
    const day = 1 + Math.floor((i / orderStatuses.length) * 17); // days 1–17
    return new Date(
      2026,
      2,
      day,
      faker.number.int({ min: 8, max: 22 }),
      faker.number.int({ min: 0, max: 59 }),
    );
  });

  for (let i = 0; i < orderStatuses.length; i++) {
    const status = orderStatuses[i];
    const orderDate = orderDates[i];
    const customer = customers[i % customers.length];
    const customerAddress = addresses.find((a) => a.userId === customer.id);
    const addr = customerAddress ?? {
      fullName: `${customer.firstName} ${customer.lastName}`,
      phone: `+48${faker.string.numeric(9)}`,
      ...randomPolishAddress(),
      region: 'Mazowieckie',
    };

    // Pick 2-3 random products for this order
    const numItems = faker.number.int({ min: 2, max: 3 });
    const orderProducts = faker.helpers.arrayElements(
      products.filter((p) => p.isActive),
      numItems,
    );

    let subtotal = 0;
    const items = orderProducts.map((product) => {
      const quantity = faker.number.int({ min: 1, max: 3 });
      const unitPrice = Number(product.price);
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      return {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productImageUrl: `https://placehold.co/800x800?text=${encodeURIComponent(product.name)}`,
        quantity,
        unitPrice,
        lineTotal,
      };
    });

    const shipping = faker.helpers.arrayElement(shippingMethods);
    const shippingCost =
      subtotal >= Number(shipping.freeShippingThreshold ?? 0) ? 0 : Number(shipping.basePrice);
    const tax = Math.round(subtotal * 0.23 * 100) / 100;

    // Some orders have coupons
    let discountAmount = 0;
    let couponCode: string | null = null;
    if (i % 5 === 0 && i < 15) {
      // 3 orders use SUMMER2026
      couponCode = 'SUMMER2026';
      discountAmount = Math.min(subtotal * 0.15, 500);
    } else if (i === 4) {
      couponCode = 'WELCOME50';
      discountAmount = 50;
    }

    const total = Math.round((subtotal + shippingCost + tax - discountAmount) * 100) / 100;

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(i + 1),
        userId: customer.id,
        status,
        shippingFullName: addr.fullName,
        shippingPhone: addr.phone,
        shippingStreet: addr.street,
        shippingCity: addr.city,
        shippingRegion: addr.region,
        shippingPostalCode: addr.postalCode,
        shippingCountry: addr.country,
        shippingMethodName: shipping.name,
        subtotal,
        shippingCost,
        tax,
        discountAmount,
        couponCode,
        total,
        notes: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }) ?? null,
        createdAt: orderDate,
        items: {
          create: items,
        },
      },
    });

    ordersCreated.push(order);
    for (const product of orderProducts) {
      orderItemsData.push({
        orderId: order.id,
        product,
        quantity: items.find((it) => it.productId === product.id)!.quantity,
      });
    }
  }

  console.log(`Seeded ${ordersCreated.length} orders`);

  // ============================================
  // 9. PAYMENTS (1 per order)
  // ============================================

  for (let i = 0; i < ordersCreated.length; i++) {
    const order = ordersCreated[i];
    const paymentDate = orderDates[i];
    let paymentStatus: PaymentStatus;

    switch (order.status) {
      case OrderStatus.PENDING:
        paymentStatus = PaymentStatus.PENDING;
        break;
      case OrderStatus.CANCELLED:
        paymentStatus = faker.helpers.arrayElement([PaymentStatus.FAILED, PaymentStatus.REFUNDED]);
        break;
      default:
        paymentStatus = PaymentStatus.SUCCEEDED;
        break;
    }

    await prisma.payment.create({
      data: {
        orderId: order.id,
        stripePaymentIntentId: `pi_seed_${String(i + 1).padStart(4, '0')}`,
        status: paymentStatus,
        amount: order.total,
        currency: 'pln',
        refundedAmount: paymentStatus === PaymentStatus.REFUNDED ? order.total : 0,
        stripeRefundId:
          paymentStatus === PaymentStatus.REFUNDED
            ? `re_seed_${String(i + 1).padStart(4, '0')}`
            : null,
        failureCode: paymentStatus === PaymentStatus.FAILED ? 'card_declined' : null,
        failureMessage: paymentStatus === PaymentStatus.FAILED ? 'Your card was declined.' : null,
        createdAt: paymentDate,
      },
    });
  }

  console.log(`Seeded ${ordersCreated.length} payments`);

  // ============================================
  // 10. COUPON USAGES
  // ============================================

  const ordersWithCoupons = ordersCreated.filter((o) => o.couponCode);
  for (const order of ordersWithCoupons) {
    const coupon = order.couponCode === 'SUMMER2026' ? couponSummer : couponWelcome;
    const customer = customers.find((c) => c.id === order.userId)!;

    await prisma.couponUsage.create({
      data: {
        couponId: coupon.id,
        userId: customer.id,
        orderId: order.id,
        discountAmount: order.discountAmount,
      },
    });
  }

  console.log(`Seeded ${ordersWithCoupons.length} coupon usages`);

  // ============================================
  // 11. REFUND REQUESTS (4)
  // ============================================

  const deliveredOrders = ordersCreated.filter((o) => o.status === OrderStatus.DELIVERED);
  const cancelledOrders = ordersCreated.filter((o) => o.status === OrderStatus.CANCELLED);

  const refundStatuses: RefundRequestStatus[] = [
    RefundRequestStatus.PENDING,
    RefundRequestStatus.APPROVED,
    RefundRequestStatus.REJECTED,
    RefundRequestStatus.COMPLETED,
  ];

  const refundOrders = [...deliveredOrders.slice(0, 3), ...cancelledOrders.slice(0, 1)];

  for (let i = 0; i < refundOrders.length; i++) {
    const order = refundOrders[i];
    const status = refundStatuses[i];

    await prisma.refundRequest.create({
      data: {
        orderId: order.id,
        userId: order.userId,
        reason: faker.helpers.arrayElement([
          'Product arrived damaged',
          'Wrong size received',
          'Changed my mind',
          'Item not as described',
        ]),
        status,
        adminNotes:
          status === RefundRequestStatus.REJECTED
            ? 'Product was used, return policy does not apply.'
            : status === RefundRequestStatus.APPROVED
              ? 'Approved — customer provided photos of damage.'
              : status === RefundRequestStatus.COMPLETED
                ? 'Refund processed via Stripe.'
                : null,
        reviewedAt: status !== RefundRequestStatus.PENDING ? faker.date.recent({ days: 7 }) : null,
        reviewedBy: status !== RefundRequestStatus.PENDING ? admin.id : null,
      },
    });
  }

  console.log(`Seeded ${refundOrders.length} refund requests`);

  // ============================================
  // 12. REVIEWS (~15)
  // ============================================

  const reviewStatuses: ReviewStatus[] = [
    ReviewStatus.APPROVED,
    ReviewStatus.APPROVED,
    ReviewStatus.APPROVED,
    ReviewStatus.APPROVED,
    ReviewStatus.APPROVED,
    ReviewStatus.APPROVED,
    ReviewStatus.APPROVED,
    ReviewStatus.APPROVED,
    ReviewStatus.APPROVED,
    ReviewStatus.APPROVED,
    ReviewStatus.PENDING,
    ReviewStatus.PENDING,
    ReviewStatus.PENDING,
    ReviewStatus.REJECTED,
    ReviewStatus.REJECTED,
  ];

  const reviewTitles = [
    'Excellent quality!',
    'Very satisfied',
    'Good value for money',
    'Exceeded expectations',
    'Decent product',
    'Not bad at all',
    'Love it!',
    'Highly recommended',
    'Would buy again',
    'Solid choice',
    'Just okay',
    'Needs improvement',
    'Disappointing',
    'Spam review',
    'Inappropriate content',
  ];

  const reviewComments = [
    'This product exceeded all my expectations. Build quality is fantastic and it works perfectly.',
    'Very happy with this purchase. Delivery was fast and the product matches the description.',
    'Great value for the price. Would definitely recommend to friends and family.',
    'The quality is outstanding. You can tell this is a premium product right out of the box.',
    'Does what it says on the tin. Nothing fancy but reliable and well-made.',
    'I was skeptical at first but this turned out to be one of my best purchases this year.',
    'Absolutely love this! The attention to detail is impressive.',
    'Five stars from me. Fast shipping, great packaging, and the product is perfect.',
    'Already ordered a second one as a gift. That should tell you everything.',
    'Solid product with no complaints. Does exactly what I needed.',
    'It is alright. Nothing special but does the job. Expected a bit more for the price.',
    'Some minor issues with the finish but overall acceptable quality.',
    'Not what I expected based on the photos. The material feels cheaper than advertised.',
    'This is a test review that should be rejected.',
    'Completely irrelevant content posted as spam.',
  ];

  // Track used user+product combos to enforce unique constraint
  const usedReviewCombos = new Set<string>();

  for (let i = 0; i < reviewStatuses.length; i++) {
    const status = reviewStatuses[i];
    // Pick a customer that has not reviewed this product yet
    let customer: (typeof customers)[number];
    let product: (typeof products)[number];
    let comboKey: string;

    do {
      customer = customers[i % customers.length];
      product = faker.helpers.arrayElement(products.filter((p) => p.isActive));
      comboKey = `${customer.id}-${product.id}`;
    } while (usedReviewCombos.has(comboKey));

    usedReviewCombos.add(comboKey);

    await prisma.review.create({
      data: {
        userId: customer.id,
        productId: product.id,
        rating: status === ReviewStatus.REJECTED ? 1 : faker.number.int({ min: 3, max: 5 }),
        title: reviewTitles[i],
        comment: reviewComments[i],
        status,
        adminNote:
          status === ReviewStatus.REJECTED ? 'Review violates community guidelines.' : null,
      },
    });
  }

  console.log(`Seeded ${reviewStatuses.length} reviews`);

  // ============================================
  // 13. CARTS + CART ITEMS (3-4 active carts)
  // ============================================

  const cartCustomers = customers.slice(0, 4);
  for (const customer of cartCustomers) {
    const numItems = faker.number.int({ min: 1, max: 3 });
    const cartProducts = faker.helpers.arrayElements(
      products.filter((p) => p.isActive && p.stock > 0),
      numItems,
    );

    await prisma.cart.create({
      data: {
        userId: customer.id,
        couponCode: customer === cartCustomers[0] ? 'SUMMER2026' : null,
        items: {
          create: cartProducts.map((product) => ({
            productId: product.id,
            quantity: faker.number.int({ min: 1, max: 2 }),
          })),
        },
      },
    });
  }

  console.log(`Seeded ${cartCustomers.length} carts`);

  // ============================================
  // 14. GUEST CARTS (2)
  // ============================================

  const guestCart1 = await prisma.guestCart.create({
    data: {
      sessionToken: 'hashed_session_token_seed_001',
      expiresAt: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000),
      items: {
        create: [
          {
            productId: products[0].id,
            quantity: 1,
          },
          {
            productId: products[6].id,
            quantity: 2,
          },
        ],
      },
    },
  });

  const guestCart2 = await prisma.guestCart.create({
    data: {
      sessionToken: 'hashed_session_token_seed_002',
      expiresAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // near expiry
      items: {
        create: [
          {
            productId: products[3].id,
            quantity: 1,
          },
        ],
      },
    },
  });

  console.log(`Seeded 2 guest carts (${guestCart1.id}, ${guestCart2.id})`);

  // ============================================
  // 15. NOTIFICATIONS (~30)
  // ============================================

  const notificationTypes: {
    type: NotificationType;
    title: string;
    body: string;
  }[] = [
    {
      type: NotificationType.WELCOME,
      title: 'Welcome to our store!',
      body: 'Thanks for signing up. Enjoy shopping!',
    },
    {
      type: NotificationType.ORDER_CREATED,
      title: 'Order placed',
      body: 'Your order has been placed successfully.',
    },
    {
      type: NotificationType.ORDER_CONFIRMED,
      title: 'Order confirmed',
      body: 'Your payment has been received and your order is confirmed.',
    },
    {
      type: NotificationType.ORDER_SHIPPED,
      title: 'Order shipped',
      body: 'Your order has been shipped and is on its way!',
    },
    {
      type: NotificationType.ORDER_DELIVERED,
      title: 'Order delivered',
      body: 'Your order has been delivered. Enjoy your purchase!',
    },
    {
      type: NotificationType.ORDER_CANCELLED,
      title: 'Order cancelled',
      body: 'Your order has been cancelled.',
    },
    {
      type: NotificationType.PAYMENT_SUCCEEDED,
      title: 'Payment successful',
      body: 'Your payment was processed successfully.',
    },
    {
      type: NotificationType.PAYMENT_FAILED,
      title: 'Payment failed',
      body: 'Your payment could not be processed. Please try again.',
    },
    {
      type: NotificationType.REFUND_REQUEST_CREATED,
      title: 'Refund requested',
      body: 'Your refund request has been submitted for review.',
    },
    {
      type: NotificationType.REFUND_COMPLETED,
      title: 'Refund completed',
      body: 'Your refund has been processed and credited to your account.',
    },
    {
      type: NotificationType.LOW_STOCK,
      title: 'Low stock alert',
      body: 'A product is running low on stock.',
    },
    {
      type: NotificationType.PASSWORD_CHANGED,
      title: 'Password changed',
      body: 'Your password has been changed successfully.',
    },
  ];

  let notifCount = 0;
  for (let i = 0; i < 30; i++) {
    const template = notificationTypes[i % notificationTypes.length];
    const isAdminNotif = template.type === NotificationType.LOW_STOCK;
    const userId = isAdminNotif ? admin.id : customers[i % customers.length].id;
    const referenceId =
      template.type === NotificationType.ORDER_CREATED ||
      template.type === NotificationType.ORDER_CONFIRMED ||
      template.type === NotificationType.ORDER_SHIPPED ||
      template.type === NotificationType.ORDER_DELIVERED ||
      template.type === NotificationType.ORDER_CANCELLED
        ? (ordersCreated[i % ordersCreated.length]?.id ?? null)
        : null;

    await prisma.notification.create({
      data: {
        userId,
        type: template.type,
        title: template.title,
        body: template.body,
        referenceId,
        isRead: faker.number.float() < 0.4, // 40% read
        createdAt: faker.date.recent({ days: 30 }),
      },
    });
    notifCount++;
  }

  console.log(`Seeded ${notifCount} notifications`);

  // ============================================
  // 16. NOTIFICATION PREFERENCES (~10 opt-outs)
  // ============================================

  const prefCustomers = customers.slice(0, 5);
  const optOutTypes = [NotificationType.ORDER_SHIPPED, NotificationType.PAYMENT_SUCCEEDED];

  let prefCount = 0;
  for (const customer of prefCustomers) {
    for (const type of optOutTypes) {
      await prisma.notificationPreference.create({
        data: {
          userId: customer.id,
          type,
          channel: NotificationChannel.EMAIL,
          enabled: false,
        },
      });
      prefCount++;
    }
  }

  console.log(`Seeded ${prefCount} notification preferences`);

  console.log('\nSeeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
