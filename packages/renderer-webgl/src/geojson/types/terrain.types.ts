/** Terrain vectorized polygon and isoline GeoJSON feature types. */

import type {
  Feature,
  FeatureCollection,
  LineStringGeometry,
  PolygonGeometry,
} from './geojson-primitives';

/** Properties on a land or inland-water polygon feature. */
export interface LandPolygonProperties {
  type: 'land' | 'inland_water';
}

/** Properties on a terrain elevation band feature. */
export interface TerrainBandProperties {
  type: 'terrain_band';
  elevationMin: number;
  elevationMax: number;
}

/** Properties on a contour/coastline isoline feature. */
export interface ContourLineProperties {
  elevation: number;
}

/** A GeoJSON Feature wrapping a land, inland-water, or terrain-band polygon. */
export type LandFeature = Feature<
  PolygonGeometry,
  LandPolygonProperties | TerrainBandProperties
>;
/** A GeoJSON Feature wrapping a contour/coastline isoline. */
export type ContourLineFeature = Feature<
  LineStringGeometry,
  ContourLineProperties
>;
/** A GeoJSON FeatureCollection of vectorized land / inland-water polygons. */
export type LandPolygonFeatureCollection = FeatureCollection<LandFeature>;
/** A GeoJSON FeatureCollection of contour/coastline isolines. */
export type ContourLineCollection = FeatureCollection<ContourLineFeature>;
