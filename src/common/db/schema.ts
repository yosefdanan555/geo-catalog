import type { Knex } from 'knex';

/**
 * Schema bootstrap, applied at application startup instead of through a separate
 * migration step. Every statement is idempotent, so a process starting against an
 * already-provisioned database converges to the same state without doing any work
 * — there is no migration history table and nothing to run by hand before booting.
 */

const TABLE = 'products';
const PRODUCT_TYPE_ENUM = 'product_type';
const CONSUMPTION_PROTOCOL_ENUM = 'consumption_protocol';
const BOUNDING_POLYGON_INDEX = 'products_bounding_polygon_gix';
const NAME_MAX_LENGTH = 48;

// Arbitrary but fixed: every replica takes this same lock, so concurrent starts
// serialize instead of racing each other's CREATEs.
const SCHEMA_LOCK_ID = 8150413;

const PRODUCT_TYPES = ['raster', 'rasterized vector', '3d tiles', 'QMesh'];
const CONSUMPTION_PROTOCOLS = ['WMS', 'WMTS', 'XYZ', '3D Tiles'];

/**
 * Postgres has no `CREATE TYPE ... IF NOT EXISTS`, so the create is attempted and
 * the `duplicate_object` it raises on any later run is swallowed. `name`/`values`
 * are module constants, never caller input, so interpolating them is safe here.
 */
async function ensureEnum(db: Knex, name: string, values: string[]): Promise<void> {
  const literals = values.map((value) => `'${value}'`).join(', ');

  await db.raw(`
    DO $$ BEGIN
      CREATE TYPE ${name} AS ENUM (${literals});
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
}

async function createSchema(db: Knex): Promise<void> {
  // PostGIS gives us geometry columns + spatial operators (ST_Intersects, ST_Contains, ST_Within).
  // pgcrypto gives us gen_random_uuid() for server-generated primary keys.
  await db.raw('CREATE EXTENSION IF NOT EXISTS postgis');
  await db.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await ensureEnum(db, PRODUCT_TYPE_ENUM, PRODUCT_TYPES);
  await ensureEnum(db, CONSUMPTION_PROTOCOL_ENUM, CONSUMPTION_PROTOCOLS);

  if (!(await db.schema.hasTable(TABLE))) {
    await db.schema.createTable(TABLE, (table) => {
      table.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
      table.string('name', NAME_MAX_LENGTH).notNullable();
      table.text('description');
      // Bounding polygon is stored as PostGIS geometry, constrained to Polygon + EPSG:4326.
      table.specificType('bounding_polygon', 'geometry(Polygon, 4326)');
      table.text('consumption_link');
      table.specificType('type', PRODUCT_TYPE_ENUM).notNullable();
      table.specificType('consumption_protocol', CONSUMPTION_PROTOCOL_ENUM).notNullable();
      table.specificType('resolution_best', 'double precision');
      table.integer('min_zoom');
      table.integer('max_zoom');
    });
  }

  // GiST index is what makes ST_Intersects/ST_Contains/ST_Within fast on this table.
  await db.raw(`CREATE INDEX IF NOT EXISTS ${BOUNDING_POLYGON_INDEX} ON ${TABLE} USING GIST (bounding_polygon)`);
}

/**
 * Creates anything this service needs that isn't already there. Safe to call on
 * every boot and from several processes at once.
 */
export async function ensureSchema(db: Knex): Promise<void> {
  await db.transaction(async (trx) => {
    // Transaction-scoped rather than session-scoped: it is released automatically
    // with the transaction, and on the same pooled connection that took it — a
    // plain pg_advisory_lock/unlock pair can land on two different connections.
    await trx.raw('SELECT pg_advisory_xact_lock(?)', [SCHEMA_LOCK_ID]);
    await createSchema(trx);
  });
}
