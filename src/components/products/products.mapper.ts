import { Product, ProductRow } from './products.types';

/**
 * Converts a DB row into the wire shape declared in openapi.yaml. Optional columns are
 * NULL in Postgres when unset; here they're omitted from the JSON entirely rather than
 * sent as `null`, matching the spec's optional (not nullable) properties.
 */
export function toApiProduct(row: ProductRow): Product {
  const product: Product = {
    id: row.id,
    name: row.name,
    type: row.type,
    consumption_protocol: row.consumption_protocol,
  };

  if (row.description !== null) product.description = row.description;
  if (row.bounding_polygon !== null) product.bounding_polygon = row.bounding_polygon;
  if (row.consumption_link !== null) product.consumption_link = row.consumption_link;
  if (row.resolution_best !== null) product.resolution_best = row.resolution_best;
  if (row.min_zoom !== null) product.min_zoom = row.min_zoom;
  if (row.max_zoom !== null) product.max_zoom = row.max_zoom;

  return product;
}
