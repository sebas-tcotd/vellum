/**
 * Transit render geometry — stage 3 of the LOOM methodology (paper §5).
 *
 * @remarks
 * Implements the paper's four rendering steps adapted to a MapLibre pipeline:
 *
 * 1. *Offset lines* — the per-line perpendicular offset
 *    `−w·|L(e)|/2 + w·(p−1)` is applied at render time by MapLibre
 *    `line-offset` (GPU), so this module only emits the shared corridor
 *    centerline; the offset index is a feature property.
 * 2. *Free node area* — instead of the paper's iterative node-front expansion,
 *    each corridor is trimmed back from its junction nodes by a static
 *    distance derived from the widest incident bundle. The cut line is the
 *    node front.
 * 3. *Inner connections* — cubic Bézier curves between the ports of
 *    continuing lines, precomputed in world space. Their endpoints match the
 *    GPU-offset line ends because `line-offset` is calibrated to exactly
 *    `SLOT_M` meters per index unit (see layer-transit.ts).
 * 4. *Stations* — the paper draws station polygons on line-graph nodes;
 *    CSLMap stops sit mid-corridor instead, so stations are rendered as
 *    rotated rectangles centered on the stop's projection onto its corridor,
 *    spanning the full bundle width (the paper's §5.4 rotated-rectangle
 *    variant, relocated to where CS1 stations actually live).
 *
 * All geometry is produced in CS1 world space `{x, z}`; the GeoJSON builder
 * converts to WGS-84 on emission. The world frame maps 1:1 onto the rendered
 * map frame (lng = x, lat = +z), so "right of travel direction" here matches
 * MapLibre's positive `line-offset` direction.
 */

import type { CityData, TransitMode } from '@vellum/core';
import type { CsPoint } from '../coordinate-transform';
import type { LineOrderConfig } from './ordering';
import type { TransitLineGraph } from './line-graph';

/** Rendered line width, in world meters (the paper's `w`). */
export const LINE_WIDTH_M = 3;
/** Gap between adjacent lines, in world meters. */
export const LINE_SPACING_M = 1.5;
/** Width of one line slot (line + gap) — the meters behind one offset-index unit. */
export const SLOT_M = LINE_WIDTH_M + LINE_SPACING_M;

const NODE_PAD_M = 2;
const BEZIER_ARM_FACTOR = 0.4;
const BEZIER_SAMPLES = 8;
const MAX_TRIM_FRACTION = 0.4;
/** Stops closer than this (world meters) are merged into one station (CSLMap convention). */
export const STATION_MERGE_THRESHOLD_M = 48;

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

/** A station polygon (paper §5 step 4, rotated-rectangle variant). */
export interface StationGeometry {
  /** Deterministic station id (first member stop id). */
  id: string;
  /** Closed polygon ring in world space. */
  polygon: CsPoint[];
  /** Lines serving this station. */
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

// ─── Vector helpers (world space) ─────────────────────────────────────────────

function sub(a: CsPoint, b: CsPoint): CsPoint {
  return { x: a.x - b.x, z: a.z - b.z };
}
function add(a: CsPoint, b: CsPoint): CsPoint {
  return { x: a.x + b.x, z: a.z + b.z };
}
function scale(a: CsPoint, s: number): CsPoint {
  return { x: a.x * s, z: a.z * s };
}
function norm(a: CsPoint): number {
  return Math.hypot(a.x, a.z);
}
function unit(a: CsPoint): CsPoint {
  const n = norm(a);
  return n > 0 ? { x: a.x / n, z: a.z / n } : { x: 1, z: 0 };
}
/** Right of travel direction `d` in the rendered frame (matches MapLibre `line-offset` > 0). */
function rightOf(d: CsPoint): CsPoint {
  const u = unit(d);
  return { x: u.z, z: -u.x };
}

function pathLength(path: CsPoint[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += norm(sub(path[i], path[i - 1]));
  return len;
}

/** Cuts `dist` world meters off the start of `path`. */
function cutStart(path: CsPoint[], dist: number): CsPoint[] {
  if (dist <= 0) return path;
  let remaining = dist;
  for (let i = 1; i < path.length; i++) {
    const seg = norm(sub(path[i], path[i - 1]));
    if (seg > remaining) {
      const t = remaining / seg;
      const p = add(path[i - 1], scale(sub(path[i], path[i - 1]), t));
      return [p, ...path.slice(i)];
    }
    remaining -= seg;
  }
  return [path[path.length - 1]];
}

/** Cuts `dist` world meters off the end of `path`. */
function cutEnd(path: CsPoint[], dist: number): CsPoint[] {
  return [...cutStart([...path].reverse(), dist)].reverse();
}

/** Travel direction (A→B) of the path at its start or end. */
function endDirection(path: CsPoint[], at: 'start' | 'end'): CsPoint {
  if (path.length < 2) return { x: 1, z: 0 };
  return at === 'start'
    ? unit(sub(path[1], path[0]))
    : unit(sub(path[path.length - 1], path[path.length - 2]));
}

function cubicBezier(
  p0: CsPoint,
  p1: CsPoint,
  p2: CsPoint,
  p3: CsPoint,
  samples: number,
): CsPoint[] {
  const out: CsPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    out.push({
      x:
        u * u * u * p0.x +
        3 * u * u * t * p1.x +
        3 * u * t * t * p2.x +
        t * t * t * p3.x,
      z:
        u * u * u * p0.z +
        3 * u * u * t * p1.z +
        3 * u * t * t * p2.z +
        t * t * t * p3.z,
    });
  }
  return out;
}

// ─── Trimming (node fronts, §5 step 2) ────────────────────────────────────────

/** Half of the widest incident bundle at the node, plus padding. */
function trimDistanceAt(
  graph: TransitLineGraph,
  lineOrder: LineOrderConfig,
  nodeId: string,
): number {
  const node = graph.nodes.get(nodeId);
  if (node === undefined || node.edgeIds.length < 2) return 0;
  let maxWidth = 0;
  for (const eid of node.edgeIds) {
    const count = lineOrder.get(eid)?.length ?? 0;
    maxWidth = Math.max(maxWidth, count * SLOT_M);
  }
  return NODE_PAD_M + maxWidth / 2;
}

/** Port of `lineId` at the given end of a trimmed corridor. */
function portAt(
  corridor: CorridorGeometry,
  lineId: string,
  at: 'start' | 'end',
): CsPoint {
  const n = corridor.lineIds.length;
  const p = corridor.lineIds.indexOf(lineId);
  const offsetIdx = p - (n - 1) / 2;
  const anchor =
    at === 'start' ? corridor.path[0] : corridor.path[corridor.path.length - 1];
  const dir = endDirection(corridor.path, at);
  return add(anchor, scale(rightOf(dir), offsetIdx * SLOT_M));
}

// ─── Main builder ─────────────────────────────────────────────────────────────

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
  // ── Corridors: trim back from junction nodes ───────────────────────────────
  const corridors = new Map<string, CorridorGeometry>();
  for (const eid of [...graph.edges.keys()].sort()) {
    const e = graph.edges.get(eid);
    if (e === undefined) continue;
    const lineIds = lineOrder.get(eid) ?? [];
    if (lineIds.length === 0) continue;

    const total = pathLength(e.path);
    let trimA =
      e.nodeA === e.nodeB ? 0 : trimDistanceAt(graph, lineOrder, e.nodeA);
    let trimB =
      e.nodeA === e.nodeB ? 0 : trimDistanceAt(graph, lineOrder, e.nodeB);
    const maxTrim = total * MAX_TRIM_FRACTION;
    trimA = Math.min(trimA, maxTrim);
    trimB = Math.min(trimB, maxTrim);

    let path = cutStart(e.path, trimA);
    path = cutEnd(path, trimB);
    if (path.length < 2) continue;
    corridors.set(eid, { edgeId: eid, path, lineIds });
  }

  // ── Inner connections at junction nodes ────────────────────────────────────
  const connectors: ConnectorGeometry[] = [];
  for (const nodeId of [...graph.nodes.keys()].sort()) {
    const node = graph.nodes.get(nodeId);
    if (node === undefined || node.edgeIds.length < 2) continue;

    const incident = node.edgeIds
      .map((eid) => corridors.get(eid))
      .filter((c): c is CorridorGeometry => c !== undefined);

    for (let i = 0; i < incident.length; i++) {
      for (let j = i + 1; j < incident.length; j++) {
        const ce = incident[i];
        const cf = incident[j];
        const ee = graph.edges.get(ce.edgeId);
        const ef = graph.edges.get(cf.edgeId);
        if (ee === undefined || ef === undefined) continue;

        const endE: 'start' | 'end' = ee.nodeA === nodeId ? 'start' : 'end';
        const endF: 'start' | 'end' = ef.nodeA === nodeId ? 'start' : 'end';

        for (const lineId of ce.lineIds) {
          if (!cf.lineIds.includes(lineId)) continue;
          // Unique-continuation check: skip lines present in a third edge here.
          const presentIn = incident.filter((c) => c.lineIds.includes(lineId));
          if (presentIn.length !== 2) continue;

          const p = portAt(ce, lineId, endE);
          const q = portAt(cf, lineId, endF);
          const d = norm(sub(q, p));
          if (d < 1e-6) continue;

          // Tangents continuing the travel direction into the node area.
          const inwardE =
            endE === 'end'
              ? endDirection(ce.path, 'end')
              : scale(endDirection(ce.path, 'start'), -1);
          const inwardF =
            endF === 'end'
              ? endDirection(cf.path, 'end')
              : scale(endDirection(cf.path, 'start'), -1);

          const arm = d * BEZIER_ARM_FACTOR;
          const path = cubicBezier(
            p,
            add(p, scale(inwardE, arm)),
            add(q, scale(inwardF, arm)),
            q,
            BEZIER_SAMPLES,
          );
          connectors.push({ lineId, path });
        }
      }
    }
  }

  // ── Stations: proximity-grouped stops projected onto their corridor ────────
  const stations = buildStations(cityData, corridors);

  return { corridors: [...corridors.values()], connectors, stations };
}

interface StopEntry {
  stopId: string;
  position: CsPoint;
  lineId: string;
}

function buildStations(
  cityData: CityData,
  corridors: Map<string, CorridorGeometry>,
): StationGeometry[] {
  const entries: StopEntry[] = [];
  for (const line of [...cityData.transitLines].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const seen = new Set<string>();
    for (const stop of line.stops) {
      if (seen.has(stop.id)) continue; // circular routes repeat the terminal stop
      seen.add(stop.id);
      entries.push({
        stopId: stop.id,
        position: { x: stop.position.x, z: stop.position.z },
        lineId: line.id,
      });
    }
  }

  // Greedy proximity grouping (deterministic: entries are in sorted order).
  const grouped = new Set<number>();
  const stations: StationGeometry[] = [];
  const lineInfoById = new Map(
    cityData.transitLines.map((l) => [
      l.id,
      { name: l.name, color: l.color, mode: l.mode },
    ]),
  );

  for (let i = 0; i < entries.length; i++) {
    if (grouped.has(i)) continue;
    const group = [entries[i]];
    grouped.add(i);
    for (let j = i + 1; j < entries.length; j++) {
      if (grouped.has(j)) continue;
      const d = norm(sub(entries[j].position, entries[i].position));
      if (d <= STATION_MERGE_THRESHOLD_M) {
        group.push(entries[j]);
        grouped.add(j);
      }
    }

    const centroid = scale(
      group.reduce((acc, e) => add(acc, e.position), { x: 0, z: 0 }),
      1 / group.length,
    );
    const groupLineIds = [...new Set(group.map((e) => e.lineId))].sort();

    // Nearest corridor carrying any of the group's lines.
    let best: {
      corridor: CorridorGeometry;
      point: CsPoint;
      dir: CsPoint;
    } | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const eid of [...corridors.keys()].sort()) {
      const c = corridors.get(eid);
      if (c === undefined) continue;
      if (!groupLineIds.some((l) => c.lineIds.includes(l))) continue;
      const proj = projectOnPath(centroid, c.path);
      if (proj !== null && proj.dist < bestDist) {
        bestDist = proj.dist;
        best = { corridor: c, point: proj.point, dir: proj.dir };
      }
    }
    if (best === null) continue;

    const n = best.corridor.lineIds.length;
    const halfAcross = (n * SLOT_M) / 2 + LINE_WIDTH_M / 2;
    const halfAlong = SLOT_M * 0.9;
    const along = unit(best.dir);
    const across = rightOf(along);
    const c0 = add(
      add(best.point, scale(along, -halfAlong)),
      scale(across, -halfAcross),
    );
    const c1 = add(
      add(best.point, scale(along, halfAlong)),
      scale(across, -halfAcross),
    );
    const c2 = add(
      add(best.point, scale(along, halfAlong)),
      scale(across, halfAcross),
    );
    const c3 = add(
      add(best.point, scale(along, -halfAlong)),
      scale(across, halfAcross),
    );

    const lines = groupLineIds
      .map((id) => lineInfoById.get(id))
      .filter((l): l is StationLineInfo => l !== undefined);

    stations.push({
      id: group[0].stopId,
      polygon: [c0, c1, c2, c3, c0],
      lines,
    });
  }

  return stations;
}

/** Projects `p` onto a polyline; returns closest point, segment direction, and distance. */
function projectOnPath(
  p: CsPoint,
  path: CsPoint[],
): { point: CsPoint; dir: CsPoint; dist: number } | null {
  let best: { point: CsPoint; dir: CsPoint; dist: number } | null = null;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const ab = sub(b, a);
    const len2 = ab.x * ab.x + ab.z * ab.z;
    if (len2 === 0) continue;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / len2),
    );
    const point = add(a, scale(ab, t));
    const dist = norm(sub(p, point));
    if (best === null || dist < best.dist) {
      best = { point, dir: ab, dist };
    }
  }
  return best;
}
