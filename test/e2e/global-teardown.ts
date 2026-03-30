import 'dotenv/config';
import pg from 'pg';

const TEST_DB_SUFFIX = '_test';

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
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  const devDbName = databaseUrl.pathname.replace('/', '');
  const testDbName = devDbName.endsWith(TEST_DB_SUFFIX) ? devDbName : devDbName + TEST_DB_SUFFIX;

  // Safety guard: only drop databases ending with _test
  if (!testDbName.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(
      `Refusing to drop database "${testDbName}" — name must end with "${TEST_DB_SUFFIX}"`,
    );
  }

  const client = new pg.Client({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port) || 5432,
    user: decodeURIComponent(databaseUrl.username),
    password: databaseUrl.password ? decodeURIComponent(databaseUrl.password) : undefined,
    database: 'postgres',
  });

  try {
    await client.connect();

    // Terminate any lingering connections before dropping
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [testDbName],
    );

    await client.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
    console.warn(`\n  Dropped test database: ${testDbName}`);
  } finally {
    await client.end();
  }
}
