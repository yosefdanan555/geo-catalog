import 'reflect-metadata';

import path from 'node:path';
import knex, { type Knex } from 'knex';
import type { DependencyContainer, FactoryFunction } from 'tsyringe';
import { SERVICES } from '@common/constants';
import type { ConfigType } from '../config';

const MIN_POOL_SIZE = 0;
const MAX_POOL_SIZE = 10;

function createConnectionOptions(container: DependencyContainer): Knex.Config {
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);

  return {
    client: 'pg',
    connection: {
      ...config.db,
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
    },
    pool: { min: MIN_POOL_SIZE, max: MAX_POOL_SIZE },
  };
}

const dbConnectionFactory: FactoryFunction<Knex> = (container) => {
  return knex(createConnectionOptions(container));
};

export { createConnectionOptions, dbConnectionFactory };
