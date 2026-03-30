/**
 * Runs BEFORE test files are imported (via Jest setupFiles).
 *
 * Overrides DATABASE_URL to point to the test database by appending "_test"
 * to the dev database name from .env. This must happen before env.validation.ts
 * runs (which is triggered when AppModule is imported).
 *
 * Why not in globalSetup? globalSetup runs in a separate worker process —
 * env changes there don't carry over to test workers.
 */
const TEST_DB_SUFFIX = '_test';

const devUrl = new URL(process.env.DATABASE_URL!);
const devDbName = devUrl.pathname.replace('/', '');

if (!devDbName.endsWith(TEST_DB_SUFFIX)) {
  devUrl.pathname = `/${devDbName}${TEST_DB_SUFFIX}`;
  process.env.DATABASE_URL = devUrl.toString();
}
