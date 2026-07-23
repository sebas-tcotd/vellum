/**
 * Transit render geometry — stage 3 of the LOOM methodology (paper §5).
 *
 * @remarks
 * Implements the paper's four rendering steps adapted to a MapLibre pipeline:
 *
 * 1. *Offset lines* — the per-line perpendicular offset
 *    `−w·|L(e)|/2 + w·(p−1)` is applied at render time by MapLibre
 *    `line-offset` (GPU), so {@link buildCorridors} only emits the shared
 *    corridor centerline; the offset index is a feature property.
 * 2. *Free node area* — instead of the paper's iterative node-front expansion,
 *    {@link buildCorridors} trims each corridor back from its junction nodes
 *    by a static distance derived from the widest incident bundle. The cut
 *    line is the node front.
 * 3. *Inner connections* — {@link buildConnectors} computes cubic Bézier
 *    curves between the ports of continuing lines, precomputed in world
 *    space. Their endpoints match the GPU-offset line ends because
 *    `line-offset` is calibrated to exactly `SLOT_M` meters per index unit
 *    (see layer-transit.ts).
 * 4. *Stations* — the paper draws station polygons on line-graph nodes;
 *    CSLMap stops sit mid-corridor instead, so {@link buildStations} makes
 *    each station a rounded capsule oriented perpendicular to the corridor
 *    (long axis across the lines, paper §5.4 / Fig. 10), centered on the
 *    stop's projection and spanning only the lines that actually stop there.
 *
 * All geometry is produced in CS1 world space `{x, z}`; the GeoJSON builder
 * converts to WGS-84 on emission. The world frame maps 1:1 onto the rendered
 * map frame (lng = x, lat = +z), so "right of travel direction" here matches
 * MapLibre's positive `line-offset` direction.
 */

import type { CityData } from '@vellum/core';
import type { TransitLineGraph } from '../line-graph';
import type { LineOrderConfig } from '../ordering';
import { buildConnectors } from './builders/connector-builder';
import { buildCorridors } from './builders/corridor-builder';
import { buildStations } from './builders/station-builder';
import type { TransitRenderGeometry } from './types';

export {
  BEZIER_ARM_FACTOR,
  BEZIER_SAMPLES,
  LINE_SPACING_M,
  LINE_WIDTH_M,
  MAX_TRIM_FRACTION,
  NODE_PAD_M,
  SLOT_M,
  STATION_ACROSS_MARGIN_M,
  STATION_CORNER_STEPS,
  STATION_HALF_THICKNESS_M,
  STATION_MERGE_THRESHOLD_M,
} from './config';
export {
  Bucket,
  ConnectorGeometry,
  CorridorGeometry,
  StationGeometry,
  StationLineInfo,
  StopEntry,
  TransitRenderGeometry,
} from './types';

/**
 * Builds all world-space render geometry for the transit layer group from the
 * optimized line graph.
 *
 * @param graph - The transit line graph.
 * @param lineOrder - Per-edge line order from `computeLineOrder`.
 * @param cityData - Domain model (for stop positions and line names).
 * @returns Corridors, inner connections, and station polygons.
 */
export function buildRenderGeometry(
  graph: TransitLineGraph,
  lineOrder: LineOrderConfig,
  cityData: CityData,
): TransitRenderGeometry {
  // 1. Corridors: trim back from junction nodes.
  const corridors = buildCorridors(graph, lineOrder);

  // 2. Inner connections (paper §5 step 3): one cubic Bézier per route
  // transition, driven by the route-derived transitions, so lines that touch
  // 3+ corridors at a node (loops, roundabouts, revisited hubs) still connect
  // correctly.
  const connectors = buildConnectors(graph, corridors);

  // 3. Stations: proximity-grouped stops projected onto their corridor.
  const stations = buildStations(cityData, corridors);

  return {
    corridors: Array.from(corridors.values()),
    connectors,
    stations,
  };
}
