import 'reflect-metadata';
import path from 'node:path';
import knex, { type Knex } from 'knex';
import type { FactoryFunction } from 'tsyringe';
import { getConfig } from '@common/config';

const MIN_POOL_SIZE = 0;
const MAX_POOL_SIZE = 10;

function createConnectionOptions(): Knex.Config {
  const config = getConfig();

  return {
    client: 'pg',
    connection: {
      host: config.get('db.host'),
      port: config.get('db.port'),
      user: config.get('db.username'),
      password: config.get('db.password'),
      database: config.get('db.database'),
      application_name: config.get('db.application_name'),
    },
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
