import { AxiosInstance } from 'axios';
import { db } from '../../src/libs/db/knex';
import { buildProductInput, israelPolygon, newYorkPolygon, telAvivPolygon } from '../factories/product.factory';
import { startTestServer, TestServer } from '../helpers/test-server';

describe('GET /api/v1/products (search)', () => {
  let server: TestServer;
  let client: AxiosInstance;

  beforeAll(async () => {
    server = await startTestServer();
    client = server.client;
  });

  beforeEach(async () => {
    await db('products').truncate();
  });

  afterAll(async () => {
    await server.close();
    await db.destroy();
  });

  async function createProduct(overrides: Parameters<typeof buildProductInput>[0] = {}) {
    const response = await client.post('/api/v1/products', buildProductInput(overrides));
    return response.data;
  }

  function names(response: { data: Array<{ name: string }> }): string[] {
    return response.data.map((p) => p.name);
  }

  describe('equality filters (strings and enums)', () => {
    test('given ?name=X, returns only the product with that exact name', async () => {
      await createProduct({ name: 'Ortho 2024' });
      await createProduct({ name: 'Ortho 2023' });

      const response = await client.get('/api/v1/products', { params: { name: 'Ortho 2024' } });

      expect(response.status).toBe(200);
      expect(names(response)).toEqual(['Ortho 2024']);
    });

    test('given ?type=X, returns only products of that type', async () => {
      await createProduct({ type: 'raster' });
      await createProduct({ type: 'QMesh' });

      const response = await client.get('/api/v1/products', { params: { type: 'QMesh' } });

      expect(response.status).toBe(200);
      expect(response.data).toHaveLength(1);
      expect(response.data[0].type).toBe('QMesh');
    });

    test('given ?consumption_protocol=X, returns only products with that protocol', async () => {
      await createProduct({ consumption_protocol: 'WMS' });
      await createProduct({ consumption_protocol: 'XYZ' });

      const response = await client.get('/api/v1/products', { params: { consumption_protocol: 'XYZ' } });

      expect(response.status).toBe(200);
      expect(response.data).toHaveLength(1);
      expect(response.data[0].consumption_protocol).toBe('XYZ');
    });
  });

  describe('numeric filters (greater, greaterEqual, less, lessEqual, equal)', () => {
    beforeEach(async () => {
      await createProduct({ name: 'Low Res', resolution_best: 10 });
      await createProduct({ name: 'Mid Res', resolution_best: 5 });
      await createProduct({ name: 'High Res', resolution_best: 0.5 });
    });

    test('resolution_best_gt returns strictly greater values', async () => {
      const response = await client.get('/api/v1/products', { params: { resolution_best_gt: 5 } });
      expect(names(response)).toEqual(['Low Res']);
    });

    test('resolution_best_gte returns greater-or-equal values', async () => {
      const response = await client.get('/api/v1/products', { params: { resolution_best_gte: 5 } });
      expect(names(response).sort()).toEqual(['Low Res', 'Mid Res']);
    });

    test('resolution_best_lt returns strictly lesser values', async () => {
      const response = await client.get('/api/v1/products', { params: { resolution_best_lt: 5 } });
      expect(names(response)).toEqual(['High Res']);
    });

    test('resolution_best_lte returns lesser-or-equal values', async () => {
      const response = await client.get('/api/v1/products', { params: { resolution_best_lte: 5 } });
      expect(names(response).sort()).toEqual(['High Res', 'Mid Res']);
    });

    test('resolution_best_eq returns the exact match', async () => {
      const response = await client.get('/api/v1/products', { params: { resolution_best_eq: 5 } });
      expect(names(response)).toEqual(['Mid Res']);
    });

    test('min_zoom and max_zoom filters are wired the same way as resolution_best', async () => {
      await db('products').truncate();
      await createProduct({ name: 'Zoomed In', min_zoom: 10, max_zoom: 18 });
      await createProduct({ name: 'Zoomed Out', min_zoom: 0, max_zoom: 5 });

      const minZoomResponse = await client.get('/api/v1/products', { params: { min_zoom_gte: 10 } });
      expect(names(minZoomResponse)).toEqual(['Zoomed In']);

      const maxZoomResponse = await client.get('/api/v1/products', { params: { max_zoom_lte: 5 } });
      expect(names(maxZoomResponse)).toEqual(['Zoomed Out']);
    });
  });

  describe('combining filters (implicit AND, no OR/NOT)', () => {
    test('only returns rows matching every provided filter at once', async () => {
      await createProduct({ name: 'A', type: 'raster', resolution_best: 1 });
      await createProduct({ name: 'B', type: 'raster', resolution_best: 100 });
      await createProduct({ name: 'C', type: 'QMesh', resolution_best: 1 });

      const response = await client.get('/api/v1/products', {
        params: { type: 'raster', resolution_best_lte: 10 },
      });

      expect(names(response)).toEqual(['A']);
    });
  });

  describe('spatial filters (intersects, contains, within)', () => {
    test('intersects returns only products whose bounding polygon overlaps the given geometry', async () => {
      await createProduct({ name: 'Tel Aviv Ortho', bounding_polygon: telAvivPolygon() });
      await createProduct({ name: 'New York Map', bounding_polygon: newYorkPolygon() });

      const response = await client.get('/api/v1/products', { params: { intersects: 'POINT(34.75 32.05)' } });

      expect(response.status).toBe(200);
      expect(names(response)).toEqual(['Tel Aviv Ortho']);
    });

    test('within returns only products whose bounding polygon is fully inside the given geometry', async () => {
      await createProduct({ name: 'Tel Aviv Ortho', bounding_polygon: telAvivPolygon() });
      await createProduct({ name: 'New York Map', bounding_polygon: newYorkPolygon() });

      const response = await client.get('/api/v1/products', { params: { within: wktFromPolygon(israelPolygon()) } });

      expect(response.status).toBe(200);
      expect(names(response)).toEqual(['Tel Aviv Ortho']);
    });

    test('contains returns only products whose bounding polygon fully contains the given geometry', async () => {
      await createProduct({ name: 'Tel Aviv Ortho', bounding_polygon: telAvivPolygon() });
      await createProduct({ name: 'New York Map', bounding_polygon: newYorkPolygon() });

      const response = await client.get('/api/v1/products', { params: { contains: 'POINT(34.75 32.05)' } });

      expect(response.status).toBe(200);
      expect(names(response)).toEqual(['Tel Aviv Ortho']);
    });

    test('rejects a malformed geometry string with 400 instead of a raw DB error', async () => {
      const response = await client.get('/api/v1/products', { params: { intersects: 'not-a-geometry' } });

      expect(response.status).toBe(400);
    });
  });
});

function wktFromPolygon(polygon: ReturnType<typeof israelPolygon>): string {
  const [ring] = polygon.coordinates;
  const points = (ring ?? []).map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `POLYGON((${points}))`;
}
