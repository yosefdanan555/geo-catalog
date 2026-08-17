import type { Logger } from '@map-colonies/js-logger';
import httpStatus from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { type Registry, Counter } from 'prom-client';
import type { TypedRequestHandlers } from '@openapi';
import { SERVICES } from '@common/constants';
import { ProductManager } from '../models/productManager';
import type { ProductSearchFilters } from '../models/product';

/**
 * Entry-points layer: translates HTTP <-> domain calls. No business rules live
 * here (e.g. "does this id exist?") — that's ProductManager's job.
 */
@injectable()
export class ProductController {
  private readonly createdProductCounter: Counter;

  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(ProductManager) private readonly manager: ProductManager,
    @inject(SERVICES.METRICS) private readonly metricsRegistry: Registry
  ) {
    this.createdProductCounter = new Counter({
      name: 'created_product',
      help: 'number of created products',
      registers: [this.metricsRegistry],
    });
  }

  public createProduct: TypedRequestHandlers['createProduct'] = async (req, res, next) => {
    try {
      // Body shape (required fields, enums, maxLength) is already enforced by the
      // OpenAPI request validator middleware before this handler ever runs.
      const product = await this.manager.create(req.body);
      this.createdProductCounter.inc(1);
      return res.status(httpStatus.CREATED).json(product);
    } catch (error) {
      return next(error);
    }
  };

  public searchProducts: TypedRequestHandlers['searchProducts'] = async (req, res, next) => {
    try {
      // Numeric query params are coerced to numbers by the OpenAPI validator.
      const products = await this.manager.search(req.query as unknown as ProductSearchFilters);
      return res.status(httpStatus.OK).json(products);
    } catch (error) {
      return next(error);
    }
  };

  public getProductById: TypedRequestHandlers['getProductById'] = async (req, res, next) => {
    try {
      const product = await this.manager.getById(req.params.id);
      return res.status(httpStatus.OK).json(product);
    } catch (error) {
      return next(error);
    }
  };

  public updateProduct: TypedRequestHandlers['updateProduct'] = async (req, res, next) => {
    try {
      const product = await this.manager.update(req.params.id, req.body);
      return res.status(httpStatus.OK).json(product);
    } catch (error) {
      return next(error);
    }
  };

  public deleteProduct: TypedRequestHandlers['deleteProduct'] = async (req, res, next) => {
    try {
      await this.manager.remove(req.params.id);
      return res.status(httpStatus.NO_CONTENT).send();
    } catch (error) {
      return next(error);
    }
  };
}
