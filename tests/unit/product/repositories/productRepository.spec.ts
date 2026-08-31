import type { Knex } from 'knex';
import { describe, expect, it, vi } from 'vitest';
import { ProductRepository } from '@src/product/repositories/productRepository';
import { buildProductInput } from '@tests/factories/product.factory';

describe('ProductRepository', () => {
  describe('#create', () => {
    it('should throws when the insert does not come back with a generated id', async () => {
      const queryBuilder = {
        insert: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      const fakeDb = vi.fn().mockReturnValue(queryBuilder) as unknown as Knex;
      const repository = new ProductRepository(fakeDb);

      await expect(repository.create(buildProductInput())).rejects.toThrow('Insert into products did not return an id');
    });
  });
});
