/* eslint-disable */
// This file was auto-generated. Do not edit manually.
// To update, run the error generation script again.

import type { TypedRequestHandlers as ImportedTypedRequestHandlers } from '@map-colonies/openapi-express-types';
export type paths = {
  '/product': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Search products
     * @description Query products using implicit AND logic for all provided filters.
     */
    get: operations['searchProducts'];
    put?: never;
    /** Create a new product */
    post: operations['createProduct'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/product/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    /** Get a product by ID */
    get: operations['getProductById'];
    /** Update an existing product */
    put: operations['updateProduct'];
    post?: never;
    /** Delete a product */
    delete: operations['deleteProduct'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
};
export type webhooks = Record<string, never>;
export type components = {
  schemas: {
    error: {
      message: string;
      errors?: Record<string, never>[];
    };
    /** @enum {string} */
    productType: 'raster' | 'rasterized vector' | '3d tiles' | 'QMesh';
    /** @enum {string} */
    consumptionProtocol: 'WMS' | 'WMTS' | 'XYZ' | '3D Tiles';
    geoJsonPolygon: {
      /** @enum {string} */
      type: 'Polygon';
      coordinates: number[][][];
    };
    productCreate: {
      name: string;
      description?: string;
      bounding_polygon?: components['schemas']['geoJsonPolygon'];
      consumption_link?: string;
      type: components['schemas']['productType'];
      consumption_protocol: components['schemas']['consumptionProtocol'];
      /** Format: double */
      resolution_best?: number;
      min_zoom?: number;
      max_zoom?: number;
    };
    product: components['schemas']['productCreate'] & {
      /** Format: uuid */
      id: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
  searchProducts: {
    parameters: {
      query?: {
        name?: string;
        type?: components['schemas']['productType'];
        consumption_protocol?: components['schemas']['consumptionProtocol'];
        resolution_best_eq?: number;
        resolution_best_gt?: number;
        resolution_best_gte?: number;
        resolution_best_lt?: number;
        resolution_best_lte?: number;
        min_zoom_eq?: number;
        min_zoom_gt?: number;
        min_zoom_gte?: number;
        min_zoom_lt?: number;
        min_zoom_lte?: number;
        max_zoom_eq?: number;
        max_zoom_gt?: number;
        max_zoom_gte?: number;
        max_zoom_lt?: number;
        max_zoom_lte?: number;
        /** @description Returns products whose bounding polygon intersects with the provided WKT geometry. */
        intersects?: string;
        /** @description Returns products whose bounding polygon completely contains the provided WKT geometry. */
        contains?: string;
        /** @description Returns products whose bounding polygon is completely within the provided WKT geometry. */
        within?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description A list of products matching the criteria */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['product'][];
        };
      };
      /** @description A query parameter failed validation */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['error'];
        };
      };
    };
  };
  createProduct: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['productCreate'];
      };
    };
    responses: {
      /** @description Product created successfully */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['product'];
        };
      };
      /** @description Request body failed validation */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['error'];
        };
      };
    };
  };
  getProductById: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Product details */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['product'];
        };
      };
      /** @description Product not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['error'];
        };
      };
    };
  };
  updateProduct: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['productCreate'];
      };
    };
    responses: {
      /** @description Product updated successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['product'];
        };
      };
      /** @description Request body failed validation */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['error'];
        };
      };
      /** @description Product not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['error'];
        };
      };
    };
  };
  deleteProduct: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Product deleted successfully */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Product not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['error'];
        };
      };
    };
  };
}
export type TypedRequestHandlers = ImportedTypedRequestHandlers<paths, operations>;
