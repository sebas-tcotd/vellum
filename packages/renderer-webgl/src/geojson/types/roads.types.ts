/** Road-feature GeoJSON types, over the canonical tier/width model. */

import type { RoadCategory, RoadTier, RoadWidthStyle } from '@vellum/core';
import type {
  Feature,
  FeatureCollection,
  LineStringGeometry,
} from './geojson-primitives';

// The tier vocabulary and its width model are canonical in `@vellum/core`
// (ADR-0001 D6). Re-exported here so the `geojson` barrel keeps its surface.
export type { RoadCategory, RoadTier, RoadWidthStyle };

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
  /**
   * Which network the segment belongs to, and therefore which layer draws it.
   * Drives `['get', 'category']` filters instead of item-class literals.
   */
  category: RoadCategory;
  /** Whether the segment's wayType includes Tunnel. */
  isTunnel: boolean;
  /** Whether the segment's wayType includes Bridge. */
  isBridge: boolean;
  /** Whether the segment's wayType includes Elevated (viaduct/overpass). */
  isElevated: boolean;
  /** Whether the segment's wayType includes Underground. */
  isUnderground: boolean;
  /**
   * Whether the ends of this line should be closed with a round cap. False
   * where an elevated run meets the surface network, so the darker casing does
   * not jut across the road it lands on. Drives `line-cap`.
   */
  capEnds: boolean;
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
