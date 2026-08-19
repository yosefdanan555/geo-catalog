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

export const registerExternalValues = (options?: RegisterOptions): DependencyContainer => {
  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: getConfig() } },
    {
      token: SERVICES.LOGGER,
      provider: {
        useFactory: instancePerContainerCachingFactory(async (container) => {
          const config = container.resolve<ConfigType>(SERVICES.CONFIG);
          const loggerConfig = config.get('telemetry.logger');

          return jsLogger({
            ...loggerConfig,
            prettyPrint: loggerConfig.prettyPrint,
            mixin: getOtelMixin(),
          });
        }),
      },
    },

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
          const config = container.resolve<ConfigType>(SERVICES.CONFIG);
          config.initializeMetrics(metricsRegistry);
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
