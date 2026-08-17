import { inject, injectable } from 'tsyringe';
import type { Knex } from 'knex';
import { SERVICES } from '@common/constants';
import { NumberFilter, Product, ProductInput, ProductRow, ProductSearchFilters } from '../models/product';

/**
 * Data-access layer: knex queries only. Input is trusted to already be validated
 * by the layers above (OpenAPI validator for shape, ProductManager for business
 * rules like "is this a real WKT geometry?") — this class's only job is running SQL.
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

function toApiProduct(row: ProductRow): Product {
  const product: Product = {
    id: row.id,
    name: row.name,
    type: row.type,
    consumption_protocol: row.consumption_protocol,
  };

  // Optional columns are NULL in Postgres when unset; here they're omitted from the
  // JSON entirely rather than sent as `null`, matching the spec's optional (not
  // nullable) properties.
  if (row.description !== null) product.description = row.description;
  if (row.bounding_polygon !== null) product.bounding_polygon = row.bounding_polygon;
  if (row.consumption_link !== null) product.consumption_link = row.consumption_link;
  if (row.resolution_best !== null) product.resolution_best = row.resolution_best;
  if (row.min_zoom !== null) product.min_zoom = row.min_zoom;
  if (row.max_zoom !== null) product.max_zoom = row.max_zoom;

  return product;
}

@injectable()
export class ProductRepository {
  public constructor(@inject(SERVICES.DB_CONNECTION) private readonly db: Knex) {}

  public async create(input: ProductInput): Promise<Product> {
    const inserted = await this.db(TABLE).insert(this.toRow(input)).returning<{ id: string }[]>('id');
    const id = inserted[0]?.id;
    if (id === undefined) throw new Error('Insert into products did not return an id');
    const product = await this.findById(id);
    // Cannot be undefined: we just inserted this row inside the same call.
    return product as Product;
  }

  public async findById(id: string): Promise<Product | undefined> {
    const row = await this.selectProducts().where('id', id).first();
    return row ? toApiProduct(row) : undefined;
  }

  public async update(id: string, input: ProductInput): Promise<Product | undefined> {
    const updatedCount: number = await this.db(TABLE).where('id', id).update(this.toRow(input));
    if (updatedCount === 0) return undefined;
    return this.findById(id);
  }

  public async remove(id: string): Promise<boolean> {
    const deletedCount: number = await this.db(TABLE).where('id', id).del();
    return deletedCount > 0;
  }

  public async search(filters: ProductSearchFilters): Promise<Product[]> {
    const query = this.selectProducts();

    if (filters.name !== undefined) query.where('name', filters.name);
    if (filters.type !== undefined) query.where('type', filters.type);
    if (filters.consumption_protocol !== undefined) {
      query.where('consumption_protocol', filters.consumption_protocol);
    }

    this.applyNumberFilter(query, 'resolution_best', {
      eq: filters.resolution_best_eq,
      gt: filters.resolution_best_gt,
      gte: filters.resolution_best_gte,
      lt: filters.resolution_best_lt,
      lte: filters.resolution_best_lte,
    });
    this.applyNumberFilter(query, 'min_zoom', {
      eq: filters.min_zoom_eq,
      gt: filters.min_zoom_gt,
      gte: filters.min_zoom_gte,
      lt: filters.min_zoom_lt,
      lte: filters.min_zoom_lte,
    });
    this.applyNumberFilter(query, 'max_zoom', {
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

  private selectProducts(): Knex.QueryBuilder<ProductRow, ProductRow[]> {
    // Selecting the geometry column back out as PostGIS-native GeoJSON.
    return this.db<ProductRow>(TABLE).select(...COLUMNS, this.db.raw('ST_AsGeoJSON(bounding_polygon)::json as bounding_polygon'));
  }

  /** GeoJSON -> PostGIS geometry, explicitly stamped SRID 4326 (EPSG:4326), as required by the spec. */
  private toGeometryValue(polygon: ProductInput['bounding_polygon']): Knex.Raw | null {
    if (!polygon) return null;
    return this.db.raw('ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)', [JSON.stringify(polygon)]);
  }

  private toRow(input: ProductInput): Record<string, unknown> {
    return {
      name: input.name,
      description: input.description ?? null,
      bounding_polygon: this.toGeometryValue(input.bounding_polygon),
      consumption_link: input.consumption_link ?? null,
      type: input.type,
      consumption_protocol: input.consumption_protocol,
      resolution_best: input.resolution_best ?? null,
      min_zoom: input.min_zoom ?? null,
      max_zoom: input.max_zoom ?? null,
    };
  }

  private applyNumberFilter(query: Knex.QueryBuilder, column: string, filter: NumberFilter): void {
    if (filter.eq !== undefined) query.where(column, '=', filter.eq);
    if (filter.gt !== undefined) query.where(column, '>', filter.gt);
    if (filter.gte !== undefined) query.where(column, '>=', filter.gte);
    if (filter.lt !== undefined) query.where(column, '<', filter.lt);
    if (filter.lte !== undefined) query.where(column, '<=', filter.lte);
  }
}
