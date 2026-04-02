# NestJS Ecommerce API

[![CI](https://github.com/Kris1027/nestjs-ecommerce-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Kris1027/nestjs-ecommerce-api/actions/workflows/ci.yml)

A production-ready **single-vendor ecommerce REST API** built with NestJS 11, TypeScript 5.7, Prisma 7, and PostgreSQL. Features JWT authentication with token rotation, Stripe payments with webhook processing, Cloudinary image uploads, BullMQ background jobs, and 91 fully documented API endpoints.

---

## Tech Stack

| Layer              | Technology                                  |
| ------------------ | ------------------------------------------- |
| **Framework**      | NestJS 11 (TypeScript 5.7, strict mode)     |
| **Database**       | PostgreSQL + Prisma 7 ORM                   |
| **Authentication** | JWT access/refresh tokens (token rotation)  |
| **Payments**       | Stripe (PaymentIntents + webhooks)          |
| **File Storage**   | Cloudinary (auto-optimized uploads)         |
| **Email**          | Resend (transactional email API)            |
| **Caching**        | Redis + cache-manager (Keyv adapter)        |
| **Queue**          | BullMQ + Redis (background jobs)            |
| **Validation**     | Zod 4 + nestjs-zod                          |
| **Documentation**  | Swagger/OpenAPI (91 endpoints)              |
| **Testing**        | Jest 30 (44 unit suites, 5 E2E suites, 688 tests) |
| **Containerization** | Docker + Docker Compose                   |
| **CI/CD**          | GitHub Actions (lint, test, build)           |
| **Hosting**        | Railway (staging + production environments) |
| **Observability**  | OpenTelemetry (traces) + Jaeger             |
| **Logging**        | nestjs-pino (structured, request-scoped)    |

---

## Features

### Authentication & Authorization

- Register, login, logout with JWT access tokens (15 min) and refresh tokens (7 days)
- Token family rotation — detects and prevents refresh token reuse attacks
- Email verification with tokenized links (24h expiry)
- Password reset flow (forgot password, reset with token)
- Role-based access control (CUSTOMER, ADMIN) with guards
- `@Public()` decorator to opt routes out of authentication
- Hashed refresh tokens and password reset tokens stored in database

### User Management

- Profile management (view, update name)
- Password change with current password verification
- Address book — CRUD for shipping/billing addresses with default selection
- Admin: list users, view details, update roles, deactivate, hard delete

### Product Catalog

- **Categories** — hierarchical tree structure with parent/child relationships, auto-generated slugs, image uploads, soft delete
- **Products** — full CRUD with filtering (category, price range, featured), case-insensitive search, dynamic sorting, pagination, Cloudinary image uploads with auto-optimization

### Inventory Management

- Real-time stock tracking with reserved stock calculations
- Stock movement audit trail (adjustments, reservations, releases, sales, returns, restocks)
- Low-stock threshold alerts with admin notifications
- Transactional stock operations (atomic read + update)

### Shopping Cart

- Authenticated user carts with lazy creation
- Guest carts (session-based, 30-day expiry) with merge on login
- Add, update quantity, remove items, clear cart
- Product availability and stock validation on every operation
- Coupon application with live discount preview

### Orders & Checkout

- Atomic checkout — creates order, reserves stock, clears cart in a single transaction
- Order number generation (`ORD-YYYYMMDD-XXXX`)
- Product snapshots at order time (name, SKU, price, image preserved)
- Address snapshot on order (survives address edits/deletion)
- Server-side price, tax, and shipping calculation (never trusts client)
- Status workflow: PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED (or CANCELLED)
- Status transition validation via state machine
- Customer order history with filtering by status and date
- Cancel orders (PENDING/CONFIRMED only)
- Refund request flow with admin review

### Payments (Stripe)

- PaymentIntent creation with idempotency keys
- Webhook processing with signature verification and event deduplication
- Full refund lifecycle — REFUND_PENDING → REFUNDED (via webhook confirmation)
- Failed payment/refund tracking with error codes from Stripe
- Abandoned payment cleanup (auto-expires after 24h)
- Currency handling (PLN → groszy conversion for Stripe)

### Reviews & Ratings

- Purchase-verified reviews (only buyers with paid orders can review)
- Moderation workflow — PENDING → APPROVED/REJECTED by admin
- Edits reset status to PENDING for re-moderation
- Denormalized average rating and review count on products
- One review per user per product

### Coupons & Discounts

- Percentage and fixed-amount discount types
- Validation rules: minimum order amount, maximum discount cap, usage limits (global + per-user)
- Validity window (start/end dates) with active/inactive toggle
- Usage tracking per user per order
- Integrated into checkout flow with atomic usage recording

### Shipping

- Flat-rate shipping methods with configurable pricing
- Free shipping threshold per method
- Estimated delivery days
- Shipping method name snapshot on orders

### Tax

- Configurable tax rates with percentage-based calculation
- Integrated into checkout total computation

### Notifications

- **Dual-channel delivery** — in-app (database) + email (Resend)
- **15 email templates** — welcome, order lifecycle, payment confirmations, refund updates, low stock alerts
- **Event-driven architecture** — 13 event types with 5 dedicated listeners (auth, orders, payments, inventory, cache invalidation)
- Unread count badge, mark as read (single/all), notification preferences (opt-out model)
- Admin broadcast for low stock alerts (sent to all active admins)
- Idempotency check (prevents duplicate notifications within 1 minute)
- Async email delivery via BullMQ with retry and exponential backoff

### Background Jobs

- **Email queue** — async delivery with 3 retries and exponential backoff
- **7 scheduled cleanup jobs:**

| Job                        | Schedule         | Description                          |
| -------------------------- | ---------------- | ------------------------------------ |
| Expired refresh tokens     | Daily 3:00 AM    | Delete expired/revoked tokens        |
| Expired verification tokens| Daily 3:05 AM    | Clear stale email verification       |
| Expired reset tokens       | Daily 3:10 AM    | Clear stale password reset tokens    |
| Expired guest carts        | Daily 3:15 AM    | Delete expired guest carts           |
| Abandoned payments         | Hourly           | Expire 24h+ pending payments         |
| Old webhook events         | Weekly Sun 4:00 AM | Delete 30+ day old events          |
| Old notifications          | Weekly Sun 4:30 AM | Delete 90+ day old read notifications|

### File Storage (Cloudinary)

- Product and category image uploads (multipart form-data)
- Buffer-based uploads (no temp files on disk)
- File validation — MIME type (JPG, PNG, WebP) and size (5 MB max)
- Auto-optimization — `quality: auto`, `format: auto`
- Organized by folder (`products/`, `categories/`)
- Cleanup on image removal and entity hard delete

### Caching (Redis)

- **Cache-aside pattern** on high-traffic public endpoints — transparent to clients
- Product listings (5 min TTL), product detail by slug (10 min TTL)
- Category listings (10 min TTL), category tree (30 min TTL), category detail by slug (10 min TTL)
- **Event-driven invalidation** — cache cleared automatically on product/category mutations
- Indirect invalidation on order creation, status changes, and stock adjustments
- Error-resilient — Redis failures degrade gracefully to direct database queries

### API Versioning

- All endpoints prefixed with `/api/v1` (e.g., `/api/v1/products`, `/api/v1/auth/login`)
- Health endpoints excluded from prefix — accessible at `/health` and `/health/ready` for K8s probes and Docker healthchecks
- Swagger docs at `/docs` reflect the versioned paths

### Observability (OpenTelemetry)

- **Distributed tracing** via OpenTelemetry SDK with auto-instrumentation (HTTP, Express, PostgreSQL, Redis, NestJS)
- **Disabled by default** — enabled via `OTEL_ENABLED=true` environment variable
- **OTLP export** — traces sent to any OTLP-compatible backend (Jaeger, Grafana Tempo, Datadog)
- **Health endpoint exclusion** — `/health` requests excluded from traces to reduce noise
- **Jaeger included** in Docker Compose for local trace viewing at `http://localhost:16686`
- **Graceful shutdown** — SDK shuts down cleanly on SIGTERM/SIGINT

### Health Checks & Graceful Shutdown

- `GET /health` — liveness probe (app is running)
- `GET /health/ready` — readiness probe (database + Redis + cache layer connectivity)
- **Graceful shutdown** — `enableShutdownHooks()` ensures database connections, Redis clients, and BullMQ workers close cleanly on SIGTERM/SIGINT

---

## Global Request Pipeline

Every request flows through these globally-registered providers in order:

```
Request → /api/v1/* → Rate Limiter → JWT Auth → Role Guard → Zod Validation → [Handler] → Response Envelope → Error Filter → Response
```

| Stage                    | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| **ThrottlerGuard**       | 3-tier rate limiting (3/1s, 20/10s, 100/60s)                   |
| **JwtAuthGuard**         | JWT validation on all routes; `@Public()` to opt out            |
| **RolesGuard**           | Role-based access; `@Roles('ADMIN')` to restrict                |
| **ZodValidationPipe**    | Request body/query/param validation via Zod schemas             |
| **TransformInterceptor** | Wraps successful responses in `{ data, meta }` envelope         |
| **GlobalExceptionFilter**| Standardized error responses; maps Prisma errors to HTTP codes  |

---

## Database Schema

18 models organized across 6 domains:

```
User & Auth          Catalog & Inventory       Shopping
─────────────        ───────────────────       ────────
User                 Category                  Cart
RefreshToken         Product                   CartItem
Address              ProductImage              GuestCart
                     StockMovement             GuestCartItem

Orders               Payments                  Engagement
──────               ────────                  ──────────
Order                Payment                   Review
OrderItem            WebhookEvent              Coupon
RefundRequest                                  CouponUsage
                                               Notification
Fulfillment                                    NotificationPreference
───────────
ShippingMethod
TaxRate
```

- IDs: CUIDs (URL-safe, sortable)
- Money fields: `Decimal(10,2)` (no floating-point errors)
- Columns: `snake_case` via Prisma `@map`

---

## Getting Started

### Prerequisites

- **Node.js** 22 LTS
- **pnpm** 10+
- **PostgreSQL** 17+
- **Redis** 7+

### Local Setup

```bash
# Clone the repository
git clone https://github.com/Kris1027/nestjs-ecommerce-api.git
cd nestjs-ecommerce-api

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.development
# Edit .env.development with your database, Redis, Stripe, Cloudinary, and Resend credentials

# Push database schema
pnpm prisma db push

# Seed the database
pnpm prisma:seed

# Start development server
pnpm start:dev
```

### Docker Setup

```bash
# Start PostgreSQL, Redis, and the app with hot reload
docker compose up

# Or rebuild after dependency changes
docker compose up --build
```

The Docker Compose setup includes:
- **PostgreSQL 17** with health checks and persistent volume
- **Redis 7** with health checks and persistent volume
- **Jaeger** for distributed trace viewing at `http://localhost:16686`
- **NestJS app** with hot reload, OTel tracing enabled via bind mounts

---

## Scripts

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `pnpm start:dev`     | Development server with hot reload  |
| `pnpm build`         | Compile TypeScript                  |
| `pnpm start:prod`    | Run compiled production build       |
| `pnpm lint`          | ESLint with auto-fix                |
| `pnpm test`          | Run unit tests                      |
| `pnpm test:watch`    | Run tests in watch mode             |
| `pnpm test:cov`      | Generate coverage report            |
| `pnpm test:e2e`      | Run E2E tests                       |
| `pnpm prisma db push` | Sync schema to database          |
| `pnpm prisma:seed`   | Seed the database                   |
| `pnpm docker:up`     | Start Docker services               |
| `pnpm docker:down`   | Stop Docker services                |
| `pnpm docker:logs`   | Tail application logs               |
| `pnpm docker:build`  | Rebuild and start Docker services   |
| `pnpm docker:clean`  | Stop services and remove volumes    |

---

## API Documentation

Swagger UI is available at **`/docs`** in non-production environments (91 documented endpoints). All API paths are prefixed with `/api/v1`.

Additional export formats:
- JSON: `/docs-json`
- YAML: `/docs-yaml`

All endpoints include request/response schemas, authentication requirements, query parameter documentation with enum dropdowns, and example values.

---

## Environment Variables

The app uses **environment-specific `.env` files** — `.env.development` for local work, `.env.production` for deployed environments. The correct file is loaded automatically based on `NODE_ENV` (falls back to `.env.development` for test/unknown environments).

```bash
cp .env.example .env.development   # Local development
cp .env.example .env.production    # Production values (Vercel URLs, CORS_ORIGIN, etc.)
```

See [`.env.example`](.env.example) for all required variables. Key groups:

| Group           | Variables                                              |
| --------------- | ------------------------------------------------------ |
| **App**         | `NODE_ENV`, `PORT`, `STORE_URL`, `ADMIN_URL`, `CORS_ORIGIN` |
| **Database**    | `DATABASE_URL`                                         |
| **JWT**         | `JWT_SECRET`, `JWT_REFRESH_SECRET`, expiration configs  |
| **Stripe**      | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`           |
| **Cloudinary**  | `CLOUDINARY_CLOUD_NAME`, `API_KEY`, `API_SECRET`       |
| **Email**       | `RESEND_API_KEY`, `EMAIL_FROM`                         |
| **Redis**       | `REDIS_URL`                                            |
| **OpenTelemetry** | `OTEL_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` |

All environment variables are validated at startup via Zod. The app will not start with missing or invalid configuration.

---

## Testing

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Run a specific test file
pnpm test -- --testPathPattern=auth.service

# Run with coverage
pnpm test:cov
```

- **44 test suites** with **657 unit tests**
- Services, controllers, guards, filters, interceptors, and event listeners all tested
- Dependencies mocked via custom factories (`createMockPrismaClient`, Stripe, Cloudinary, BullMQ)
- Coverage thresholds enforced: 80% lines/functions, 70% branches

### E2E Tests

```bash
# Requires PostgreSQL and Redis running locally
pnpm test:e2e
```

- **5 test suites** with **31 E2E tests** running against real PostgreSQL and Redis
- Test database auto-created (appends `_test` to dev DB name) and dropped after each run
- External services (Stripe, Resend, Cloudinary) mocked at the provider level; everything else is real
- Covers health checks, full auth lifecycle, categories CRUD with RBAC, and products with filtering

| Suite | Tests | Coverage |
|-------|-------|----------|
| `app.e2e-spec.ts` | 1 | Root endpoint auth enforcement |
| `health.e2e-spec.ts` | 2 | Liveness + readiness probes |
| `auth.e2e-spec.ts` | 11 | Register, login, refresh, logout, validation |
| `categories.e2e-spec.ts` | 10 | Public listing, RBAC (401/403), admin CRUD |
| `products.e2e-spec.ts` | 7 | Listing, category filter, slug lookup, admin create |

---

## Deployment

Hosted on **Railway** with isolated staging and production environments.

| Service | Staging |
|---------|---------|
| **API** | [nestjs-ecommerce-api-staging.up.railway.app](https://nestjs-ecommerce-api-staging.up.railway.app) |
| **PostgreSQL** | Managed by Railway |
| **Redis** | Docker image (`redis:7`) on Railway |

### How it works

- **Auto-deploy on merge** — pushing to `main` triggers a Railway deployment
- **PR Preview Environments** — each PR gets a temporary Railway environment for testing
- **Multi-stage Dockerfile** — optimized production image with non-root user, health checks, and graceful shutdown
- **Environment isolation** — staging and production have separate databases, Redis instances, and env variables
- **Schema sync** — `prisma db push` syncs the database schema (no migrations)

---

## CI/CD

GitHub Actions runs **4 parallel jobs** on every PR and push to main:

| Job        | Timeout | Description                                    |
| ---------- | ------- | ---------------------------------------------- |
| **Lint**   | 5 min   | ESLint checks                                  |
| **Test**   | 10 min  | 657 unit tests + 31 E2E tests via Jest         |
| **Build**  | 5 min   | TypeScript compilation (type safety)            |
| **Docker** | 10 min  | Build production Docker image (same as Railway) |

- pnpm dependency caching for fast runs
- `--frozen-lockfile` to prevent dependency drift
- Concurrency control (cancels stale PR runs, never cancels main)
- Least-privilege permissions (`contents: read`)

---

## Project Structure

```
src/
├── common/
│   ├── decorators/         # @Public(), @Roles(), @CurrentUser()
│   ├── dto/                # Shared DTOs (pagination)
│   ├── filters/            # GlobalExceptionFilter
│   ├── guards/             # JwtAuthGuard, RolesGuard
│   ├── interceptors/       # TransformInterceptor
│   ├── swagger/            # Reusable Swagger response helpers
│   └── utils/              # Pagination, slug, order number, decimal, sanitize utils
├── config/
│   └── env.validation.ts   # Zod environment schema
├── modules/
│   ├── auth/               # Registration, login, tokens, password reset
│   ├── users/              # Profiles, addresses, admin user management
│   ├── categories/         # Hierarchical categories with slugs
│   ├── products/           # Product catalog with filtering & search
│   ├── inventory/          # Stock tracking & movement audit trail
│   ├── cart/               # Authenticated user cart
│   ├── guest-cart/         # Session-based guest cart
│   ├── orders/             # Checkout, order lifecycle, refund requests
│   ├── payments/           # Stripe integration & webhook processing
│   ├── reviews/            # Purchase-verified reviews with moderation
│   ├── coupons/            # Discount codes with validation rules
│   ├── shipping/           # Shipping methods & cost calculation
│   ├── tax/                # Tax rate configuration
│   ├── notifications/      # In-app + email notifications, event listeners
│   ├── cloudinary/         # Image upload service
│   ├── cache/              # Redis caching with event-driven invalidation
│   ├── queue/              # BullMQ email & cleanup processors
│   └── health/             # Liveness & readiness probes
├── prisma/
│   └── prisma.module.ts    # Global Prisma module
└── main.ts                 # Bootstrap with middleware & Swagger config
```

---

## Security

Audited against the **OWASP Top 10** (see `src/main.ts` for full coverage map).

- JWT authentication with short-lived access tokens (15 min) and hashed refresh tokens
- Token family rotation to detect reuse attacks
- bcrypt password hashing (cost factor 12)
- **Tiered rate limiting** per endpoint group — strict on auth (10/min), relaxed on public reads (200/min), moderate on guest cart, tight on file uploads
- Helmet with **strict Content-Security-Policy** (`default-src 'none'`) and **HSTS preload** in production
- **CORS whitelist required in production** — app fails fast if `CORS_ORIGIN` is not set (comma-separated origins)
- Zod validation on all inputs (whitelist + strip unknown fields)
- **HTML sanitization** on all user-generated text (product names, descriptions, review titles/comments, category names) via `sanitize-html` — prevents stored XSS at write-time
- Prisma parameterized queries (SQL injection prevention, including `$queryRaw`)
- Stripe webhook signature verification with event deduplication
- Email enumeration prevention (generic responses on auth endpoints)
- No stack traces or internal details leaked in error responses
- Environment validation at startup (fails fast on misconfiguration)

---

## License

Copyright (c) 2025 Krzysztof Obarzanek. **All Rights Reserved.**

This project is proprietary. No part of the source code may be copied, modified, distributed, or used without prior written permission. See [LICENSE](LICENSE) for details.
