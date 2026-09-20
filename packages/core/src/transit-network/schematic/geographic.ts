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
 */

import type { CsPoint } from '../../coordinate-transform';
import type { TransitNetwork } from '../../types/transit-network';
import { byString, type SchematicLayout } from './contract';
import {
  emptySchematicLayout,
  finalizeSchematicLayout,
  toPlane,
  type RawSchematicSegment,
  type RawSchematicStation,
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

  const raw: {
    lineId: string;
    color: string;
    path: CsPoint[];
  }[] = [];
  for (const edge of edges) {
    const lineIds = new Set<string>();
    for (const bundleId of edge.bundleIds) {
      for (const lineId of network.bundles.get(bundleId)?.lineIds ?? []) {
        lineIds.add(lineId);
      }
    }
    for (const lineId of [...lineIds].sort(byString)) {
      const line = network.lines.get(lineId);
      if (!line) continue;
      raw.push({
        lineId,
        color: line.color,
        path: edge.path.filter(isFinitePoint),
      });
    }
  }
  // Non-finite coordinates would poison the bounds; a stroke needs 2 points.
  const drawable = raw.filter((r) => r.path.length >= 2);
  if (drawable.length === 0) return emptySchematicLayout();

  // Only stops of lines that actually draw something: no orphan stations,
  // and they never stretch the bounds.
  const drawnLines = new Set(drawable.map((r) => r.lineId));
  const stopsById = new Map<
    string,
    { position: CsPoint | null; lineIds: Set<string> }
  >();
  for (const s of network.stops) {
    if (!drawnLines.has(s.lineId)) continue;
    // Deduplicating by `stopId` keeps the first usable position, but
    // membership has to accumulate: a station shared by several lines must
    // survive as long as any one of them stays visible. Position and
    // membership are recorded independently on purpose — one entry of a
    // shared stop having a broken coordinate says nothing about which lines
    // call there, and dropping the whole entry would silently unlink that
    // line, so the station would vanish the moment the other one is hidden.
    const existing = stopsById.get(s.stopId);
    if (existing) {
      existing.lineIds.add(s.lineId);
      if (existing.position === null && isFinitePoint(s.position)) {
        existing.position = s.position;
      }
      continue;
    }
    stopsById.set(s.stopId, {
      position: isFinitePoint(s.position) ? s.position : null,
      lineIds: new Set([s.lineId]),
    });
  }
  // A stop no entry could place has no symbol to draw.
  const stations: RawSchematicStation[] = [...stopsById.entries()]
    .flatMap(([id, entry]) =>
      entry.position === null
        ? []
        : [{ id, position: entry.position, lineIds: entry.lineIds }],
    )
    .sort((a, b) => byString(a.id, b.id))
    .map((stop) => ({
      id: stop.id,
      point: toPlane(stop.position),
      lineIds: [...stop.lineIds].sort(byString),
    }));

  const segments: RawSchematicSegment[] = drawable.map((r) => ({
    lineId: r.lineId,
    color: r.color,
    points: r.path.map(toPlane),
  }));

  return finalizeSchematicLayout(segments, stations).layout;
};
