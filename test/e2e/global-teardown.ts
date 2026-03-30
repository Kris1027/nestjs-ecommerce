import pg from 'pg';

/**
 * Jest global teardown — runs ONCE after all E2E test suites complete.
 *
 * Drops the test database entirely. This ensures every test run starts
 * from a clean slate (global-setup recreates it with fresh migrations).
 *
 * Why drop instead of truncate? Dropping catches migration issues —
 * if a migration is broken, the next run fails at setup, not silently.
 */
export default async function globalTeardown(): Promise<void> {
  const testDbName = 'nestjs_ecommerce_test';

  const client = new pg.Client({
    host: 'localhost',
    port: 5433,
    user: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? 'postgres',
    database: 'postgres',
  });

  try {
    await client.connect();

    // Terminate any lingering connections before dropping
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [testDbName],
    );

    await client.query(`DROP DATABASE IF EXISTS ${testDbName}`);
    console.warn(`\n  Dropped test database: ${testDbName}`);
  } finally {
    await client.end();
  }
}
