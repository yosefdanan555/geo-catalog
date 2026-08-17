import type { Knex } from 'knex';
import { db } from '../../libs/db/knex';
import { toApiProduct } from './products.mapper';
import { NumberFilter, Product, ProductInput, ProductRow, ProductSearchFilters } from './products.types';

/**
 * Data-access layer: knex queries only. Input is trusted to already be validated
 * by the layers above (OpenAPI validator for shape, ProductsService for business
 * rules like "is this a real WKT geometry?") — this file's only job is running SQL.
 */

const TABLE = 'products';

const COLUMNS = [
  'id',
  'name',
  'description',
  'consumption_link',
  'type',
  'consumption_protocol',
  'resolution_best',
  'min_zoom',
  'max_zoom',
] as const;

/** Selecting a geometry column back out as PostGIS-native GeoJSON. */
const boundingPolygonSelect = () => db.raw('ST_AsGeoJSON(bounding_polygon)::json as bounding_polygon');

function selectProducts(): Knex.QueryBuilder<ProductRow, ProductRow[]> {
  return db<ProductRow>(TABLE).select(...COLUMNS, boundingPolygonSelect());
}

/** GeoJSON -> PostGIS geometry, explicitly stamped SRID 4326 (EPSG:4326), as required by the spec. */
function toGeometryValue(polygon: ProductInput['bounding_polygon']): Knex.Raw | null {
  if (!polygon) return null;
  return db.raw('ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)', [JSON.stringify(polygon)]);
}

function toRow(input: ProductInput) {
  return {
    name: input.name,
    description: input.description ?? null,
    bounding_polygon: toGeometryValue(input.bounding_polygon),
    consumption_link: input.consumption_link ?? null,
    type: input.type,
    consumption_protocol: input.consumption_protocol,
    resolution_best: input.resolution_best ?? null,
    min_zoom: input.min_zoom ?? null,
    max_zoom: input.max_zoom ?? null,
  };
}

function applyNumberFilter(query: Knex.QueryBuilder, column: string, filter: NumberFilter): void {
  if (filter.eq !== undefined) query.where(column, '=', filter.eq);
  if (filter.gt !== undefined) query.where(column, '>', filter.gt);
  if (filter.gte !== undefined) query.where(column, '>=', filter.gte);
  if (filter.lt !== undefined) query.where(column, '<', filter.lt);
  if (filter.lte !== undefined) query.where(column, '<=', filter.lte);
}

export class ProductsDAL {
  static async create(input: ProductInput): Promise<Product> {
    const inserted = await db(TABLE).insert(toRow(input)).returning<{ id: string }[]>('id');
    const id = inserted[0]?.id;
    if (!id) throw new Error('Insert into products did not return an id');
    const product = await this.findById(id);
    // Cannot be undefined: we just inserted this row inside the same call.
    return product as Product;
  }

  static async findById(id: string): Promise<Product | undefined> {
    const row = await selectProducts().where('id', id).first();
    return row ? toApiProduct(row) : undefined;
  }

  static async update(id: string, input: ProductInput): Promise<Product | undefined> {
    const updatedCount: number = await db(TABLE).where('id', id).update(toRow(input));
    if (updatedCount === 0) return undefined;
    return this.findById(id);
  }

  static async remove(id: string): Promise<boolean> {
    const deletedCount: number = await db(TABLE).where('id', id).del();
    return deletedCount > 0;
  }

  static async search(filters: ProductSearchFilters): Promise<Product[]> {
    const query = selectProducts();

    if (filters.name !== undefined) query.where('name', filters.name);
    if (filters.type !== undefined) query.where('type', filters.type);
    if (filters.consumption_protocol !== undefined) {
      query.where('consumption_protocol', filters.consumption_protocol);
    }

    applyNumberFilter(query, 'resolution_best', {
      eq: filters.resolution_best_eq,
      gt: filters.resolution_best_gt,
      gte: filters.resolution_best_gte,
      lt: filters.resolution_best_lt,
      lte: filters.resolution_best_lte,
    });
    applyNumberFilter(query, 'min_zoom', {
      eq: filters.min_zoom_eq,
      gt: filters.min_zoom_gt,
      gte: filters.min_zoom_gte,
      lt: filters.min_zoom_lt,
      lte: filters.min_zoom_lte,
    });
    applyNumberFilter(query, 'max_zoom', {
      eq: filters.max_zoom_eq,
      gt: filters.max_zoom_gt,
      gte: filters.max_zoom_gte,
      lt: filters.max_zoom_lt,
      lte: filters.max_zoom_lte,
    });

    if (filters.intersects !== undefined) {
      query.whereRaw('ST_Intersects(bounding_polygon, ST_GeomFromText(?, 4326))', [filters.intersects]);
    }
    if (filters.contains !== undefined) {
      query.whereRaw('ST_Contains(bounding_polygon, ST_GeomFromText(?, 4326))', [filters.contains]);
    }
    if (filters.within !== undefined) {
      query.whereRaw('ST_Within(bounding_polygon, ST_GeomFromText(?, 4326))', [filters.within]);
    }

    const rows = await query.orderBy('id');
    return rows.map(toApiProduct);
  }
}
