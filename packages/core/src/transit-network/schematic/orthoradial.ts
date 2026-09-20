/**
 * Orthoradial schematic layout (Story 4.3): the polar counterpart of the
 * octilinear grammar, where every stroke runs either *around* the centre or
 * straight out from it.
 *
 * @remarks
 * The same machinery as `./octilinear`, on a different base grid — that is the
 * whole point of `./grid-layout`. This module contributes rings × spokes and
 * nothing else.
 *
 * **An arc here is a chord, not a curve.** A step around a ring is drawn as the
 * straight segment between two neighbouring spoke positions, so at
 * {@link ORTHORADIAL_GRID.spokes} = 16 a "ring" is a 16-gon and a single step
 * subtends 22.5°. Both endpoints are at the same radius, which is the property
 * {@link orthoradialConformanceOf} verifies, but the drawn line is not a
 * constant-radius curve and the layout must not be described as one. Emitting
 * real SVG arcs would need a curve primitive the {@link SchematicSegment}
 * contract does not have (it carries a polyline), so that is a change to the
 * contract, not to this file.
 */

import type { TransitNetwork } from '../../types/transit-network';
import {
  SCHEMATIC_VIEWBOX_SIZE,
  type SchematicLayout,
  type SchematicPoint,
} from './contract';
import {
  gridSchematicLayout,
  schematicLayoutDiagnostics,
  type GridBase,
  type GridStep,
} from './grid-layout';

/** Grid shape. Spokes are a multiple of 8 so the cardinal axes are on-grid. */
export const ORTHORADIAL_GRID = {
  spokes: 16,
  minRings: 5,
  maxRings: 16,
  /** Free radius kept beyond the furthest seed, as a fraction of it. */
  padding: 0.18,
} as const;

function ringsFor(seedCount: number): number {
  const wanted = Math.ceil(Math.sqrt(Math.max(1, seedCount))) + 4;
  return Math.min(
    ORTHORADIAL_GRID.maxRings,
    Math.max(ORTHORADIAL_GRID.minRings, wanted),
  );
}

/**
 * A rings × spokes grid centred on the centroid of `seeds`.
 *
 * @remarks
 * Ring 0 is a single cell — the centre. Giving it one cell rather than
 * `spokes` coincident ones is what keeps the degenerate case (a node right on
 * the centroid) honest: two distinct nodes can never collapse onto the same
 * point, and a step out of the centre is unambiguously radial.
 */
export function createOrthoradialGrid(
  seeds: readonly SchematicPoint[],
): GridBase {
  const spokes = ORTHORADIAL_GRID.spokes;
  const rings = ringsFor(seeds.length);
  const count = seeds.length;
  const cx = count > 0 ? seeds.reduce((acc, s) => acc + s.x, 0) / count : 0;
  const cy = count > 0 ? seeds.reduce((acc, s) => acc + s.y, 0) / count : 0;
  let maxRadius = 0;
  for (const s of seeds) {
    const r = Math.hypot(s.x - cx, s.y - cy);
    if (r > maxRadius) maxRadius = r;
  }
  const extent =
    (maxRadius > 0 ? maxRadius : 1) * (1 + ORTHORADIAL_GRID.padding);
  const ringStep = extent / (rings - 1);
  const arcStep = (2 * Math.PI) / spokes;

  const ringOf = (cell: number): number =>
    cell === 0 ? 0 : Math.floor((cell - 1) / spokes) + 1;
  const spokeOf = (cell: number): number =>
    cell === 0 ? 0 : (cell - 1) % spokes;
  const cellAt = (r: number, s: number): number =>
    r <= 0 ? 0 : 1 + (r - 1) * spokes + (((s % spokes) + spokes) % spokes);

  const neighborCache = new Map<number, readonly GridStep[]>();

  return {
    cellCount: 1 + (rings - 1) * spokes,
    point(cell) {
      const r = ringOf(cell);
      if (r === 0) return { x: cx, y: cy };
      const radius = r * ringStep;
      const angle = spokeOf(cell) * arcStep;
      return {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    },
    snap(p) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const radius = Math.hypot(dx, dy);
      const r = Math.min(rings - 1, Math.max(0, Math.round(radius / ringStep)));
      if (r === 0) return 0;
      return cellAt(r, Math.round(Math.atan2(dy, dx) / arcStep));
    },
    neighbors(cell) {
      const cached = neighborCache.get(cell);
      if (cached) return cached;
      const r = ringOf(cell);
      const s = spokeOf(cell);
      const steps: GridStep[] = [];
      if (r === 0) {
        // The centre reaches the first ring along every spoke, and only
        // radially: it has no angle of its own.
        for (let k = 0; k < spokes; k++) {
          steps.push({ cell: cellAt(1, k), dir: 0, cost: ringStep });
        }
      } else {
        if (r + 1 <= rings - 1) {
          steps.push({ cell: cellAt(r + 1, s), dir: 0, cost: ringStep });
        }
        steps.push({ cell: cellAt(r - 1, s), dir: 1, cost: ringStep });
        const chord = 2 * r * ringStep * Math.sin(arcStep / 2);
        steps.push({ cell: cellAt(r, s + 1), dir: 2, cost: chord });
        steps.push({ cell: cellAt(r, s - 1), dir: 3, cost: chord });
      }
      const frozen = Object.freeze(steps);
      neighborCache.set(cell, frozen);
      return frozen;
    },
    lineTo(from, to) {
      const rf = ringOf(from);
      const sf = spokeOf(from);
      const rt = ringOf(to);
      const st = spokeOf(to);
      const cells = [from];
      let r = rf;
      let s = sf;
      // Arc first, then radial — except out of (or into) the centre, which has
      // no arc to travel along.
      if (rf > 0 && rt > 0 && sf !== st) {
        const forward = (((st - sf) % spokes) + spokes) % spokes;
        const stepDir = forward <= spokes - forward ? 1 : -1;
        const turns = stepDir === 1 ? forward : spokes - forward;
        for (let k = 0; k < turns; k++) {
          s += stepDir;
          cells.push(cellAt(r, s));
        }
      }
      const targetSpoke = rf === 0 ? st : s;
      while (r !== rt) {
        r += Math.sign(rt - r);
        cells.push(cellAt(r, targetSpoke));
      }
      return cells.length >= 2 ? cells : [from, to];
    },
  };
}

/**
 * Orthoradial strategy: rings and spokes centred on the node centroid.
 */
export const orthoradialSchematicLayout = (
  network: TransitNetwork,
): SchematicLayout => orthoradialLayoutWithCentre(network).layout;

/**
 * The layout plus the centre its grammar is measured against, in final viewBox
 * coordinates.
 *
 * @remarks
 * "Arc or radial" is only a claim relative to a centre, so the conformance
 * check needs it. It is a genuine property of the layout (cell 0 of the grid,
 * carried through the same projection as every drawn point), not a fixture.
 */
export function orthoradialLayoutWithCentre(network: TransitNetwork): {
  layout: SchematicLayout;
  centre: SchematicPoint;
} {
  let planeCentre: SchematicPoint = { x: 0, y: 0 };
  const layout = gridSchematicLayout(network, (seeds) => {
    const grid = createOrthoradialGrid(seeds);
    planeCentre = grid.point(0);
    return grid;
  });
  const project = schematicLayoutDiagnostics(layout)?.project;
  if (project === undefined) {
    // No grid was built, so there is no centre — the network had nothing to
    // draw. Handing back the unprojected plane origin would invite a
    // conformance verdict measured against a centre that is not in the
    // layout's coordinate space, which would be a false pass or a false fail
    // on geometry that does not exist.
    if (layout.segments.length > 0) {
      throw new Error(
        'SCHEMATIC_ORTHORADIAL_NO_CENTRE: a drawn layout has no grid diagnostics',
      );
    }
    return { layout, centre: Object.freeze({ x: 0, y: 0 }) };
  }
  return { layout, centre: project(planeCentre) };
}

/** Absolute tolerance on a radius difference, in viewBox units. */
const RADIUS_EPSILON = 1e-6 * SCHEMATIC_VIEWBOX_SIZE;

/**
 * How many steps of each kind a layout draws, and which ones break the rule.
 *
 * @remarks
 * `arcSteps` counts chords whose two ends share a radius — see the module
 * remarks on why that is not the same as a curved arc.
 */
export interface OrthoradialConformance {
  readonly conformant: boolean;
  readonly arcSteps: number;
  readonly radialSteps: number;
  /** `lineId#step` labels of the steps that are neither. */
  readonly violations: readonly string[];
}

/**
 * Classifies every stroke step of an orthoradial layout as around-the-centre
 * (both ends at one radius) or radial (both ends on one ray).
 *
 * @remarks
 * The around-the-centre test compares radii only; it does not and cannot assert
 * that the drawn step is curved, because it is not (module remarks).
 */
export function orthoradialConformanceOf(
  layout: SchematicLayout,
  centre: SchematicPoint,
): OrthoradialConformance {
  let arcSteps = 0;
  let radialSteps = 0;
  const violations: string[] = [];
  for (const segment of layout.segments) {
    for (let i = 1; i < segment.points.length; i++) {
      const a = segment.points[i - 1];
      const b = segment.points[i];
      if (Math.hypot(b.x - a.x, b.y - a.y) <= RADIUS_EPSILON) continue;
      const ra = Math.hypot(a.x - centre.x, a.y - centre.y);
      const rb = Math.hypot(b.x - centre.x, b.y - centre.y);
      if (Math.abs(ra - rb) <= RADIUS_EPSILON) {
        arcSteps++;
        continue;
      }
      // Radial: both ends on the same ray out of the centre. A step that
      // touches the centre itself is radial by definition.
      const cross =
        (a.x - centre.x) * (b.y - centre.y) -
        (a.y - centre.y) * (b.x - centre.x);
      const dot =
        (a.x - centre.x) * (b.x - centre.x) +
        (a.y - centre.y) * (b.y - centre.y);
      const atCentre = ra <= RADIUS_EPSILON || rb <= RADIUS_EPSILON;
      if (atCentre || (Math.abs(cross) <= 1e-6 * ra * rb && dot > 0)) {
        radialSteps++;
        continue;
      }
      violations.push(`${segment.lineId}#${i}`);
    }
  }
  return Object.freeze({
    conformant: violations.length === 0,
    arcSteps,
    radialSteps,
    violations: Object.freeze(violations),
  });
}

/** Runs the strategy and classifies its geometry in one call. */
export function orthoradialConformance(
  network: TransitNetwork,
): OrthoradialConformance {
  const { layout, centre } = orthoradialLayoutWithCentre(network);
  return orthoradialConformanceOf(layout, centre);
}
