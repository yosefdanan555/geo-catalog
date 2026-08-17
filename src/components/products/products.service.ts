import { BadRequestError } from '../../libs/errors/bad-request.error';
import { NotFoundError } from '../../libs/errors/not-found.error';
import { ProductsDAL } from './products.dal';
import { Product, ProductInput, ProductSearchFilters } from './products.types';

/**
 * Domain layer: business rules and orchestration, sitting between the HTTP-facing
 * controller and the data-access layer. The DAL only ever runs the queries it's
 * asked to run — deciding *whether* a request is valid (does this id exist? does
 * this string look like a real WKT geometry?) belongs here, not there.
 */

const WKT_GEOMETRY_PATTERN =
  /^\s*(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*\(/i;

function assertLooksLikeWkt(value: string, paramName: string): void {
  if (!WKT_GEOMETRY_PATTERN.test(value)) {
    throw new BadRequestError(`Query parameter "${paramName}" must be a WKT geometry, got: "${value}"`);
  }
}

export class ProductsService {
  static create(input: ProductInput): Promise<Product> {
    return ProductsDAL.create(input);
  }

  static async getById(id: string): Promise<Product> {
    const product = await ProductsDAL.findById(id);
    if (!product) throw new NotFoundError(`Product ${id} was not found`);
    return product;
  }

  static async update(id: string, input: ProductInput): Promise<Product> {
    const product = await ProductsDAL.update(id, input);
    if (!product) throw new NotFoundError(`Product ${id} was not found`);
    return product;
  }

  static async remove(id: string): Promise<void> {
    const deleted = await ProductsDAL.remove(id);
    if (!deleted) throw new NotFoundError(`Product ${id} was not found`);
  }

  static search(filters: ProductSearchFilters): Promise<Product[]> {
    if (filters.intersects !== undefined) assertLooksLikeWkt(filters.intersects, 'intersects');
    if (filters.contains !== undefined) assertLooksLikeWkt(filters.contains, 'contains');
    if (filters.within !== undefined) assertLooksLikeWkt(filters.within, 'within');
    return ProductsDAL.search(filters);
  }
}
