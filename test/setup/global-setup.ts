import { execSync } from 'child_process';
import path from 'path';
import { db } from '../../src/libs/db/knex';

const projectRoot = path.join(__dirname, '../..');

/**
 * Runs once before the whole test suite (in a separate context from the test files
 * themselves — see Jest's globalSetup docs). Makes `npm test` a single command:
 * brings up the isolated test Postgres+PostGIS container (idempotent — a no-op if
 * it's already running) and applies migrations, so test files only need to worry
 * about seeding/truncating rows.
 */
export default async function globalSetup(): Promise<void> {
  execSync('docker compose up -d --wait postgres-test', { cwd: projectRoot, stdio: 'inherit' });

  await db.migrate.latest();
  await db.destroy();
}
