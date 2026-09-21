/**
 * The baseline schematic strategy (Story 4.1): the geographic geometry
 * normalised into the fixed viewBox.
 *
 * @remarks
 * Moved out of `./index` unchanged in Story 4.3 so the metrics module can
 * measure against it without importing the package barrel. It invents no
 * geometry, so topology is preserved trivially — which is exactly why it is
 * the yardstick every other strategy is measured with, and the default the
 * shell falls back to.
 *
 * Story 4.3b routed it through the same rendering stage as the two grid
 * strategies. It still invents no *placement*: the corridors it hands over are
 * the game's own polylines. But the drawing rules — parallel slots, node trims,
 * inner connections, station capsules — now apply to all three geometries, so
 * the default view is not the one view that reads differently from the map.
 */

import type { CsPoint } from '../../coordinate-transform';
import type { TransitNetwork } from '../../types/transit-network';
import { projectOnPolyline, type Vec2 } from '../geometry-kit';
import { byString, type SchematicLayout } from './contract';
import {
  arcFractionOf,
  canonicalSchematicStops,
  corridorSlots,
  emptySchematicLayout,
  finalizeSchematicLayout,
  toPlane,
  type RawSchematicCorridor,
} from './grid-layout';

const isFinitePoint = (p: CsPoint): boolean =>
  Number.isFinite(p.x) && Number.isFinite(p.z);

/**
 * Baseline strategy: the geographic geometry normalised into the fixed
 * viewBox, preserving aspect ratio and the renderer's orientation
 * (`CS1_LAT_SIGN`: +1 means CS1 south appears at the top). Invents no
 * geometry, so topology is preserved trivially.
 */
export const geographicSchematicLayout = (
  network: TransitNetwork,
): SchematicLayout => {
  const edges = [...network.edges.values()]
    .filter((e) => e.path.length >= 2)
    .sort((a, b) => byString(a.id, b.id));

  const corridors: RawSchematicCorridor[] = [];
  const worldPathOf = new Map<string, readonly CsPoint[]>();
  // The same path in the kit's own vocabulary, built once per corridor. Stop
  // assignment probes every candidate corridor for every stop, so rebuilding these
  // arrays inside that loop made the conversion, not the projection, the cost.
  const probePathOf = new Map<string, Vec2[]>();
  for (const edge of edges) {
    // Non-finite coordinates would poison the bounds; a corridor needs 2 points.
    const worldPath = edge.path.filter(isFinitePoint);
    if (worldPath.length < 2) continue;
    const lineIds = new Set<string>();
    for (const bundleId of edge.bundleIds) {
      for (const lineId of network.bundles.get(bundleId)?.lineIds ?? []) {
        if (network.lines.has(lineId)) lineIds.add(lineId);
      }
    }
    if (lineIds.size === 0) continue;
    worldPathOf.set(edge.id, worldPath);
    probePathOf.set(
      edge.id,
      worldPath.map((p) => [p.x, p.z] as Vec2),
    );
    corridors.push({
      edgeId: edge.id,
      nodeA: edge.nodeA,
      nodeB: edge.nodeB,
      points: worldPath.map(toPlane),
      slots: corridorSlots(network.lineOrder.get(edge.id), [...lineIds]),
    });
  }
  if (corridors.length === 0) return emptySchematicLayout();

  // Only stops of lines that actually draw something: no orphan stations,
  // and they never stretch the bounds.
  const drawnLines = new Set(
    corridors.flatMap((c) => c.slots.map((slot) => slot.lineId)),
  );
  const stops = [...canonicalSchematicStops(network, drawnLines)]
    // Deduplicating by `stopId` keeps the first usable position, but
    // membership has to accumulate: a station shared by several lines must
    // survive as long as any one of them stays visible. Position and
    // membership are recorded independently on purpose — one entry of a
    // shared stop having a broken coordinate says nothing about which lines
    // call there, and dropping the whole entry would silently unlink that
    // line, so the station would vanish the moment the other one is hidden.
    .sort((a, b) => byString(a.id, b.id))
    .map((stop) => {
      // Same rule as the grid strategies: the corridor is chosen among the ones
      // the stop's *own* lines ride, so a symbol never lands on a stroke of a
      // service the data never recorded there.
      const stopLines = new Set(stop.lineIds);
      const own = corridors.filter((corridor) =>
        corridor.slots.some((slot) => stopLines.has(slot.lineId)),
      );
      const candidates = own.length > 0 ? own : corridors;
      let bestEdgeId = candidates[0].edgeId;
      let bestDistance = Infinity;
      const probe: Vec2 = [stop.position.x, stop.position.z];
      for (const corridor of candidates) {
        const hit = projectOnPolyline(
          probe,
          probePathOf.get(corridor.edgeId) ?? [],
        );
        if (hit !== null && hit.dist < bestDistance) {
          bestDistance = hit.dist;
          bestEdgeId = corridor.edgeId;
        }
      }
      return {
        id: stop.id,
        edgeId: bestEdgeId,
        fraction: arcFractionOf(
          [...(worldPathOf.get(bestEdgeId) ?? [])],
          stop.position,
        ),
        lineIds: [...stop.lineIds].sort(byString),
      };
    });

  return finalizeSchematicLayout(corridors, stops, {
    transitions: network.transitions,
    lines: network.lines,
  }).layout;
};
