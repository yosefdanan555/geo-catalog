import type { NextFunction } from 'express';
import { jsLogger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import httpStatus from 'http-status-codes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductController from '@src/product/controllers/productController';
import type { ProductManager } from '@src/product/models/productManager';
import { buildProductInput } from '@tests/factories/product.factory';

interface FakeResponse {
  status: (code: number) => FakeResponse;
  json: (body: unknown) => FakeResponse;
  send: (body?: unknown) => FakeResponse;
}

function buildRes(): FakeResponse {
  const res = {} as FakeResponse;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

async function invoke<Req, Res>(
  handler: (req: Req, res: Res, next: NextFunction) => unknown,
  req: unknown,
  res: unknown,
  next: NextFunction
): Promise<void> {
  await (handler(req as Req, res as Res, next) as Promise<void>);
}

let manager: {
  create: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
};
let controller: ProductController;
let registry: Registry;
let next: NextFunction & ReturnType<typeof vi.fn>;

describe('ProductController', () => {
  beforeEach(async function () {
    manager = {
      create: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      search: vi.fn(),
    };
    next = vi.fn() as typeof next;
    registry = new Registry();
    controller = new ProductController(await jsLogger({ enabled: false }), manager as unknown as ProductManager, registry);
  });

  describe('#createProduct', () => {
    it('should creates the product and responds 201', async () => {
      const input = buildProductInput();
      const created = { ...input, id: 'some-id' };
      manager.create.mockResolvedValue(created);
      const res = buildRes();

      await invoke(controller.createProduct, { body: input }, res, next);

      expect(manager.create).toHaveBeenCalledWith(input);
      expect(res.status).toHaveBeenCalledWith(httpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith(created);
      expect(next).not.toHaveBeenCalled();
    });

    it('should forwards a manager failure to next instead of responding', async () => {
      const error = new Error('boom');
      manager.create.mockRejectedValue(error);
      const res = buildRes();

      await invoke(controller.createProduct, { body: buildProductInput() }, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('#searchProducts', () => {
    it('should returns matching products with 200', async () => {
      const products = [{ ...buildProductInput(), id: 'some-id' }];
      manager.search.mockResolvedValue(products);
      const res = buildRes();

      await invoke(controller.searchProducts, { query: { type: 'raster' } }, res, next);

      expect(manager.search).toHaveBeenCalledWith({ type: 'raster' });
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(products);
    });

    it('should forwards a manager failure to next', async () => {
      const error = new Error('bad geometry');
      manager.search.mockRejectedValue(error);
      const res = buildRes();

      await invoke(controller.searchProducts, { query: {} }, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('#getProductById', () => {
    it('should returns the product with 200', async () => {
      const product = { ...buildProductInput(), id: 'some-id' };
      manager.getById.mockResolvedValue(product);
      const res = buildRes();

      await invoke(controller.getProductById, { params: { id: 'some-id' } }, res, next);

      expect(manager.getById).toHaveBeenCalledWith('some-id');
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(product);
    });

    it('should forwards a NotFoundError to next', async () => {
      const error = new Error('not found');
      manager.getById.mockRejectedValue(error);
      const res = buildRes();

      await invoke(controller.getProductById, { params: { id: 'missing' } }, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('#updateProduct', () => {
    it('should returns the updated product with 200', async () => {
      const input = buildProductInput();
      const updated = { ...input, id: 'some-id' };
      manager.update.mockResolvedValue(updated);
      const res = buildRes();

      await invoke(controller.updateProduct, { params: { id: 'some-id' }, body: input }, res, next);

      expect(manager.update).toHaveBeenCalledWith('some-id', input);
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('should forwards a NotFoundError to next', async () => {
      const error = new Error('not found');
      manager.update.mockRejectedValue(error);
      const res = buildRes();

      await invoke(controller.updateProduct, { params: { id: 'missing' }, body: buildProductInput() }, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('#deleteProduct', () => {
    it('should responds 204 with no body', async () => {
      manager.remove.mockResolvedValue(undefined);
      const res = buildRes();

      await invoke(controller.deleteProduct, { params: { id: 'some-id' } }, res, next);

      expect(manager.remove).toHaveBeenCalledWith('some-id');
      expect(res.status).toHaveBeenCalledWith(httpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalledWith();
    });

    it('should forwards a NotFoundError to next', async () => {
      const error = new Error('not found');
      manager.remove.mockRejectedValue(error);
      const res = buildRes();

      await invoke(controller.deleteProduct, { params: { id: 'missing' } }, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('metrics', () => {
    /** Reads one labelled sample straight off the registry the controller registered against. */
    async function counterValue(operation: string, outcome: string): Promise<number | undefined> {
      const metric = await registry.getSingleMetric('product_operations_total')?.get();
      return metric?.values.find((sample) => sample.labels.operation === operation && sample.labels.outcome === outcome)?.value;
    }

    /**
     * A histogram reports one series per bucket plus a sum and a count. Buckets are
     * cumulative, so the `+Inf` one holds every observation for that label set —
     * and unlike the `_count` series it is reachable through typed labels.
     */
    async function durationCount(operation: string, outcome: string): Promise<number | undefined> {
      const metric = await registry.getSingleMetric('product_operation_duration_seconds')?.get();
      return metric?.values.find(
        (sample) => sample.labels.le === '+Inf' && sample.labels.operation === operation && sample.labels.outcome === outcome
      )?.value;
    }

    it('should counts a successful action and records its duration under that operation', async () => {
      manager.getById.mockResolvedValue({ id: 'some-id' });

      await invoke(controller.getProductById, { params: { id: 'some-id' } }, buildRes(), next);

      await expect(counterValue('getById', 'success')).resolves.toBe(1);
      await expect(durationCount('getById', 'success')).resolves.toBe(1);
      await expect(counterValue('getById', 'failure')).resolves.toBeUndefined();
    });

    it('should counts a thrown action as a failure and still records its duration', async () => {
      manager.search.mockRejectedValue(new Error('boom'));

      await invoke(controller.searchProducts, { query: {} }, buildRes(), next);

      await expect(counterValue('search', 'failure')).resolves.toBe(1);
      await expect(durationCount('search', 'failure')).resolves.toBe(1);
      await expect(counterValue('search', 'success')).resolves.toBeUndefined();
    });

    it('should keeps each action on its own operation label', async () => {
      const input = buildProductInput();
      manager.create.mockResolvedValue({ ...input, id: 'some-id' });
      manager.remove.mockResolvedValue(undefined);

      await invoke(controller.createProduct, { body: input }, buildRes(), next);
      await invoke(controller.createProduct, { body: input }, buildRes(), next);
      await invoke(controller.deleteProduct, { params: { id: 'some-id' } }, buildRes(), next);

      await expect(counterValue('create', 'success')).resolves.toBe(2);
      await expect(counterValue('delete', 'success')).resolves.toBe(1);
      await expect(counterValue('update', 'success')).resolves.toBeUndefined();
    });

    it('should still increments the standalone created_product counter', async () => {
      const input = buildProductInput();
      manager.create.mockResolvedValue({ ...input, id: 'some-id' });

      await invoke(controller.createProduct, { body: input }, buildRes(), next);

      const metric = await registry.getSingleMetric('created_product')?.get();

      expect(metric?.values[0]?.value).toBe(1);
    });
  });
});
