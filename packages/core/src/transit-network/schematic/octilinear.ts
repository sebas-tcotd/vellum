/**
 * Octilinear schematic layout (Story 4.3): the classic transit-diagram
 * grammar, where every stroke runs at a multiple of 45°.
 *
 * @remarks
 * The strategy contributes only a square base grid with eight directions; the
 * routing, node placement, stop transfer and normalisation all come from
 * `./grid-layout`. Conformance is therefore structural — a route is a walk
 * over grid steps, and the grid has no step that is not a multiple of 45°.
 */

import type { TransitNetwork } from '../../types/transit-network';
import type { SchematicLayout, SchematicPoint } from './contract';
import {
  gridSchematicLayout,
  type GridBase,
  type GridStep,
} from './grid-layout';

/** The eight octilinear directions, in a fixed order (E, SE, S, … , NE). */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/**
 * Cells per side. Enough room to route around occupied corridors without the
 * search space growing past what A* can cross inside its budget.
 */
export const OCTILINEAR_GRID = {
  minResolution: 14,
  maxResolution: 48,
  /** Free grid kept around the seeds' bounding box, as a fraction of its span. */
  padding: 0.18,
} as const;

function resolutionFor(seedCount: number): number {
  const wanted = 4 * Math.ceil(Math.sqrt(Math.max(1, seedCount))) + 8;
  return Math.min(
    OCTILINEAR_GRID.maxResolution,
    Math.max(OCTILINEAR_GRID.minResolution, wanted),
  );
}

/** A square grid of 8 directions covering `seeds`. */
export function createOctilinearGrid(
  seeds: readonly SchematicPoint[],
): GridBase {
  const side = resolutionFor(seeds.length);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of seeds) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  if (!Number.isFinite(minX)) {
    minX = maxX = minY = maxY = 0;
  }
  const span = Math.max(maxX - minX, maxY - minY);
  // A single-cell network still needs a grid with a step length.
  const extent = (span > 0 ? span : 1) * (1 + OCTILINEAR_GRID.padding);
  const step = extent / (side - 1);
  const originX = (minX + maxX) / 2 - extent / 2;
  const originY = (minY + maxY) / 2 - extent / 2;

  const col = (cell: number): number => cell % side;
  const row = (cell: number): number => Math.floor(cell / side);
  const cellAt = (c: number, r: number): number => r * side + c;
  const clamp = (v: number): number => Math.min(side - 1, Math.max(0, v));

  const neighborCache = new Map<number, readonly GridStep[]>();

  return {
    cellCount: side * side,
    point(cell) {
      return { x: originX + col(cell) * step, y: originY + row(cell) * step };
    },
    snap(p) {
      return cellAt(
        clamp(Math.round((p.x - originX) / step)),
        clamp(Math.round((p.y - originY) / step)),
      );
    },
    neighbors(cell) {
      const cached = neighborCache.get(cell);
      if (cached) return cached;
      const c = col(cell);
      const r = row(cell);
      const steps: GridStep[] = [];
      for (let dir = 0; dir < DIRS.length; dir++) {
        const [dx, dy] = DIRS[dir];
        const nc = c + dx;
        const nr = r + dy;
        if (nc < 0 || nc >= side || nr < 0 || nr >= side) continue;
        steps.push({
          cell: cellAt(nc, nr),
          dir,
          cost: step * Math.hypot(dx, dy),
        });
      }
      const frozen = Object.freeze(steps);
      neighborCache.set(cell, frozen);
      return frozen;
    },
    lineTo(from, to) {
      // Diagonal first, then straight: the shortest octilinear staircase, and
      // the same one for the same pair of cells every time.
      let c = col(from);
      let r = row(from);
      const tc = col(to);
      const tr = row(to);
      const cells = [from];
      while (c !== tc || r !== tr) {
        if (c !== tc) c += Math.sign(tc - c);
        if (r !== tr) r += Math.sign(tr - r);
        cells.push(cellAt(c, r));
      }
      return cells.length >= 2 ? cells : [from, to];
    },
  };
}

/**
 * Octilinear strategy: a square grid seeded with the line graph's projected
 * node positions, routed with the shared A*.
 */
export const octilinearSchematicLayout = (
  network: TransitNetwork,
): SchematicLayout => gridSchematicLayout(network, createOctilinearGrid);

/** Angular tolerance of the conformance check, in viewBox units of slope. */
const OCTILINEAR_EPSILON = 1e-6;

/**
 * Whether every stroke of `layout` runs at a multiple of 45°.
 *
 * @remarks
 * Checked on the *final* viewBox coordinates, not on the grid, because the
 * claim the diagram makes is about what is drawn. Normalisation is a uniform
 * scale, so an angle that holds on the grid still holds here; this function
 * exists to prove that, not to assume it.
 */
export function isOctilinearConformant(layout: SchematicLayout): boolean {
  return octilinearViolations(layout).length === 0;
}

/** Every stroke step that breaks the 45° grammar, as `lineId#step` labels. */
export function octilinearViolations(layout: SchematicLayout): string[] {
  const bad: string[] = [];
  for (const segment of layout.segments) {
    for (let i = 1; i < segment.points.length; i++) {
      const dx = segment.points[i].x - segment.points[i - 1].x;
      const dy = segment.points[i].y - segment.points[i - 1].y;
      const reach = Math.max(Math.abs(dx), Math.abs(dy));
      // A zero-length step has no direction to be wrong about.
      if (reach <= OCTILINEAR_EPSILON) continue;
      const axial =
        Math.abs(dx) / reach <= OCTILINEAR_EPSILON ||
        Math.abs(dy) / reach <= OCTILINEAR_EPSILON;
      const diagonal = Math.abs(Math.abs(dx) - Math.abs(dy)) / reach <= 1e-6;
      if (!axial && !diagonal) bad.push(`${segment.lineId}#${i}`);
    }
  }
  return bad;
}
