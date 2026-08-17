import knex from 'knex';
import { createConnectionOptions } from './createConnection';

async function run(): Promise<void> {
  const direction = process.argv[2] ?? 'latest';
  const db = knex(createConnectionOptions());

  try {
    if (direction === 'latest') {
      const [, migrations] = (await db.migrate.latest()) as [number, string[]];
      console.log('Ran migrations', migrations);
    } else if (direction === 'rollback') {
      const [, migrations] = (await db.migrate.rollback()) as [number, string[]];
      console.log('Rolled back migrations', migrations);
    } else {
      throw new Error(`Unknown migrate direction "${direction}", expected "latest" or "rollback"`);
    }
  } finally {
    await db.destroy();
  }
}

run().catch((error: unknown) => {
  console.error('Migration failed', error);
  process.exitCode = 1;
});
