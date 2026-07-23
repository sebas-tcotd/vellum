/** Road-feature GeoJSON types and the road tier/width model. */

import type {
  Feature,
  FeatureCollection,
  LineStringGeometry,
} from './geojson-primitives';

export type RoadTier =
  | 'highway'
  | 'train'
  | 'metro'
  | 'largeArterial'
  | 'mediumArterial'
  | 'local'
  | 'gravel'
  | 'pedestrian'
  | 'pedestrianWay';

/** Width model for a road tier: `totalWidth = fixed + scaled * zoomFactor`. */
export interface RoadWidthStyle {
  /** Fixed component of the line width model. */
  fixed: number;
  /** Scaled component of the line width model. */
  scaled: number;
}

/**
 * Properties attached to each road segment GeoJSON feature.
 * Used by MapLibre Data-Driven Styling expressions (e.g., `['get', 'tier']`).
 */
export interface RoadFeatureProperties {
  /** The segment's unique CS1 identifier. */
  id: string;
  /** The item class from CS1 (e.g. "Large Road", "Highway"). */
  itemClass: string;
  /** Classified road tier used for color and width expressions. */
  tier: RoadTier;
  /** Whether the segment's wayType includes Tunnel. */
  isTunnel: boolean;
  /** Whether the segment's wayType includes Bridge. */
  isBridge: boolean;
  /** Physical base width in CS1 world units. Used for `line-width` expressions. */
  width: number;
  /** Comma-separated WayType flags (e.g. "Road,Bridge"). */
  wayType: string;
  /** Fixed component of the line width model: totalWidth = fixed + scaled * zoomFactor. */
  fixedWidth: number;
  /** Scaled component of the line width model: totalWidth = fixed + scaled * zoomFactor. */
  scaledWidth: number;
}

/** A GeoJSON Feature wrapping a road segment. */
export type RoadFeature = Feature<LineStringGeometry, RoadFeatureProperties>;
/** A GeoJSON FeatureCollection of road segment LineStrings. */
export type RoadsFeatureCollection = FeatureCollection<RoadFeature>;
