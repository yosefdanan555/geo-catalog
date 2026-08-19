import type { Knex } from 'knex';
import { describe, expect, it, vi } from 'vitest';
import { ProductRepository } from '@src/product/repositories/productRepository';
import { buildProductInput } from '@tests/factories/product.factory';

/**
 * Full create()/findById()/etc. flows are exercised end-to-end against a real
 * Postgres+PostGIS instance in tests/integration/product/*.spec.ts. This file
 * only targets the one defensive branch that a real insert can never actually
 * trigger (Postgres always returns the generated id), so it needs a fake `db`.
 */
describe('ProductRepository', () => {
  describe('#create', () => {
    it('throws when the insert does not come back with a generated id', async () => {
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
