import path from 'node:path';
import knex, { type Knex } from 'knex';
import type { FactoryFunction } from 'tsyringe';
import { dbConfig } from './dbConfig';

const MIN_POOL_SIZE = 0;
const MAX_POOL_SIZE = 10;

function createConnectionOptions(): Knex.Config {
  return {
    client: 'pg',
    connection: dbConfig.connectionString,
    migrations: {
      directory: path.join(__dirname, 'migrations'),
    },
    pool: { min: MIN_POOL_SIZE, max: MAX_POOL_SIZE },
  };
}

const dbConnectionFactory: FactoryFunction<Knex> = () => {
  return knex(createConnectionOptions());
};

export { createConnectionOptions, dbConnectionFactory };
