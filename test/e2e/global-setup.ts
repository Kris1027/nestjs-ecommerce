import { execSync } from 'child_process';
import pg from 'pg';

/**
 * Jest global setup — runs ONCE before all E2E test suites.
 *
 * 1. Creates the test database (nestjs_ecommerce_test) if it doesn't exist
 * 2. Runs Prisma migrations to create all tables
 *
 * Why a separate database? Isolation. E2E tests truncate tables freely —
 * using the dev database would destroy your seed data.
 *
 * Why pg.Client instead of Prisma? CREATE DATABASE is a server-level command
 * that can't run inside a transaction, and Prisma always wraps $executeRaw
 * in a transaction. Raw pg is the simplest way to do this.
 */
export default async function globalSetup(): Promise<void> {
  const testDbName = 'nestjs_ecommerce_test';

  // Connect to the default 'postgres' database to run CREATE DATABASE
  const client = new pg.Client({
    host: 'localhost',
    port: 5433,
    user: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? 'postgres',
    database: 'postgres',
  });

  try {
    await client.connect();

    // Check if the test database already exists
    const result = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [testDbName]);

    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE ${testDbName}`);
      console.warn(`\n  Created test database: ${testDbName}`);
    }
  } finally {
    await client.end();
  }

  // Run Prisma migrations against the test database
  // DATABASE_URL is already set to the test DB via .env.test
  execSync('pnpm prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env },
  });
}
