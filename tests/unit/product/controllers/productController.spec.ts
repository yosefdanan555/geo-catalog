import type { NextFunction } from 'express';
import { jsLogger } from '@map-colonies/js-logger';
import { Registry } from 'prom-client';
import httpStatus from 'http-status-codes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductController } from '@src/product/controllers/productController';
import type { ProductManager } from '@src/product/models/productManager';
import { buildProductInput } from '@tests/factories/product.factory';

/**
 * A plain function-property double, not `Response` itself: the real interface's methods carry an
 * implicit `this`, which trips `@typescript-eslint/unbound-method` the moment one is passed to
 * `expect(...)` detached from its object (exactly what asserting on `res.status` below does).
 */
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

/**
 * Every controller method is an `async` `TypedRequestHandlers` handler, each with its own
 * operation-specific `Request`/`Response` shape — reusing plain `Request`/`Response` for a loosely
 * shaped test double doesn't structurally match any of them. Inferring `Req`/`Res` straight off the
 * `handler` argument (rather than importing/reconstructing each operation's exact generic shape)
 * keeps every call site a plain object literal, and this project's `RequestHandler` return type is
 * `void` even though these are all really `async` — routing through `unknown` lets the test await it.
 */
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
    // Fresh Registry per test: prom-client throws if the same metric name is registered twice on one registry.
    controller = new ProductController(await jsLogger({ enabled: false }), manager as unknown as ProductManager, new Registry());
  });

  describe('#createProduct', () => {
    it('creates the product and responds 201', async () => {
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

    it('forwards a manager failure to next instead of responding', async () => {
      const error = new Error('boom');
      manager.create.mockRejectedValue(error);
      const res = buildRes();

      await invoke(controller.createProduct, { body: buildProductInput() }, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('#searchProducts', () => {
    it('returns matching products with 200', async () => {
      const products = [{ ...buildProductInput(), id: 'some-id' }];
      manager.search.mockResolvedValue(products);
      const res = buildRes();

      await invoke(controller.searchProducts, { query: { type: 'raster' } }, res, next);

      expect(manager.search).toHaveBeenCalledWith({ type: 'raster' });
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(products);
    });

    it('forwards a manager failure to next', async () => {
      const error = new Error('bad geometry');
      manager.search.mockRejectedValue(error);
      const res = buildRes();

      await invoke(controller.searchProducts, { query: {} }, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('#getProductById', () => {
    it('returns the product with 200', async () => {
      const product = { ...buildProductInput(), id: 'some-id' };
      manager.getById.mockResolvedValue(product);
      const res = buildRes();

      await invoke(controller.getProductById, { params: { id: 'some-id' } }, res, next);

      expect(manager.getById).toHaveBeenCalledWith('some-id');
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(product);
    });

    it('forwards a NotFoundError to next', async () => {
      const error = new Error('not found');
      manager.getById.mockRejectedValue(error);
      const res = buildRes();

      await invoke(controller.getProductById, { params: { id: 'missing' } }, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('#updateProduct', () => {
    it('returns the updated product with 200', async () => {
      const input = buildProductInput();
      const updated = { ...input, id: 'some-id' };
      manager.update.mockResolvedValue(updated);
      const res = buildRes();

      await invoke(controller.updateProduct, { params: { id: 'some-id' }, body: input }, res, next);

      expect(manager.update).toHaveBeenCalledWith('some-id', input);
      expect(res.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('forwards a NotFoundError to next', async () => {
      const error = new Error('not found');
      manager.update.mockRejectedValue(error);
      const res = buildRes();

      await invoke(controller.updateProduct, { params: { id: 'missing' }, body: buildProductInput() }, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('#deleteProduct', () => {
    it('responds 204 with no body', async () => {
      manager.remove.mockResolvedValue(undefined);
      const res = buildRes();

      await invoke(controller.deleteProduct, { params: { id: 'some-id' } }, res, next);

      expect(manager.remove).toHaveBeenCalledWith('some-id');
      expect(res.status).toHaveBeenCalledWith(httpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalledWith();
    });

    it('forwards a NotFoundError to next', async () => {
      const error = new Error('not found');
      manager.remove.mockRejectedValue(error);
      const res = buildRes();

      await invoke(controller.deleteProduct, { params: { id: 'missing' } }, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
