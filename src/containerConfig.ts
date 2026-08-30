import { getOtelMixin } from '@map-colonies/tracing-utils';
import { trace } from '@opentelemetry/api';
import { Registry } from 'prom-client';
import type { Knex } from 'knex';
import { instanceCachingFactory, instancePerContainerCachingFactory } from 'tsyringe';
import type { DependencyContainer } from 'tsyringe/dist/typings/types';
import { jsLogger } from '@map-colonies/js-logger';
import { type InjectionObject, registerDependencies } from '@common/dependencyRegistration';
import { SERVICE_NAME, SERVICES } from '@common/constants';
import { getTracing } from '@common/tracing';
import { dbConnectionFactory } from '@common/db/createConnection';
import { PRODUCT_ROUTER_SYMBOL, productRouterFactory } from './product/routes/productRouter';
import type { ConfigType } from './common/config';
import { getConfig } from './common/config';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const config = getConfig();

  // jsLogger is async, so the logger has to be created before registration —
  // tsyringe factories are synchronous and would otherwise hand out a Promise.
  const loggerConfig = config.get('telemetry.logger');
  const logger = await jsLogger({ ...loggerConfig, mixin: getOtelMixin() });

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: config } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    {
      token: SERVICES.TRACER,
      provider: {
        useFactory: instancePerContainerCachingFactory((_) => {
          return trace.getTracer(SERVICE_NAME);
        }),
      },
    },
    {
      token: SERVICES.METRICS,
      provider: {
        useFactory: instancePerContainerCachingFactory((container) => {
          const metricsRegistry = new Registry();
          const registeredConfig = container.resolve<ConfigType>(SERVICES.CONFIG);
          registeredConfig.initializeMetrics(metricsRegistry);
          return metricsRegistry;
        }),
      },
    },
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
