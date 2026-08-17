import { db } from './knex';
import { logger } from '../logger';

async function run(): Promise<void> {
  const direction = process.argv[2] ?? 'latest';

  if (direction === 'latest') {
    const [, migrations] = await db.migrate.latest();
    logger.info('Ran migrations', migrations);
  } else if (direction === 'rollback') {
    const [, migrations] = await db.migrate.rollback();
    logger.info('Rolled back migrations', migrations);
  } else {
    throw new Error(`Unknown migrate direction "${direction}", expected "latest" or "rollback"`);
  }
}

run()
  .catch((error) => {
    logger.error('Migration failed', error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
