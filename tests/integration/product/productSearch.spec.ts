import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import type { Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequestSender, expectResponseStatusFactory, type ExpectResponseStatus, type RequestSender } from '@map-colonies/openapi-supertest';
import type { paths, operations } from '@openapi';
import { getApp } from '@src/app';
import { initConfig } from '@src/common/config';
import { SERVICES } from '@common/constants';
import { buildProductInput, israelPolygon, newYorkPolygon, telAvivPolygon } from '@tests/factories/product.factory';

const expectResponseStatus: ExpectResponseStatus = expectResponseStatusFactory(expect);

describe('GET /product (search)', function () {
  let requestSender: RequestSender<paths, operations>;
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

    requestSender = await createRequestSender<paths, operations>('openapi3.yaml', app);
    db = container.resolve<Knex>(SERVICES.DB_CONNECTION);
  });

  beforeEach(async function () {
    await db('products').truncate();
  });

  afterAll(async function () {
    await db.destroy();
  });

  async function createProduct(overrides: Parameters<typeof buildProductInput>[0] = {}): Promise<{ name: string }> {
    const response = await requestSender.createProduct({ requestBody: buildProductInput(overrides) });
    expectResponseStatus(response, 201);
    return response.body;
  }

  function names(response: { body: { name: string }[] }): string[] {
    return response.body.map((p) => p.name);
  }

  describe('equality filters (strings and enums)', function () {
    it('should given ?name=X, returns only the product with that exact name', async function () {
      await createProduct({ name: 'Ortho 2024' });
      await createProduct({ name: 'Ortho 2023' });

      const response = await requestSender.searchProducts({ queryParams: { name: 'Ortho 2024' } });

      expectResponseStatus(response, 200);

      expect(names(response)).toEqual(['Ortho 2024']);
    });

    it('should given ?type=X, returns only products of that type', async function () {
      await createProduct({ type: 'raster' });
      await createProduct({ type: 'QMesh' });

      const response = await requestSender.searchProducts({ queryParams: { type: 'QMesh' } });

      expectResponseStatus(response, 200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]?.type).toBe('QMesh');
    });

    it('should given ?consumption_protocol=X, returns only products with that protocol', async function () {
      await createProduct({ consumption_protocol: 'WMS' });
      await createProduct({ consumption_protocol: 'XYZ' });

      const response = await requestSender.searchProducts({ queryParams: { consumption_protocol: 'XYZ' } });

      expectResponseStatus(response, 200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]?.consumption_protocol).toBe('XYZ');
    });
  });

  describe('numeric filters (greater, greaterEqual, less, lessEqual, equal)', function () {
    beforeEach(async function () {
      await createProduct({ name: 'Low Res', resolution_best: 10 });
      await createProduct({ name: 'Mid Res', resolution_best: 5 });
      await createProduct({ name: 'High Res', resolution_best: 0.5 });
    });

    it('should resolution_best_gt returns strictly greater values', async function () {
      const response = await requestSender.searchProducts({ queryParams: { resolution_best_gt: 5 } });
      expectResponseStatus(response, 200);

      expect(names(response)).toEqual(['Low Res']);
    });

    it('should resolution_best_gte returns greater-or-equal values', async function () {
      const response = await requestSender.searchProducts({ queryParams: { resolution_best_gte: 5 } });
      expectResponseStatus(response, 200);

      expect(names(response).sort()).toEqual(['Low Res', 'Mid Res']);
    });

    it('should resolution_best_lt returns strictly lesser values', async function () {
      const response = await requestSender.searchProducts({ queryParams: { resolution_best_lt: 5 } });
      expectResponseStatus(response, 200);

      expect(names(response)).toEqual(['High Res']);
    });

    it('should resolution_best_lte returns lesser-or-equal values', async function () {
      const response = await requestSender.searchProducts({ queryParams: { resolution_best_lte: 5 } });
      expectResponseStatus(response, 200);

      expect(names(response).sort()).toEqual(['High Res', 'Mid Res']);
    });

    it('should resolution_best_eq returns the exact match', async function () {
      const response = await requestSender.searchProducts({ queryParams: { resolution_best_eq: 5 } });
      expectResponseStatus(response, 200);

      expect(names(response)).toEqual(['Mid Res']);
    });

    it('should min_zoom and max_zoom filters are wired the same way as resolution_best', async function () {
      await db('products').truncate();
      await createProduct({ name: 'Zoomed In', min_zoom: 10, max_zoom: 18 });
      await createProduct({ name: 'Zoomed Out', min_zoom: 0, max_zoom: 5 });

      const minZoomResponse = await requestSender.searchProducts({ queryParams: { min_zoom_gte: 10 } });
      expectResponseStatus(minZoomResponse, 200);

      expect(names(minZoomResponse)).toEqual(['Zoomed In']);

      const maxZoomResponse = await requestSender.searchProducts({ queryParams: { max_zoom_lte: 5 } });
      expectResponseStatus(maxZoomResponse, 200);

      expect(names(maxZoomResponse)).toEqual(['Zoomed Out']);
    });
  });

  describe('combining filters (implicit AND, no OR/NOT)', function () {
    it('should only returns rows matching every provided filter at once', async function () {
      await createProduct({ name: 'A', type: 'raster', resolution_best: 1 });
      await createProduct({ name: 'B', type: 'raster', resolution_best: 100 });
      await createProduct({ name: 'C', type: 'QMesh', resolution_best: 1 });

      const response = await requestSender.searchProducts({ queryParams: { type: 'raster', resolution_best_lte: 10 } });

      expectResponseStatus(response, 200);

      expect(names(response)).toEqual(['A']);
    });
  });

  describe('spatial filters (intersects, contains, within)', function () {
    it('should intersects returns only products whose bounding polygon overlaps the given geometry', async function () {
      await createProduct({ name: 'Tel Aviv Ortho', bounding_polygon: telAvivPolygon() });
      await createProduct({ name: 'New York Map', bounding_polygon: newYorkPolygon() });

      const response = await requestSender.searchProducts({ queryParams: { intersects: 'POINT(34.75 32.05)' } });

      expectResponseStatus(response, 200);

      expect(names(response)).toEqual(['Tel Aviv Ortho']);
    });

    it('should within returns only products whose bounding polygon is fully inside the given geometry', async function () {
      await createProduct({ name: 'Tel Aviv Ortho', bounding_polygon: telAvivPolygon() });
      await createProduct({ name: 'New York Map', bounding_polygon: newYorkPolygon() });

      const response = await requestSender.searchProducts({ queryParams: { within: wktFromPolygon(israelPolygon()) } });

      expectResponseStatus(response, 200);

      expect(names(response)).toEqual(['Tel Aviv Ortho']);
    });

    it('should contains returns only products whose bounding polygon fully contains the given geometry', async function () {
      await createProduct({ name: 'Tel Aviv Ortho', bounding_polygon: telAvivPolygon() });
      await createProduct({ name: 'New York Map', bounding_polygon: newYorkPolygon() });

      const response = await requestSender.searchProducts({ queryParams: { contains: 'POINT(34.75 32.05)' } });

      expectResponseStatus(response, 200);

      expect(names(response)).toEqual(['Tel Aviv Ortho']);
    });

    it('should rejects a malformed geometry string with 400 instead of a raw DB error', async function () {
      const response = await requestSender.searchProducts({ queryParams: { intersects: 'not-a-geometry' } });

      expectResponseStatus(response, 400);
    });
  });
});

function wktFromPolygon(polygon: ReturnType<typeof israelPolygon>): string {
  const [ring] = polygon.coordinates;
  const points = (ring ?? []).map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `POLYGON((${points}))`;
}
