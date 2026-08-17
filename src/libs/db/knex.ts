import path from 'path';
import knex, { Knex } from 'knex';
import { config } from '../config';

const knexConfig: Knex.Config = {
  client: 'pg',
  connection: config.database.connectionString,
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    extension: 'ts',
  },
  pool: { min: 0, max: 10 },
};

export const db = knex(knexConfig);
