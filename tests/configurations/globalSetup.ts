import { execSync } from 'node:child_process';
import path from 'node:path';

// Runs in its own process, ahead of the `test`/config/test.json auto-selection,
// so it must set this itself before any config module (transitively) loads.
process.env.NODE_ENV = 'test';

const projectRoot = path.join(__dirname, '../..');

/**
 * Runs once before the whole `integration` project (see vitest.config.mts's
 * `globalSetup`, in a separate context from the test files themselves). Makes
 * `npm run test:integration` a single command by bringing up the isolated test
 * Postgres+PostGIS container (idempotent — a no-op if it's already running).
 *
 * Nothing here creates the schema: `getApp()` ensures it on every start, so the
 * test files get it from the same code path production does, and only need to
 * worry about truncating rows.
 */
export function setup(): void {
  execSync('docker compose up -d --wait postgres-test', { cwd: projectRoot, stdio: 'inherit' });
}

/**
 * Local dev keeps the test container running between runs — starting Postgres
 * from a cold container costs more than the tests themselves take to run. CI
 * always starts from a clean slate anyway, so only there do we tear down.
 */
export function teardown(): void {
  if (process.env.CI !== undefined) {
    execSync('docker compose down', { cwd: projectRoot, stdio: 'inherit' });
  }
}
