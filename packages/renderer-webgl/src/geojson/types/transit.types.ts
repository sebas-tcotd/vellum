/** Transit-feature GeoJSON types: lines, connectors, and stations. */

import type {
  Feature,
  FeatureCollection,
  LineStringGeometry,
  PointGeometry,
  PolygonGeometry,
} from './geojson-primitives';

/** Properties attached to each transit line GeoJSON feature. */
export interface TransitFeatureProperties {
  /** The line's unique CS1 identifier. */
  id: string;
  /** Hexadecimal color string defined in-game (e.g., '#FF6600'). */
  color: string;
  /** Transportation mode (Bus, Tram, Train, etc.). */
  mode: string;
  /**
   * Signed slot index of this line within its corridor bundle — the paper's
   * `p − (|L(e)|−1)/2`. Position 0 is the leftmost line relative to the
   * feature's coordinate direction; the index is consumed by MapLibre
   * `line-offset` calibrated to `SLOT_M` world meters per unit
   * (see layers/layer-transit.ts). Inner-connection features carry 0 —
   * their displacement is baked into the geometry.
   */
  offsetIdx: number;
}

/** Properties attached to each station GeoJSON feature. */
export interface TransitStopFeatureProperties {
  /** Deterministic station identifier (first member stop's CS1 node ID). */
  id: string;
  /** Transportation mode of the first serving line. */
  mode: string;
  /** Hexadecimal color string of the first serving transit line. */
  color: string;
  /**
   * JSON-encoded array of all lines serving this stop.
   * Parsed in hover callbacks to display multi-line tooltips.
   * Note: stop names are not available in the .cslmap format.
   * Format: Array<{ name: string; color: string; mode: string }>
   */
  lines: string;
}

/** A GeoJSON Feature wrapping a transit line. */
export type TransitFeature = Feature<
  LineStringGeometry,
  TransitFeatureProperties
>;
/** A GeoJSON Feature wrapping a station polygon (rotated rectangle across its corridor). */
export type TransitStopFeature = Feature<
  PolygonGeometry,
  TransitStopFeatureProperties
>;
/** A GeoJSON Feature wrapping a station center point (min-size dot marker). */
export type StationDotFeature = Feature<
  PointGeometry,
  TransitStopFeatureProperties
>;
/** A GeoJSON FeatureCollection of transit line LineStrings. */
export type TransitFeatureCollection = FeatureCollection<TransitFeature>;
/** A GeoJSON FeatureCollection of inner-connection LineStrings at junction nodes. */
export type TransitConnectorsFeatureCollection =
  FeatureCollection<TransitFeature>;
/** A GeoJSON FeatureCollection of station polygons. */
export type TransitStopsFeatureCollection =
  FeatureCollection<TransitStopFeature>;
/** A GeoJSON FeatureCollection of station center points. */
export type StationDotsFeatureCollection = FeatureCollection<StationDotFeature>;

/** All GeoJSON products of the transit rendering pipeline. */
export interface TransitRenderData {
  /** Trimmed corridor centerlines, one feature per (line × corridor). */
  lines: TransitFeatureCollection;
  /** Precomputed inner connections (Bézier) at junction nodes. */
  connectors: TransitConnectorsFeatureCollection;
  /** Station capsule polygons (detail-zoom marker). */
  stations: TransitStopsFeatureCollection;
  /**
   * Station center points, carrying the same properties as the capsules. Drawn
   * as a min-pixel-size `circle` marker so stations stay discoverable and
   * clickable when zoomed out, where the world-locked capsule is sub-pixel.
   */
  stationDots: StationDotsFeatureCollection;
}
