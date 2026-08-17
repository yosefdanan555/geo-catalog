import { NextFunction, Request, Response } from 'express';
import { ProductsService } from './products.service';
import { ProductInput, ProductSearchFilters } from './products.types';

/**
 * Entry-points layer: translates HTTP <-> domain calls. No business rules live
 * here (e.g. "does this id exist?") — that's ProductsService's job.
 */
export class ProductsController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Body shape (required fields, enums, maxLength) is already enforced by the
      // OpenAPI request validator middleware before this handler ever runs.
      console.log(req.body);
      const product = await ProductsService.create(req.body as ProductInput);
      res.status(201).json(product);
    } catch (error) {
      next(error);
    }
  }

  static async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Numeric query params are coerced to numbers by the OpenAPI validator.
      const products = await ProductsService.search(req.query as unknown as ProductSearchFilters);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await ProductsService.getById(req.params.id as string);
      res.status(200).json(product);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const product = await ProductsService.update(req.params.id as string, req.body as ProductInput);
      res.status(200).json(product);
    } catch (error) {
      next(error);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await ProductsService.remove(req.params.id as string);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
