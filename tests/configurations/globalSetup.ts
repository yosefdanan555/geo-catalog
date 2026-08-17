import { execSync } from 'node:child_process';
import path from 'node:path';

// Runs in its own process, ahead of the `test` env-file auto-selection in
// src/common/db/dbConfig.ts, so it must set this itself before that module
// (transitively) loads.
process.env.NODE_ENV = 'test';

const projectRoot = path.join(__dirname, '../..');

/**
 * Runs once before the whole `integration` project (see vitest.config.mts's
 * `globalSetup`, in a separate context from the test files themselves). Makes
 * `npm run test:integration` a single command: brings up the isolated test
 * Postgres+PostGIS container (idempotent — a no-op if it's already running)
 * and applies migrations, so test files only need to worry about truncating rows.
 */
export async function setup(): Promise<void> {
  execSync('docker compose up -d --wait postgres-test', { cwd: projectRoot, stdio: 'inherit' });

  const { default: knex } = await import('knex');
  const { createConnectionOptions } = await import('../../src/common/db/createConnection.js');
  const db = knex(createConnectionOptions());
  await db.migrate.latest();
  await db.destroy();
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
