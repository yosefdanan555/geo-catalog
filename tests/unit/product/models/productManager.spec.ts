import { jsLogger } from '@map-colonies/js-logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductManager } from '@src/product/models/productManager';
import type { ProductRepository } from '@src/product/repositories/productRepository';
import { BadRequestError, NotFoundError } from '@common/errors';
import { buildProductInput } from '@tests/factories/product.factory';

let repository: {
  create: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
};
let productManager: ProductManager;

describe('ProductManager', () => {
  beforeEach(async function () {
    repository = {
      create: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      search: vi.fn(),
    };
    productManager = new ProductManager(await jsLogger({ enabled: false }), repository as unknown as ProductRepository);
  });

  describe('#create', () => {
    it('delegates straight to the repository', async () => {
      const input = buildProductInput();
      const created = { ...input, id: 'some-id' };
      repository.create.mockResolvedValue(created);

      const result = await productManager.create(input);

      expect(result).toEqual(created);
      expect(repository.create).toHaveBeenCalledWith(input);
    });
  });

  describe('#getById', () => {
    it('returns the product when the repository finds one', async () => {
      const product = { ...buildProductInput(), id: 'some-id' };
      repository.findById.mockResolvedValue(product);

      await expect(productManager.getById('some-id')).resolves.toEqual(product);
    });

    it('throws NotFoundError when the repository finds nothing', async () => {
      repository.findById.mockResolvedValue(undefined);

      await expect(productManager.getById('missing-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('#update', () => {
    it('throws NotFoundError when the repository updates nothing', async () => {
      repository.update.mockResolvedValue(undefined);

      await expect(productManager.update('missing-id', buildProductInput())).rejects.toThrow(NotFoundError);
    });
  });

  describe('#remove', () => {
    it('throws NotFoundError when the repository removes nothing', async () => {
      repository.remove.mockResolvedValue(false);

      await expect(productManager.remove('missing-id')).rejects.toThrow(NotFoundError);
    });

    it('resolves when the repository removes a row', async () => {
      repository.remove.mockResolvedValue(true);

      await expect(productManager.remove('some-id')).resolves.toBeUndefined();
    });
  });

  describe('#search', () => {
    it('rejects a malformed WKT geometry with BadRequestError instead of hitting the repository', async () => {
      await expect(productManager.search({ intersects: 'not-a-geometry' })).rejects.toThrow(BadRequestError);
      expect(repository.search).not.toHaveBeenCalled();
    });

    it('delegates to the repository once every spatial filter looks like real WKT', async () => {
      repository.search.mockResolvedValue([]);
      const filters = { intersects: 'POINT(34.75 32.05)' };

      await productManager.search(filters);

      expect(repository.search).toHaveBeenCalledWith(filters);
    });
  });
});
