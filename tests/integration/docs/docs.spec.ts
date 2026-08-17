import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import type { Knex } from 'knex';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import httpStatusCodes from 'http-status-codes';
import { getApp } from '@src/app';
import { SERVICES } from '@src/common/constants';
import { initConfig } from '@src/common/config';
import { DocsRequestSender } from './helpers/docsRequestSender';

describe('docs', function () {
  let requestSender: DocsRequestSender;
  let db: Knex;

  beforeAll(async function () {
    await initConfig(true);

    const [app, container] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: await jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });

    requestSender = new DocsRequestSender(app);
    db = container.resolve<Knex>(SERVICES.DB_CONNECTION);
  });

  afterAll(async function () {
    await db.destroy();
  });

  describe('Happy Path', function () {
    it('should return 200 status code and the resource', async function () {
      const response = await requestSender.getDocs();

      expect(response.status).toBe(httpStatusCodes.OK);
      expect(response.type).toBe('text/html');
    });

    it('should return 200 status code and the json spec', async function () {
      const response = await requestSender.getDocsJson();

      expect(response.status).toBe(httpStatusCodes.OK);

      expect(response.type).toBe('application/json');
      expect(response.body).toHaveProperty('openapi');
    });
  });
});
