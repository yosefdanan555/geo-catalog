import type { GeoJSONPolygon, ProductInput } from '@src/product/models/product';

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Test data builder: every test gets a valid, minimal product it can tweak via
 * `overrides`, instead of re-typing the full payload (and its magic strings) in
 * every test case. `name` gets a random suffix so tests that don't override it
 * never collide on the unique-looking values they assert against.
 */
function buildProductInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: `Test Product ${randomSuffix()}`,
    type: 'raster',
    consumption_protocol: 'WMS',
    ...overrides,
  };
}

function polygon(coordinates: number[][][]): GeoJSONPolygon {
  return { type: 'Polygon', coordinates };
}

/** A small box over Tel Aviv. */
const telAvivPolygon = (): GeoJSONPolygon =>
  polygon([
    [
      [34.7, 32.0],
      [34.8, 32.0],
      [34.8, 32.1],
      [34.7, 32.1],
      [34.7, 32.0],
    ],
  ]);

/** A small box over New York, far from Tel Aviv. */
const newYorkPolygon = (): GeoJSONPolygon =>
  polygon([
    [
      [-74.0, 40.7],
      [-73.9, 40.7],
      [-73.9, 40.8],
      [-74.0, 40.8],
      [-74.0, 40.7],
    ],
  ]);

/** A generous box covering all of Israel, used to test "within"/"contains". */
const israelPolygon = (): GeoJSONPolygon =>
  polygon([
    [
      [34.0, 29.0],
      [36.0, 29.0],
      [36.0, 34.0],
      [34.0, 34.0],
      [34.0, 29.0],
    ],
  ]);

export { buildProductInput, telAvivPolygon, newYorkPolygon, israelPolygon };
