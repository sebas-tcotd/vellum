/**
 * Type definitions for the transit render geometry — the shared vocabulary
 * between {@link buildRenderGeometry} and its `builders/` pipeline stages.
 * See that function's module doc for the rendering steps this geometry feeds.
 */

import type { TransitMode } from '@vellum/core';
import type { CsPoint } from '../../coordinate-transform';

/** A trimmed corridor centerline ready for offset rendering. */
export interface CorridorGeometry {
  /** Line-graph edge id. */
  edgeId: string;
  /** Trimmed centerline, oriented nodeA → nodeB. */
  path: CsPoint[];
  /** Line ids in left-to-right order along the path direction. */
  lineIds: string[];
}

/** One inner connection (paper §5 step 3) for a single line at a node. */
export interface ConnectorGeometry {
  /** The line this connector belongs to. */
  lineId: string;
  /** Sampled Bézier path in world space. */
  path: CsPoint[];
}

/** Line metadata attached to a station for hover tooltips. */
export interface StationLineInfo {
  /** Line display name. */
  name: string;
  /** Line color. */
  color: string;
  /** Transit mode. */
  mode: TransitMode;
}

/**
 * A station marker (paper §5 step 4, buffered/rounded variant): a rounded
 * rectangle (capsule) spanning only the corridor slots of the lines that
 * actually stop here — never the whole bundle.
 */
export interface StationGeometry {
  /** Deterministic station id (`stopId:corridorId`). */
  id: string;
  /** Closed rounded-rectangle ring in world space. */
  polygon: CsPoint[];
  /** Lines that stop here (exactly those the marker spans). */
  lines: StationLineInfo[];
}

/** Complete render geometry for the transit layer group. */
export interface TransitRenderGeometry {
  /** Trimmed corridors. */
  corridors: CorridorGeometry[];
  /** Inner connections at junction nodes. */
  connectors: ConnectorGeometry[];
  /** Station polygons. */
  stations: StationGeometry[];
}

/** Internal: one deduplicated stop, before proximity grouping. */
export interface StopEntry {
  /** CS1 stop id. */
  stopId: string;
  /** World-space stop position. */
  position: CsPoint;
  /** Line this entry was recorded for. */
  lineId: string;
}

/** Internal: the lines of a proximity-grouped stop assigned to one corridor. */
export interface Bucket {
  /** The corridor these lines were matched to. */
  corridor: CorridorGeometry;
  /** Closest point on the corridor to the stop-group centroid. */
  point: CsPoint;
  /** Corridor travel direction at `point`. */
  dir: CsPoint;
  /** Lines stopping here, assigned to this corridor. */
  lineIds: string[];
}
