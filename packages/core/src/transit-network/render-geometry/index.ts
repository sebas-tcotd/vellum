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

import { buildConnectors } from './builders/connector-builder';
import { buildCorridors } from './builders/corridor-builder';
import { buildStations } from './builders/station-builder';
import type { CsPoint } from '../../coordinate-transform';
import type {
  CorridorGeometry,
  RenderGeometryNetwork,
  StationGeometry,
  TransitRenderGeometry,
} from './types';

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
export type {
  ConnectorGeometry,
  CorridorGeometry,
  RenderGeometryNetwork,
  StationGeometry,
  StationLineInfo,
  TransitLineSlot,
  TransitRenderGeometry,
} from './types';

/**
 * Builds all world-space render geometry for the transit layer group from the
 * derived transit network.
 *
 * @param network - The derived network fields needed for corridors, ordering,
 *   line metadata, stops and transfer candidates.
 * @returns Corridors, inner connections, and station polygons.
 */
export function buildRenderGeometry(
  network: RenderGeometryNetwork,
): TransitRenderGeometry {
  // 1. Corridors: trim back from junction nodes.
  const corridors = buildCorridors(network);

  // 2. Inner connections (paper §5 step 3): one cubic Bézier per route
  // transition, driven by the route-derived transitions, so lines that touch
  // 3+ corridors at a node (loops, roundabouts, revisited hubs) still connect
  // correctly.
  const connectors = buildConnectors(network, corridors);

  // 3. Stations: the network's transfer candidates projected onto their corridor.
  const stations = buildStations(
    network,
    corridors,
    network.transferCandidates,
  );

  return freezeRenderGeometry({
    corridors: Array.from(corridors.values()),
    connectors,
    stations,
  });
}

/**
 * Clones and freezes the complete geometry boundary without changing the
 * mutability policy of any pre-existing network collection.
 */
function freezeRenderGeometry(
  geometry: TransitRenderGeometry,
): TransitRenderGeometry {
  const corridors = Object.freeze(
    geometry.corridors.map((corridor) => freezeCorridor(corridor)),
  );
  const connectors = Object.freeze(
    geometry.connectors.map((connector) =>
      Object.freeze({
        lineId: connector.lineId,
        path: freezePoints(connector.path),
      }),
    ),
  );
  const stations = Object.freeze(
    geometry.stations.map((station) => freezeStation(station)),
  );

  return Object.freeze({ corridors, connectors, stations });
}

function freezeCorridor(corridor: CorridorGeometry): CorridorGeometry {
  return Object.freeze({
    edgeId: corridor.edgeId,
    path: freezePoints(corridor.path),
    slots: Object.freeze(
      corridor.slots.map((slot) =>
        Object.freeze({
          lineId: slot.lineId,
          offsetIndex: slot.offsetIndex,
        }),
      ),
    ),
  });
}

function freezeStation(station: StationGeometry): StationGeometry {
  return Object.freeze({
    id: station.id,
    polygon: freezePoints(station.polygon),
    lines: Object.freeze(
      station.lines.map((line) =>
        Object.freeze({ name: line.name, color: line.color, mode: line.mode }),
      ),
    ),
    confirmedTransfer: station.confirmedTransfer,
  });
}

function freezePoints(
  points: readonly Readonly<CsPoint>[],
): readonly Readonly<CsPoint>[] {
  return Object.freeze(points.map((point) => Object.freeze({ ...point })));
}
