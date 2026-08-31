import type { Application } from 'express';
import type { DependencyContainer } from 'tsyringe';
import type { Knex } from 'knex';
import { SERVICES } from '@common/constants';
import { ensureSchema } from '@common/db/schema';
import { registerExternalValues, type RegisterOptions } from './containerConfig';
import { ServerBuilder } from './serverBuilder';

async function getApp(registerOptions?: RegisterOptions): Promise<[Application, DependencyContainer]> {
  const container = await registerExternalValues(registerOptions);
  await ensureSchema(container.resolve<Knex>(SERVICES.DB_CONNECTION));
  const app = container.resolve(ServerBuilder).build();
  return [app, container];
}

export { getApp };
