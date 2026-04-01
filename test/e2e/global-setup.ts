import 'dotenv/config';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

const TEST_DB_SUFFIX = '_test';

/**
 * Jest global setup — runs ONCE before all E2E test suites.
 *
 * 1. Derives a test database name from DATABASE_URL by appending "_test"
 * 2. Creates the test database if it doesn't exist
 * 3. Runs Prisma db push to sync schema (no migrations needed)
 *
 * Why derive from DATABASE_URL? So .env.test only needs NODE_ENV=test —
 * credentials, host, port all come from .env (your local setup).
 * No secrets in committed files.
 *
 * Why pg.Client instead of Prisma? CREATE DATABASE is a server-level command
 * that can't run inside a transaction, and Prisma always wraps $executeRaw
 * in a transaction. Raw pg is the simplest way to do this.
 */
export default async function globalSetup(): Promise<void> {
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  const devDbName = databaseUrl.pathname.replace('/', '');
  const testDbName = devDbName.endsWith(TEST_DB_SUFFIX) ? devDbName : devDbName + TEST_DB_SUFFIX;

  // Connect to the default 'postgres' database to run CREATE DATABASE
  const client = new pg.Client({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port) || 5432,
    user: decodeURIComponent(databaseUrl.username),
    password: databaseUrl.password ? decodeURIComponent(databaseUrl.password) : undefined,
    database: 'postgres',
  });

  try {
    await client.connect();

    const result = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [testDbName]);

    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${testDbName}"`);
      console.warn(`\n  Created test database: ${testDbName}`);
    }
  } finally {
    await client.end();
  }

  // Override DATABASE_URL to point to the test database for Prisma db push
  const testDatabaseUrl = new URL(process.env.DATABASE_URL!);
  testDatabaseUrl.pathname = `/${testDbName}`;

  execSync('pnpm prisma db push', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl.toString() },
  });

  // Run PostgreSQL-specific extensions (triggers, functions) that Prisma cannot express
  const extensionsClient = new pg.Client({ connectionString: testDatabaseUrl.toString() });
  try {
    await extensionsClient.connect();
    const sql = readFileSync(join(__dirname, '../../prisma/setup-extensions.sql'), 'utf-8');
    await extensionsClient.query(sql);
  } finally {
    await extensionsClient.end();
  }

  // Store the test DATABASE_URL so test suites use the correct database
  process.env.DATABASE_URL = testDatabaseUrl.toString();
}
