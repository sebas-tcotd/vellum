/**
 * GeoJSON primitives (minimal subset — avoids importing @types/geojson).
 * Domain feature types are built from these generics in the sibling
 * `*.types.ts` files.
 */

/** A GeoJSON LineString geometry. */
export interface LineStringGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}
/** A GeoJSON Point geometry. */
export interface PointGeometry {
  type: 'Point';
  coordinates: [number, number];
}
/** A GeoJSON Polygon geometry. */
export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: [number, number][][];
}
/** A GeoJSON Feature with geometry `G` and properties `P`. */
export interface Feature<G, P> {
  type: 'Feature';
  geometry: G;
  properties: P;
}
/** A GeoJSON FeatureCollection of features `F`. */
export interface FeatureCollection<F> {
  type: 'FeatureCollection';
  features: F[];
}
