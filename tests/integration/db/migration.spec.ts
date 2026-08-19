import knex, { type Knex } from 'knex';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { createConnectionOptions } from '@common/db/createConnection';
import { up, down } from '@common/db/migrations/20260813120000_create_products_table';

/**
 * globalSetup applies this migration via knex's own `migrate.latest()` API, which
 * runs outside this file's instrumented process — so exercising `up`/`down`
 * directly here is what actually gives them test coverage. Runs against its own
 * connection (not any per-spec-file container's), and restores the schema at the
 * end so every other integration file still finds the table it expects.
 */
describe('products table migration', function () {
  let db: Knex;

  beforeAll(function () {
    db = knex(createConnectionOptions());
  });

  afterAll(async function () {
    await db.destroy();
  });

  async function typeExists(name: string): Promise<boolean> {
    const result = await db.raw<{ rows: unknown[] }>('SELECT 1 FROM pg_type WHERE typname = ?', [name]);
    return result.rows.length > 0;
  }

  async function indexExists(name: string): Promise<boolean> {
    const result = await db.raw<{ rows: unknown[] }>('SELECT 1 FROM pg_indexes WHERE indexname = ?', [name]);
    return result.rows.length > 0;
  }

  it('down() drops the table, its enum types and its spatial index; up() recreates all of it', async function () {
    await expect(db.schema.hasTable('products')).resolves.toBe(true);

    await down(db);

    await expect(db.schema.hasTable('products')).resolves.toBe(false);
    await expect(typeExists('product_type')).resolves.toBe(false);
    await expect(typeExists('consumption_protocol')).resolves.toBe(false);

    await up(db);

    await expect(db.schema.hasTable('products')).resolves.toBe(true);
    await expect(typeExists('product_type')).resolves.toBe(true);
    await expect(typeExists('consumption_protocol')).resolves.toBe(true);
    await expect(indexExists('products_bounding_polygon_gix')).resolves.toBe(true);

    const columns = await db('products').columnInfo();
    expect(Object.keys(columns).sort()).toEqual(
      [
        'id',
        'name',
        'description',
        'bounding_polygon',
        'consumption_link',
        'type',
        'consumption_protocol',
        'resolution_best',
        'min_zoom',
        'max_zoom',
      ].sort()
    );
  });

  it('down() is safe to call when the table does not already exist', async function () {
    await down(db);
    await expect(db.schema.hasTable('products')).resolves.toBe(false);

    // Not a no-op — running it twice must not throw (IF EXISTS everywhere).
    await down(db);
    await expect(db.schema.hasTable('products')).resolves.toBe(false);

    await up(db);
    await expect(db.schema.hasTable('products')).resolves.toBe(true);
  });
});
