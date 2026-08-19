import { Router } from 'express';
import { agent } from 'supertest';
import { Registry } from 'prom-client';
import { jsLogger } from '@map-colonies/js-logger';
import { beforeEach, describe, expect, it } from 'vitest';
import { ServerBuilder } from '@src/serverBuilder';
import type { ConfigType } from '@common/config';

/**
 * A `ConfigType` double built directly (no `@map-colonies/config` server round-trip)
 * so this suite can flip settings like compression on/off per test — something the
 * integration tests, which all share the one real config instance, can't do.
 */
function buildConfig(overrides: Record<string, unknown> = {}): ConfigType {
  const values: Record<string, unknown> = {
    openapiConfig: { filePath: './openapi3.yaml', basePath: '/docs', rawPath: '/api', uiPath: '/api' },
    'openapiConfig.filePath': './openapi3.yaml',
    'openapiConfig.basePath': '/docs',
    'server.response.compression.enabled': true,
    'server.response.compression.options': null,
    'server.request.payload': { limit: '1mb' },
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
    has: (key: string) => key in values,
  } as unknown as ConfigType;
}

describe('ServerBuilder', () => {
  let productRouter: Router;

  beforeEach(function () {
    productRouter = Router();
    // Mounted at "/product" by ServerBuilder, so this responds to exactly what the real spec
    // defines as GET /product (searchProducts, no required query params) — anything else (e.g. a
    // made-up sub-path) would get rejected by the OpenAPI request validator before ever reaching it.
    productRouter.get('/', (_req, res) => res.status(200).json({ probed: true }));
  });

  async function build(configOverrides: Record<string, unknown> = {}): Promise<ReturnType<ServerBuilder['build']>> {
    const logger = await jsLogger({ enabled: false });
    // Fresh Registry per build(): prom-client throws if the same metric name is registered twice on one registry.
    const builder = new ServerBuilder(buildConfig(configOverrides), logger, new Registry(), productRouter);
    return builder.build();
  }

  it('mounts the injected router under /product', async () => {
    const app = await build();

    const response = await agent(app).get('/product');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ probed: true });
  });

  it('mounts the OpenAPI docs viewer at the configured base path', async () => {
    const app = await build();

    const response = await agent(app).get('/docs/api/');

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
  });

  it('applies compression middleware when enabled', async () => {
    const app = await build({ 'server.response.compression.enabled': true });

    const response = await agent(app).get('/product');

    expect(response.status).toBe(200);
  });

  it('skips compression middleware when disabled', async () => {
    const app = await build({ 'server.response.compression.enabled': false });

    const response = await agent(app).get('/product');

    expect(response.status).toBe(200);
  });

  it('falls back to a JSON 404 for a route that matched no router (e.g. an unknown docs sub-path)', async () => {
    const app = await build();

    const response = await agent(app).get('/docs/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Route GET /docs/does-not-exist was not found' });
  });
});
