import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import type { Knex } from 'knex';
import type { Application } from 'express';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { agent } from 'supertest';
import { getApp } from '@src/app';
import { initConfig } from '@src/common/config';
import { SERVICES } from '@common/constants';

describe('unmatched routes', function () {
  let app: Application;
  let db: Knex;

  beforeAll(async function () {
    await initConfig(true);

    const [a, container] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: await jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });

    app = a;
    db = container.resolve<Knex>(SERVICES.DB_CONNECTION);
  });

  afterAll(async function () {
    await db.destroy();
  });

  it('a route matching no router at all (an unknown docs sub-path) falls through to a JSON 404', async function () {
    // Anything under /product is validated (and 404'd) by express-openapi-validator itself before
    // it can reach this fallback; the docs viewer is mounted un-validated, so an unknown sub-path
    // under it is what actually reaches the app's own catch-all "not found" handler.
    const response = await agent(app).get('/docs/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Route GET /docs/does-not-exist was not found' });
  });
});
