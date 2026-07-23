/** Forest cell, district label, and water GeoJSON feature types. */

import type {
  Feature,
  FeatureCollection,
  PointGeometry,
  PolygonGeometry,
} from './geojson-primitives';

/** Properties attached to each forest cell GeoJSON feature. */
export interface ForestFeatureProperties {
  /** Normalized density of the forest cover (0.0 to 1.0). */
  density: number;
}

/** Properties attached to each district GeoJSON feature. */
export interface DistrictFeatureProperties {
  /** The district's unique CS1 identifier. */
  id: string;
  /** Name assigned to the district in-game. */
  name: string;
}

/** A GeoJSON Feature wrapping a forest cell point. */
export type ForestFeature = Feature<PointGeometry, ForestFeatureProperties>;
/** A GeoJSON Feature wrapping a district label point. */
export type DistrictFeature = Feature<PointGeometry, DistrictFeatureProperties>;
/** A GeoJSON Feature wrapping a water polygon. */
export type WaterFeature = Feature<PolygonGeometry, Record<string, never>>;
/** A GeoJSON FeatureCollection of forest cell points. */
export type ForestsFeatureCollection = FeatureCollection<ForestFeature>;
/** A GeoJSON FeatureCollection of district label points. */
export type DistrictsFeatureCollection = FeatureCollection<DistrictFeature>;
/** A GeoJSON FeatureCollection of water polygons. */
export type WaterFeatureCollection = FeatureCollection<WaterFeature>;
