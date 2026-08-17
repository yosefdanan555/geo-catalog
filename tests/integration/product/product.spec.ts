import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import type { Knex } from 'knex';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createRequestSender,
  expectResponseStatusFactory,
  type ExpectResponseStatus,
  type RequestSender,
} from '@map-colonies/openapi-supertest';
import type { paths, operations } from '@openapi';
import { getApp } from '@src/app';
import { initConfig } from '@src/common/config';
import { SERVICES } from '@common/constants';
import { buildProductInput } from '@tests/factories/product.factory';

const expectResponseStatus: ExpectResponseStatus = expectResponseStatusFactory(expect);

/** The wire shape of a create/update body — used below to send deliberately invalid payloads (missing a required field, a bad enum) without falling back to `any`. */
type ProductCreateBody = operations['createProduct']['requestBody']['content']['application/json'];

describe('product CRUD', function () {
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

  describe('POST /product', function () {
    it('given a valid payload, creates the product and returns it with a generated id', async function () {
      const payload = buildProductInput({ description: 'Ortho imagery of Tel Aviv' });

      const response = await requestSender.createProduct({ requestBody: payload });

      expect(response).toSatisfyApiSpec();

      expectResponseStatus(response, 201);
      const { id, ...rest } = response.body;

      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(rest).toEqual(payload);
    });

    it('given optional fields are omitted, the response omits them rather than returning null', async function () {
      const payload = buildProductInput();

      const response = await requestSender.createProduct({ requestBody: payload });

      expectResponseStatus(response, 201);
      const { id, ...rest } = response.body;

      expect(id).toEqual(expect.any(String));
      expect(rest).toEqual(payload);
      expect(response.body).not.toHaveProperty('bounding_polygon');
      expect(response.body).not.toHaveProperty('description');
      expect(response.body).not.toHaveProperty('resolution_best');
    });

    it('given a body missing a required field, responds 400 and creates nothing', async function () {
      const { type, ...payloadWithoutType } = buildProductInput();

      const response = await requestSender.createProduct({ requestBody: payloadWithoutType as unknown as ProductCreateBody });

      expectResponseStatus(response, 400);

      expect(response.body.message).toEqual(expect.any(String));
      await expect(countProducts(db)).resolves.toBe(0);
    });

    it('given an invalid enum value, responds 400', async function () {
      const response = await requestSender.createProduct({
        requestBody: { ...buildProductInput(), type: 'not-a-real-type' } as unknown as ProductCreateBody,
      });

      expectResponseStatus(response, 400);
    });

    it('given a name longer than 48 characters, responds 400', async function () {
      const response = await requestSender.createProduct({ requestBody: buildProductInput({ name: 'x'.repeat(49) }) });

      expectResponseStatus(response, 400);
    });
  });

  describe('GET /product/{id}', function () {
    it('given an id that exists, returns that product', async function () {
      const created = await requestSender.createProduct({ requestBody: buildProductInput() });
      expectResponseStatus(created, 201);

      const response = await requestSender.getProductById({ pathParams: { id: created.body.id } });

      expectResponseStatus(response, 200);

      expect(response.body).toEqual(created.body);
    });

    it('given an id that does not exist, responds 404', async function () {
      const response = await requestSender.getProductById({ pathParams: { id: '00000000-0000-0000-0000-000000000000' } });

      expectResponseStatus(response, 404);
    });
  });

  describe('PUT /product/{id}', function () {
    it('given a valid replacement, updates the product and persists it (verified via a fresh GET)', async function () {
      const created = await requestSender.createProduct({ requestBody: buildProductInput() });
      expectResponseStatus(created, 201);
      const replacement = buildProductInput({ name: 'Renamed Product', type: 'QMesh', consumption_protocol: 'XYZ' });

      const updateResponse = await requestSender.updateProduct({ pathParams: { id: created.body.id }, requestBody: replacement });
      expectResponseStatus(updateResponse, 200);

      expect(updateResponse.body).toEqual({ ...replacement, id: created.body.id });

      // Assert the new state through the public API, not just trust the mutation's own response.
      const getResponse = await requestSender.getProductById({ pathParams: { id: created.body.id } });
      expectResponseStatus(getResponse, 200);

      expect(getResponse.body).toEqual(updateResponse.body);
    });

    it('given an id that does not exist, responds 404', async function () {
      const response = await requestSender.updateProduct({
        pathParams: { id: '00000000-0000-0000-0000-000000000000' },
        requestBody: buildProductInput(),
      });

      expectResponseStatus(response, 404);
    });

    it('given a body missing a required field, responds 400 and leaves the existing product untouched', async function () {
      const created = await requestSender.createProduct({ requestBody: buildProductInput({ name: 'Original' }) });
      expectResponseStatus(created, 201);
      const { consumption_protocol: consumptionProtocol, ...payloadWithoutProtocol } = buildProductInput();

      const updateResponse = await requestSender.updateProduct({
        pathParams: { id: created.body.id },
        requestBody: payloadWithoutProtocol as unknown as ProductCreateBody,
      });
      expectResponseStatus(updateResponse, 400);

      const getResponse = await requestSender.getProductById({ pathParams: { id: created.body.id } });
      expectResponseStatus(getResponse, 200);

      expect(getResponse.body).toEqual(created.body);
    });
  });

  describe('DELETE /product/{id}', function () {
    it('given an id that exists, deletes it and it is no longer reachable', async function () {
      const created = await requestSender.createProduct({ requestBody: buildProductInput() });
      expectResponseStatus(created, 201);

      const deleteResponse = await requestSender.deleteProduct({ pathParams: { id: created.body.id } });
      expectResponseStatus(deleteResponse, 204);

      const getResponse = await requestSender.getProductById({ pathParams: { id: created.body.id } });
      expectResponseStatus(getResponse, 404);
    });

    it('given an id that does not exist, responds 404', async function () {
      const response = await requestSender.deleteProduct({ pathParams: { id: '00000000-0000-0000-0000-000000000000' } });

      expectResponseStatus(response, 404);
    });

    it('deleting one product leaves unrelated products unaffected (no side effects)', async function () {
      const keep = await requestSender.createProduct({ requestBody: buildProductInput({ name: 'Keep Me' }) });
      expectResponseStatus(keep, 201);
      const remove = await requestSender.createProduct({ requestBody: buildProductInput({ name: 'Remove Me' }) });
      expectResponseStatus(remove, 201);

      await requestSender.deleteProduct({ pathParams: { id: remove.body.id } });

      const getResponse = await requestSender.getProductById({ pathParams: { id: keep.body.id } });
      expectResponseStatus(getResponse, 200);

      expect(getResponse.body).toEqual(keep.body);
    });
  });
});

async function countProducts(db: Knex): Promise<number> {
  const [row] = await db('products').count<{ count: string }[]>({ count: '*' });
  return Number(row?.count ?? 0);
}
