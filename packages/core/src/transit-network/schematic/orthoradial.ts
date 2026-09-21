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
 * straight segment between two neighbouring spoke positions, so a "ring" of `b`
 * spokes is a `b`-gon and a single step subtends `360° / b`. Both endpoints are
 * at the same radius, which is the property
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

/**
 * Grid shape. The base spoke count is a multiple of 8 so the cardinal and
 * diagonal axes are on-grid at every ring — see {@link spokesAtRing} for why the
 * count is not constant.
 */
export const ORTHORADIAL_GRID = {
  /** Spokes of ring 1. Every outer ring is this doubled some number of times. */
  baseSpokes: 8,
  minRings: 5,
  /** Hard presentation limit; the grid grows before it refuses a dense network. */
  maxRings: 32,
  /** Free radius kept beyond the furthest seed, as a fraction of it. */
  padding: 0.18,
} as const;

function capacityAt(rings: number): number {
  let capacity = 1;
  for (let ring = 1; ring < rings; ring++) capacity += spokesAtRing(ring);
  return capacity;
}

function ringsFor(seedCount: number): number {
  let rings = ORTHORADIAL_GRID.minRings;
  while (rings < ORTHORADIAL_GRID.maxRings && capacityAt(rings) < seedCount) {
    rings++;
  }
  if (capacityAt(rings) < seedCount) {
    throw new Error(
      `SCHEMATIC_GRID_EXHAUSTED: ${capacityAt(rings)} cells cannot hold ${seedCount} nodes`,
    );
  }
  return rings;
}

/**
 * Spokes of ring `r`: the base count doubled once per doubling of the radius —
 * the **pseudo-orthoradial** grid of SSTD §5.2.
 *
 * @remarks
 * A fixed spoke count is what the first cut of this grid had, and it is wrong in
 * both directions at once. The arc distance between neighbouring cells is
 * `2·r·sin(π/b)`, so with `b` constant the inner rings are crowded to the point
 * where two cells are closer together than a station symbol is wide, while the
 * outer rings are so sparse that a corridor has nowhere to go but a long chord.
 * Doubling `b` whenever `r` doubles holds that spacing inside a factor of two
 * everywhere, which is exactly the property the paper builds the grid for.
 *
 * `2 ** Math.floor(Math.log2(r))` is the octave of `r`: rings 1, 2–3, 4–7 and
 * 8–15 get 1×, 2×, 4× and 8× the base count. Every count is therefore a multiple
 * of the base, so a spoke of an inner ring always has an aligned spoke outside
 * it and a radial step is always exactly radial.
 */
export function spokesAtRing(ring: number): number {
  if (ring <= 0) return 1;
  return ORTHORADIAL_GRID.baseSpokes * 2 ** Math.floor(Math.log2(ring));
}

/**
 * A rings × spokes grid centred on the centroid of `seeds`, with the spoke count
 * doubling as the radius doubles ({@link spokesAtRing}).
 *
 * @remarks
 * Ring 0 is a single cell — the centre. Giving it one cell rather than `spokes`
 * coincident ones is what keeps the degenerate case (a node right on the
 * centroid) honest: two distinct nodes can never collapse onto the same point,
 * and a step out of the centre is unambiguously radial.
 *
 * Because the spoke count doubles, an outer cell on an *odd* spoke has no
 * aligned neighbour on the ring inside it. Rather than bend the inward step onto
 * a neighbouring ray — which would draw a step that is neither an arc nor a
 * radial, breaking the grammar the whole grid exists to guarantee — that cell
 * simply has no inward step. It reaches the inner ring by one arc step onto an
 * even spoke and then inwards, which is a conformant walk.
 */
export function createOrthoradialGrid(
  seeds: readonly SchematicPoint[],
): GridBase {
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

  // Cell 0 is the centre; ring r occupies `spokesAtRing(r)` consecutive ids.
  const ringStart: number[] = [0, 1];
  for (let r = 1; r < rings; r++) {
    ringStart.push(ringStart[r] + spokesAtRing(r));
  }
  const cellCount = ringStart[rings];

  // Ring per cell, precomputed. `ringOf` is called from A*'s hot loop — `point`,
  // `spokeOf`, `snap` and `neighbors` all go through it — and a linear scan over
  // the rings there turned an O(1) lookup into O(rings) per expansion.
  const ringByCell = new Int32Array(cellCount);
  for (let r = 1; r < rings; r++) {
    ringByCell.fill(r, ringStart[r], ringStart[r + 1]);
  }
  const ringOf = (cell: number): number =>
    cell > 0 && cell < cellCount ? ringByCell[cell] : 0;
  const spokeOf = (cell: number): number =>
    cell <= 0 ? 0 : cell - ringStart[ringOf(cell)];
  const cellAt = (r: number, s: number): number => {
    if (r <= 0) return 0;
    const spokes = spokesAtRing(r);
    return ringStart[r] + (((s % spokes) + spokes) % spokes);
  };
  const arcStepAt = (r: number): number => (2 * Math.PI) / spokesAtRing(r);
  const angleOf = (r: number, s: number): number => s * arcStepAt(r);

  const neighborCache = new Map<number, readonly GridStep[]>();

  return {
    cellCount,
    point(cell) {
      const r = ringOf(cell);
      if (r === 0) return { x: cx, y: cy };
      const radius = r * ringStep;
      const angle = angleOf(r, spokeOf(cell));
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
      return cellAt(r, Math.round(Math.atan2(dy, dx) / arcStepAt(r)));
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
        for (let k = 0; k < spokesAtRing(1); k++) {
          steps.push({ cell: cellAt(1, k), dir: 0, cost: ringStep });
        }
      } else {
        if (r + 1 <= rings - 1) {
          // The aligned spoke outside: the same ray, doubled count or not.
          const factor = spokesAtRing(r + 1) / spokesAtRing(r);
          steps.push({
            cell: cellAt(r + 1, s * factor),
            dir: 0,
            cost: ringStep,
          });
        }
        const inwardFactor = spokesAtRing(r) / spokesAtRing(r - 1);
        // Only when this cell's ray exists on the ring inside it (module remarks).
        if (r === 1 || s % inwardFactor === 0) {
          steps.push({
            cell: cellAt(r - 1, s / inwardFactor),
            dir: 1,
            cost: ringStep,
          });
        }
        const chord = 2 * r * ringStep * Math.sin(arcStepAt(r) / 2);
        steps.push({ cell: cellAt(r, s + 1), dir: 2, cost: chord });
        steps.push({ cell: cellAt(r, s - 1), dir: 3, cost: chord });
      }
      const frozen = Object.freeze(steps);
      neighborCache.set(cell, frozen);
      return frozen;
    },
    lineTo(from, to) {
      // A conformant walk that ignores occupancy: step radially towards the
      // target ring, arcing one cell sideways whenever the inward step this cell
      // would need does not exist, then arc round to the target spoke.
      const targetRing = ringOf(to);
      const targetSpoke = spokeOf(to);
      const cells = [from];
      let r = ringOf(from);
      let s = spokeOf(from);
      const guard = 4 * cellCount;
      let walked = 0;
      while (r !== targetRing && walked++ < guard) {
        if (r < targetRing) {
          if (r === 0) {
            // Out of the centre: the ring-1 ray closest to the target's angle, so
            // the walk is a function of the two cells and nothing else.
            s = Math.round(angleOf(targetRing, targetSpoke) / arcStepAt(1));
            r = 1;
          } else {
            s *= spokesAtRing(r + 1) / spokesAtRing(r);
            r += 1;
          }
        } else {
          const inwardFactor = spokesAtRing(r) / spokesAtRing(r - 1);
          if (r > 1 && s % inwardFactor !== 0) {
            s -= 1;
            cells.push(cellAt(r, s));
            continue;
          }
          s = r === 1 ? 0 : s / inwardFactor;
          r -= 1;
        }
        cells.push(cellAt(r, s));
      }
      if (r > 0) {
        const spokes = spokesAtRing(r);
        const forward = (((targetSpoke - s) % spokes) + spokes) % spokes;
        const stepDir = forward <= spokes - forward ? 1 : -1;
        const turns = stepDir === 1 ? forward : spokes - forward;
        for (let k = 0; k < turns; k++) {
          s += stepDir;
          cells.push(cellAt(r, s));
        }
      }
      // This is the *fallback* route: whatever it returns is drawn as a corridor
      // and counted as a fallback that worked. A walk that ran out of guard and
      // stopped short would draw a corridor ending nowhere — a corridor that does
      // not reach its own node — and the metrics would call it fine. The guard is
      // generous (four passes over the grid) and a walk that needs more has hit a
      // bug in the grid, not a hard case, so it says so.
      if (cells[cells.length - 1] !== to) {
        throw new Error(
          `SCHEMATIC_ORTHORADIAL_WALK_LOST: ${from} → ${to} did not terminate within ${guard} steps`,
        );
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
 * How many steps of each kind a layout places, and which ones break the rule.
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
 * Classifies every step of an orthoradial layout's **corridor centerlines** as
 * around-the-centre (both ends at one radius) or radial (both ends on one ray).
 *
 * @remarks
 * The around-the-centre test compares radii only; it does not and cannot assert
 * that the drawn step is curved, because it is not (module remarks).
 *
 * Measured on the centerlines, not on the drawn strokes, and that is not a
 * loophole — it is where the claim lives. Story 4.3b's rendering stage offsets
 * each line into its slot and trims the corridor back from its nodes. A
 * *parallel* offset of a chord is still a chord of the same grammar: the offset
 * direction is perpendicular to the chord, so both ends move to the same new
 * radius. A **trim** is not: cutting a chord part-way leaves an endpoint at a
 * radius between the ring's and the chord's midpoint, so the trimmed piece has
 * ends at two radii while being no less orthoradial than the corridor it came
 * from. Asserting on the trimmed strokes would therefore report the free node
 * area — a LOOM rendering step — as a grammar violation. The inner connections
 * are exempt for the same reason and by design: LOOM §5 has a joint be an arc
 * precisely so it does not have to obey the grid.
 */
export function orthoradialConformanceOf(
  layout: SchematicLayout,
  centre: SchematicPoint,
): OrthoradialConformance {
  let arcSteps = 0;
  let radialSteps = 0;
  const violations: string[] = [];
  for (const corridor of layout.corridors) {
    for (let i = 1; i < corridor.points.length; i++) {
      const a = corridor.points[i - 1];
      const b = corridor.points[i];
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
      violations.push(`${corridor.edgeId}#${i}`);
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
