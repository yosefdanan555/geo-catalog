import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import type { Knex } from 'knex';
import { describe, it, expect } from 'vitest';
import { getApp } from '@src/app';
import { initConfig } from '@src/common/config';
import { SERVICES } from '@common/constants';
import { tracingFactory } from '@common/tracing';

describe('onSignal (graceful shutdown)', function () {
  it('should stop tracing and destroy the db connection', async function () {
    await initConfig(true);
    // `getTracing()` (used inside the real `onSignal`) throws unless tracing was set up first —
    // normally done once by the instrumentation entrypoint, which tests never load.
    tracingFactory({ isEnabled: false });

    const [, container] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: await jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });

    const db = container.resolve<Knex>(SERVICES.DB_CONNECTION);
    const onSignal = container.resolve<() => Promise<void>>('onSignal');

    await onSignal();

    // A destroyed knex pool rejects any further query instead of running it.
    await expect(db.raw('select 1')).rejects.toThrow();
  });
});
