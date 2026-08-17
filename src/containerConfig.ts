import { getOtelMixin } from '@map-colonies/tracing-utils';
import { trace } from '@opentelemetry/api';
import { Registry } from 'prom-client';
import type { Knex } from 'knex';
import { instanceCachingFactory } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe/dist/typings/types';
import { jsLogger } from '@map-colonies/js-logger';
import { type InjectionObject, registerDependencies } from '@common/dependencyRegistration';
import { SERVICES, SERVICE_NAME } from '@common/constants';
import { getTracing } from '@common/tracing';
import { dbConnectionFactory } from '@common/db/createConnection';
import { productRouterFactory, PRODUCT_ROUTER_SYMBOL } from './product/routes/productRouter';
import { getConfig } from './common/config';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const configInstance = getConfig();

  const loggerConfig = configInstance.get('telemetry.logger');

  const logger = await jsLogger({ ...loggerConfig, prettyPrint: loggerConfig.prettyPrint, mixin: getOtelMixin() });

  const tracer = trace.getTracer(SERVICE_NAME);
  const metricsRegistry = new Registry();
  configInstance.initializeMetrics(metricsRegistry);

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: configInstance } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.METRICS, provider: { useValue: metricsRegistry } },
    // Cached per-container: a knex connection pool is expensive and must be shared,
    // not re-created every time something injects SERVICES.DB_CONNECTION.
    { token: SERVICES.DB_CONNECTION, provider: { useFactory: instanceCachingFactory(dbConnectionFactory) } },
    { token: PRODUCT_ROUTER_SYMBOL, provider: { useFactory: productRouterFactory } },
    {
      token: 'onSignal',
      provider: {
        useFactory: (container: DependencyContainer) => {
          return async (): Promise<void> => {
            const db = container.resolve<Knex>(SERVICES.DB_CONNECTION);
            await Promise.all([getTracing().stop(), db.destroy()]);
          };
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
