export type ProductType = 'raster' | 'rasterized vector' | '3d tiles' | 'QMesh';
export type ConsumptionProtocol = 'WMS' | 'WMTS' | 'XYZ' | '3D Tiles';

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Body accepted by POST /product and PUT /product/{id}. */
export interface ProductInput {
  name: string;
  description?: string;
  bounding_polygon?: GeoJSONPolygon;
  consumption_link?: string;
  type: ProductType;
  consumption_protocol: ConsumptionProtocol;
  resolution_best?: number;
  min_zoom?: number;
  max_zoom?: number;
}

/** Shape returned to API clients, matching the `product` schema in openapi3.yaml. */
export interface Product extends ProductInput {
  id: string;
}

/** A number column can be filtered by any combination of these operators (all ANDed). */
export interface NumberFilter {
  eq?: number | undefined;
  gt?: number | undefined;
  gte?: number | undefined;
  lt?: number | undefined;
  lte?: number | undefined;
}

/** Query params accepted by GET /product. Every present filter narrows the result (AND, no OR/NOT). */
export interface ProductSearchFilters {
  name?: string;
  type?: ProductType;
  consumption_protocol?: ConsumptionProtocol;

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

  /** WKT geometry: return products whose bounding polygon intersects it. */
  intersects?: string;
  /** WKT geometry: return products whose bounding polygon fully contains it. */
  contains?: string;
  /** WKT geometry: return products whose bounding polygon is fully within it. */
  within?: string;
}

/** Raw row shape coming back from the `products` table (bounding_polygon pre-converted to GeoJSON by the repository's select). */
export interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  bounding_polygon: GeoJSONPolygon | null;
  consumption_link: string | null;
  type: ProductType;
  consumption_protocol: ConsumptionProtocol;
  resolution_best: number | null;
  min_zoom: number | null;
  max_zoom: number | null;
}
