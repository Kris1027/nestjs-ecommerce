import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Only validate env when a DATABASE_URL is available (runtime).
// During `prisma generate` in Docker build, no env vars exist
// and the datasource URL is not needed — only the schema path matters.
const url =
  process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url,
  },
});
