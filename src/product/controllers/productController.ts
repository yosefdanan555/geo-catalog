import type { Logger } from '@map-colonies/js-logger';
import httpStatus from 'http-status-codes';
import { injectable, inject } from 'tsyringe';
import { type Registry, Counter, Histogram } from 'prom-client';
import type { TypedRequestHandlers } from '@openapi';
import { SERVICES } from '@common/constants';
import { ProductManager } from '../models/productManager';
import type { ProductSearchFilters } from '../models/product';

type ProductOperation = 'create' | 'search' | 'getById' | 'update' | 'delete';

const OPERATION_LABELS = ['operation', 'outcome'] as const;

// eslint-disable-next-line @typescript-eslint/no-magic-numbers
const DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

@injectable()
export class ProductController {
  private readonly createdProductCounter: Counter;
  private readonly operationCounter: Counter<(typeof OPERATION_LABELS)[number]>;
  private readonly operationDuration: Histogram<(typeof OPERATION_LABELS)[number]>;

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

    this.operationCounter = new Counter({
      name: 'product_operations_total',
      help: 'Product actions handled, labelled by action and by whether it succeeded',
      labelNames: OPERATION_LABELS,
      registers: [this.metricsRegistry],
    });

    this.operationDuration = new Histogram({
      name: 'product_operation_duration_seconds',
      help: 'Time a product action spent in the domain layer, in seconds',
      labelNames: OPERATION_LABELS,
      buckets: DURATION_BUCKETS_SECONDS,
      registers: [this.metricsRegistry],
    });
  }

  public createProduct: TypedRequestHandlers['createProduct'] = async (req, res, next) => {
    try {
      const product = await this.track('create', async () => this.manager.create(req.body));
      this.createdProductCounter.inc(1);
      return res.status(httpStatus.CREATED).json(product);
    } catch (error) {
      return next(error);
    }
  };

  public searchProducts: TypedRequestHandlers['searchProducts'] = async (req, res, next) => {
    try {
      const products = await this.track('search', async () => this.manager.search(req.query as unknown as ProductSearchFilters));
      return res.status(httpStatus.OK).json(products);
    } catch (error) {
      return next(error);
    }
  };

  public getProductById: TypedRequestHandlers['getProductById'] = async (req, res, next) => {
    try {
      const product = await this.track('getById', async () => this.manager.getById(req.params.id));
      return res.status(httpStatus.OK).json(product);
    } catch (error) {
      return next(error);
    }
  };

  public updateProduct: TypedRequestHandlers['updateProduct'] = async (req, res, next) => {
    try {
      const product = await this.track('update', async () => this.manager.update(req.params.id, req.body));
      return res.status(httpStatus.OK).json(product);
    } catch (error) {
      return next(error);
    }
  };

  public deleteProduct: TypedRequestHandlers['deleteProduct'] = async (req, res, next) => {
    try {
      await this.track('delete', async () => this.manager.remove(req.params.id));
      return res.status(httpStatus.NO_CONTENT).send();
    } catch (error) {
      return next(error);
    }
  };

  private async track<T>(operation: ProductOperation, action: () => Promise<T>): Promise<T> {
    const stopTimer = this.operationDuration.startTimer({ operation });

    try {
      const result = await action();
      this.operationCounter.inc({ operation, outcome: 'success' });
      stopTimer({ outcome: 'success' });
      return result;
    } catch (error) {
      this.operationCounter.inc({ operation, outcome: 'failure' });
      stopTimer({ outcome: 'failure' });
      throw error;
    }
  }
}
