/** Forest cell, district label, and water GeoJSON feature types. */

import type { ParkType } from '@vellum/core';
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

/** Properties attached to each park area GeoJSON feature. */
export interface ParkAreaFeatureProperties {
  /** The park area's unique CS1 identifier. */
  id: string;
  /** Name assigned to the park area in-game. */
  name: string;
  /** The type of park area (University, Industry, Forestry, etc.). */
  parkType: ParkType;
}

/** A GeoJSON Feature wrapping a forest cell point. */
export type ForestFeature = Feature<PointGeometry, ForestFeatureProperties>;
/** A GeoJSON Feature wrapping a district label point. */
export type DistrictFeature = Feature<PointGeometry, DistrictFeatureProperties>;
/** A GeoJSON Feature wrapping a park area point. */
export type ParkAreaFeature = Feature<PointGeometry, ParkAreaFeatureProperties>;
/** A GeoJSON Feature wrapping a water polygon. */
export type WaterFeature = Feature<PolygonGeometry, Record<string, never>>;
/** A GeoJSON FeatureCollection of forest cell points. */
export type ForestsFeatureCollection = FeatureCollection<ForestFeature>;
/** A GeoJSON FeatureCollection of district label points. */
export type DistrictsFeatureCollection = FeatureCollection<DistrictFeature>;
/** A GeoJSON FeatureCollection of park area points. */
export type ParkAreasFeatureCollection = FeatureCollection<ParkAreaFeature>;
/** A GeoJSON FeatureCollection of water polygons. */
export type WaterFeatureCollection = FeatureCollection<WaterFeature>;
