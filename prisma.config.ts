import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma CLI (migrations, db push, studio) should use a direct connection
// that bypasses connection pooling (e.g. PgBouncer). At runtime, the app
// uses DATABASE_URL which may go through a pooler.
// During `prisma generate` in Docker build, no env vars exist
// and the datasource URL is not needed — only the schema path matters.
const url =
  process.env.DIRECT_URL ??
  process.env.DATABASE_URL ??
  'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url,
  },
});
