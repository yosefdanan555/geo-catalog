import { AxiosInstance } from 'axios';
import { db } from '../../src/libs/db/knex';
import { buildProductInput, telAvivPolygon } from '../factories/product.factory';
import { startTestServer, TestServer } from '../helpers/test-server';

describe('Products CRUD API', () => {
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

  describe('POST /api/v1/products', () => {
    test('given a valid payload, creates the product and returns it with a generated id', async () => {
      const payload = buildProductInput({
        description: 'Ortho imagery of Tel Aviv',
        bounding_polygon: telAvivPolygon(),
      });

      const response = await client.post('/api/v1/products', payload);

      expect(response.status).toBe(201);
      expect(response.data).toEqual({
        ...payload,
        id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      });
    });

    test('given optional fields are omitted, the response omits them rather than returning null', async () => {
      const payload = buildProductInput();

      const response = await client.post('/api/v1/products', payload);

      expect(response.status).toBe(201);
      expect(response.data).toEqual({ ...payload, id: expect.any(String) });
      expect(response.data).not.toHaveProperty('bounding_polygon');
      expect(response.data).not.toHaveProperty('description');
      expect(response.data).not.toHaveProperty('resolution_best');
    });

    test('given a body missing a required field, responds 400 and creates nothing', async () => {
      const { type, ...payloadWithoutType } = buildProductInput();

      const response = await client.post('/api/v1/products', payloadWithoutType);

      expect(response.status).toBe(400);
      expect(response.data.message).toEqual(expect.any(String));
      await expect(countProducts()).resolves.toBe(0);
    });

    test('given an invalid enum value, responds 400', async () => {
      const response = await client.post('/api/v1/products', { ...buildProductInput(), type: 'not-a-real-type' });

      expect(response.status).toBe(400);
    });

    test('given a name longer than 48 characters, responds 400', async () => {
      const response = await client.post('/api/v1/products', buildProductInput({ name: 'x'.repeat(49) }));

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/products/:id', () => {
    test('given an id that exists, returns that product', async () => {
      const created = (await client.post('/api/v1/products', buildProductInput())).data;

      const response = await client.get(`/api/v1/products/${created.id}`);

      expect(response.status).toBe(200);
      expect(response.data).toEqual(created);
    });

    test('given an id that does not exist, responds 404', async () => {
      const response = await client.get('/api/v1/products/00000000-0000-0000-0000-000000000000');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/v1/products/:id', () => {
    test('given a valid replacement, updates the product and persists it (verified via a fresh GET)', async () => {
      const created = (await client.post('/api/v1/products', buildProductInput())).data;
      const replacement = buildProductInput({ name: 'Renamed Product', type: 'QMesh', consumption_protocol: 'XYZ' });

      const updateResponse = await client.put(`/api/v1/products/${created.id}`, replacement);
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.data).toEqual({ ...replacement, id: created.id });

      // 6.3: assert the new state through the public API, not just trust the mutation's own response.
      const getResponse = await client.get(`/api/v1/products/${created.id}`);
      expect(getResponse.data).toEqual(updateResponse.data);
    });

    test('given an id that does not exist, responds 404', async () => {
      const response = await client.put(
        '/api/v1/products/00000000-0000-0000-0000-000000000000',
        buildProductInput()
      );

      expect(response.status).toBe(404);
    });

    test('given a body missing a required field, responds 400 and leaves the existing product untouched', async () => {
      const created = (await client.post('/api/v1/products', buildProductInput({ name: 'Original' }))).data;
      const { consumption_protocol, ...payloadWithoutProtocol } = buildProductInput();

      const updateResponse = await client.put(`/api/v1/products/${created.id}`, payloadWithoutProtocol);
      expect(updateResponse.status).toBe(400);

      const getResponse = await client.get(`/api/v1/products/${created.id}`);
      expect(getResponse.data).toEqual(created);
    });
  });

  describe('DELETE /api/v1/products/:id', () => {
    test('given an id that exists, deletes it and it is no longer reachable', async () => {
      const created = (await client.post('/api/v1/products', buildProductInput())).data;

      const deleteResponse = await client.delete(`/api/v1/products/${created.id}`);
      expect(deleteResponse.status).toBe(204);

      const getResponse = await client.get(`/api/v1/products/${created.id}`);
      expect(getResponse.status).toBe(404);
    });

    test('given an id that does not exist, responds 404', async () => {
      const response = await client.delete('/api/v1/products/00000000-0000-0000-0000-000000000000');

      expect(response.status).toBe(404);
    });

    test('deleting one product leaves unrelated products unaffected (no side effects)', async () => {
      const keep = (await client.post('/api/v1/products', buildProductInput({ name: 'Keep Me' }))).data;
      const remove = (await client.post('/api/v1/products', buildProductInput({ name: 'Remove Me' }))).data;

      await client.delete(`/api/v1/products/${remove.id}`);

      const getResponse = await client.get(`/api/v1/products/${keep.id}`);
      expect(getResponse.status).toBe(200);
      expect(getResponse.data).toEqual(keep);
    });
  });
});

async function countProducts(): Promise<number> {
  const [row] = await db('products').count<{ count: string }[]>({ count: '*' });
  return Number(row?.count ?? 0);
}
