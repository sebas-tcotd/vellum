/**
 * Schematic layout contract (Epic 4, Story 4.1).
 *
 * @remarks
 * A schematic layout strategy is a pure function `TransitNetwork →
 * SchematicLayout`. It never touches MapLibre, React or Tauri, and the same
 * network always produces a deep-equal, frozen layout. Future strategies
 * (octilinear, orthoradial — Story 4.3) plug in as another
 * {@link SchematicLayoutStrategy} without touching the shell or the
 * geographic renderer.
 */

import { CS1_LAT_SIGN } from '../../coordinate-transform';
import type { TransitNetwork } from '../../types/transit-network';

/** A point in schematic (SVG user) space: x grows right, y grows down. */
export interface SchematicPoint {
  readonly x: number;
  readonly y: number;
}

/** One drawn stroke: the geometry of one corridor as ridden by one line. */
export interface SchematicSegment {
  readonly lineId: string;
  readonly color: string;
  readonly points: readonly SchematicPoint[];
}

/** One station symbol. */
export interface SchematicStation {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/** Output of a schematic strategy, in a fixed viewBox `0 0 width height`. */
export interface SchematicLayout {
  readonly bounds: { readonly width: number; readonly height: number };
  readonly segments: readonly SchematicSegment[];
  readonly stations: readonly SchematicStation[];
}

/** A pure, deterministic layout strategy. */
export type SchematicLayoutStrategy = (
  network: TransitNetwork,
) => SchematicLayout;

/** Fixed viewBox side of every schematic layout. */
export const SCHEMATIC_VIEWBOX_SIZE = 1000;
/** Margin kept free around the drawn network, in viewBox units. */
export const SCHEMATIC_MARGIN = 40;

/** Whether a layout has nothing to draw (no segments). */
export function isSchematicLayoutEmpty(layout: SchematicLayout): boolean {
  return layout.segments.length === 0;
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function emptyLayout(): SchematicLayout {
  return Object.freeze({
    bounds: Object.freeze({
      width: SCHEMATIC_VIEWBOX_SIZE,
      height: SCHEMATIC_VIEWBOX_SIZE,
    }),
    segments: Object.freeze([]),
    stations: Object.freeze([]),
  });
}

/**
 * Baseline strategy: the geographic geometry normalised into the fixed
 * viewBox, preserving aspect ratio and the renderer's orientation
 * (`CS1_LAT_SIGN`: +1 means CS1 south appears at the top). Invents no
 * geometry, so topology is preserved trivially.
 */
const isFinitePoint = (p: { x: number; z: number }): boolean =>
  Number.isFinite(p.x) && Number.isFinite(p.z);

export const geographicSchematicLayout: SchematicLayoutStrategy = (network) => {
  const edges = [...network.edges.values()]
    .filter((e) => e.path.length >= 2)
    .sort((a, b) => byString(a.id, b.id));

  const raw: {
    lineId: string;
    color: string;
    path: { x: number; z: number }[];
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
  raw.length = 0;
  raw.push(...drawable);
  if (raw.length === 0) return emptyLayout();

  // Only stops of lines that actually draw something: no orphan stations,
  // and they never stretch the bounds.
  const drawnLines = new Set(raw.map((r) => r.lineId));
  const stopsById = new Map<string, { x: number; z: number }>();
  for (const s of network.stops) {
    if (!drawnLines.has(s.lineId) || !isFinitePoint(s.position)) continue;
    if (!stopsById.has(s.stopId)) stopsById.set(s.stopId, s.position);
  }

  // Screen-space vertical coordinate before scaling: y grows downward, so a
  // south-up map (+1) puts large z at the top.
  const vy = (z: number): number => -CS1_LAT_SIGN * z;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const extend = (p: { x: number; z: number }): void => {
    const y = vy(p.z);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const r of raw) r.path.forEach(extend);
  for (const p of stopsById.values()) extend(p);

  const inner = SCHEMATIC_VIEWBOX_SIZE - 2 * SCHEMATIC_MARGIN;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const span = Math.max(spanX, spanY);
  const scale = span > 0 ? inner / span : 1;
  // Centre the network inside the square viewBox.
  const offX = SCHEMATIC_MARGIN + (inner - spanX * scale) / 2;
  const offY = SCHEMATIC_MARGIN + (inner - spanY * scale) / 2;
  const project = (p: { x: number; z: number }): SchematicPoint =>
    Object.freeze({
      x: offX + (p.x - minX) * scale,
      y: offY + (vy(p.z) - minY) * scale,
    });

  const segments = raw.map((r) =>
    Object.freeze({
      lineId: r.lineId,
      color: r.color,
      points: Object.freeze(r.path.map(project)),
    }),
  );
  const stations = [...stopsById.entries()]
    .sort(([a], [b]) => byString(a, b))
    .map(([id, p]) => Object.freeze({ id, ...project(p) }));

  return Object.freeze({
    bounds: Object.freeze({
      width: SCHEMATIC_VIEWBOX_SIZE,
      height: SCHEMATIC_VIEWBOX_SIZE,
    }),
    segments: Object.freeze(segments),
    stations: Object.freeze(stations),
  });
};
