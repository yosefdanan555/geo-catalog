import type { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { SERVICES } from '@common/constants';
import { BadRequestError, NotFoundError } from '@common/errors';

import { ProductRepository } from '../repositories/productRepository';
import { Product, ProductInput, ProductSearchFilters } from './product';

/**
 * Domain layer: business rules and orchestration, sitting between the HTTP-facing
 * controller and the data-access layer. The repository only ever runs the queries
 * it's asked to run — deciding *whether* a request is valid (does this id exist?
 * does this string look like a real WKT geometry?) belongs here, not there.
 */

const WKT_GEOMETRY_PATTERN = /^\s*(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*\(/i;

function assertLooksLikeWkt(value: string, paramName: string): void {
  if (!WKT_GEOMETRY_PATTERN.test(value)) {
    throw new BadRequestError(`Query parameter "${paramName}" must be a WKT geometry, got: "${value}"`);
  }
}

@injectable()
export class ProductManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(ProductRepository) private readonly repository: ProductRepository
  ) {}

  public async create(input: ProductInput): Promise<Product> {
    this.logger.info({ msg: 'creating product', name: input.name });
    return this.repository.create(input);
  }

  public async getById(id: string): Promise<Product> {
    const product = await this.repository.findById(id);
    if (!product) throw new NotFoundError(`Product ${id} was not found`);
    return product;
  }

  public async update(id: string, input: ProductInput): Promise<Product> {
    this.logger.info({ msg: 'updating product', productId: id });
    const product = await this.repository.update(id, input);
    if (!product) throw new NotFoundError(`Product ${id} was not found`);
    return product;
  }

  public async remove(id: string): Promise<void> {
    this.logger.info({ msg: 'removing product', productId: id });
    const deleted = await this.repository.remove(id);
    if (!deleted) throw new NotFoundError(`Product ${id} was not found`);
  }

  public async search(filters: ProductSearchFilters): Promise<Product[]> {
    if (filters.intersects !== undefined) assertLooksLikeWkt(filters.intersects, 'intersects');
    if (filters.contains !== undefined) assertLooksLikeWkt(filters.contains, 'contains');
    if (filters.within !== undefined) assertLooksLikeWkt(filters.within, 'within');
    return this.repository.search(filters);
  }
}
