import type { Knex } from 'knex';

const PRODUCT_TYPE_ENUM = 'product_type';
const CONSUMPTION_PROTOCOL_ENUM = 'consumption_protocol';
const NAME_MAX_LENGTH = 48;

export async function up(knex: Knex): Promise<void> {
  // PostGIS gives us geometry columns + spatial operators (ST_Intersects, ST_Contains, ST_Within).
  // pgcrypto gives us gen_random_uuid() for server-generated primary keys.
  await knex.raw('CREATE EXTENSION IF NOT EXISTS postgis');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await knex.raw(`
    CREATE TYPE ${PRODUCT_TYPE_ENUM} AS ENUM ('raster', 'rasterized vector', '3d tiles', 'QMesh')
  `);
  await knex.raw(`
    CREATE TYPE ${CONSUMPTION_PROTOCOL_ENUM} AS ENUM ('WMS', 'WMTS', 'XYZ', '3D Tiles')
  `);

  await knex.schema.createTable('products', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
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

  // GiST index is what makes ST_Intersects/ST_Contains/ST_Within fast on this table.
  await knex.raw('CREATE INDEX products_bounding_polygon_gix ON products USING GIST (bounding_polygon)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('products');
  await knex.raw(`DROP TYPE IF EXISTS ${CONSUMPTION_PROTOCOL_ENUM}`);
  await knex.raw(`DROP TYPE IF EXISTS ${PRODUCT_TYPE_ENUM}`);
}
