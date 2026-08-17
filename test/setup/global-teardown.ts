import { execSync } from 'child_process';
import path from 'path';

const projectRoot = path.join(__dirname, '../..');

/**
 * Local dev keeps the test container running between runs — starting Postgres
 * from a cold container costs more than the tests themselves take to run. CI
 * always starts from a clean slate anyway, so only there do we tear down.
 */
export default async function globalTeardown(): Promise<void> {
  if (process.env.CI) {
    execSync('docker compose down', { cwd: projectRoot, stdio: 'inherit' });
  }
}
