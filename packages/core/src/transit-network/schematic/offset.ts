/**
 * Perpendicular offsetting of a schematic polyline — LOOM §5 step 1 done on the
 * CPU.
 *
 * @remarks
 * The map never needed this module: MapLibre's `line-offset` moves each line
 * into its slot on the GPU, so `../render-geometry` only ever emits the shared
 * centerline and an `offsetIndex` per line. An SVG `<polyline>` has no such
 * property, so the diagram has to compute the offset polyline itself — this is
 * the one genuinely new piece of geometry in Story 4.3b.
 *
 * The offset of a polyline is not the offset of its points: at every interior
 * vertex the two offset lines have to be *intersected*, which is the miter join.
 * A miter grows without bound as a turn sharpens (it is `1 / cos(θ/2)` of the
 * offset distance), and at a 180° reversal it is infinite, so past a limit the
 * join is beveled instead — the same rule SVG's own `stroke-linejoin` uses, for
 * the same reason.
 */

import {
  perpCCW,
  vAdd,
  vCross,
  vDot,
  vScale,
  vSub,
  vUnit,
  type Vec2,
} from '../geometry-kit';
import type { SchematicPoint } from './contract';

/**
 * How far a miter join may reach, as a multiple of the offset distance.
 *
 * @remarks
 * 4 is SVG's own `stroke-miterlimit` default, and it gives way at about 29° of
 * included angle — sharper than any turn an octilinear grid can make (45°), so
 * in practice only reversals and orthoradial cusps are beveled.
 */
export const MITER_LIMIT = 4;

/** Below this, a vertex is a duplicate of its predecessor and carries no direction. */
const DEGENERATE = 1e-9;

const toVec = (p: SchematicPoint): Vec2 => [p.x, p.y];
const toPoint = (v: Vec2): SchematicPoint => ({ x: v[0], y: v[1] });

/**
 * The hand a positive offset moves a line towards, given a travel direction in
 * schematic space.
 *
 * @remarks
 * **This is the easy mistake, so it is the one named function.** The map frame
 * is `{x, z}` with `z` growing north, and `rightOf` there is `perpCW`, calibrated
 * to the sign of MapLibre's `line-offset`. Schematic space is that frame
 * mirrored vertically (`y = −z`), so copying `perpCW` across would put every
 * line and every capsule on the *wrong* hand — a diagram that is a mirror image
 * of the map it claims to abstract. The mirror flips the sense of a rotation, so
 * the same visual hand is {@link perpCCW} here.
 *
 * `./render.test.ts` proves the equality rather than trusting this paragraph.
 */
export function offsetTowards(direction: SchematicPoint): SchematicPoint {
  return toPoint(perpCCW(toVec(direction)));
}

/** Drops vertices that repeat their predecessor: a zero-length step has no normal. */
function dedupe(points: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (
      last !== undefined &&
      Math.hypot(p[0] - last[0], p[1] - last[1]) <= DEGENERATE
    ) {
      continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * Offsets a polyline by `distance` viewBox units towards
 * {@link offsetTowards} (negative moves the other way), joining the pieces with
 * a miter capped at {@link MITER_LIMIT}.
 *
 * @remarks
 * Structure of the result:
 *
 * - `distance === 0` hands back the input's **own** vertices, untouched and
 *   un-deduplicated, so the centre line of an odd bundle is byte-identical to the
 *   centerline it came from — including a repeated vertex, which would otherwise
 *   make that one stroke shorter than its corridor while its neighbours kept it.
 * - A polyline with fewer than two distinct vertices has no direction to offset
 *   along and is returned as-is (never dropped: a stroke that vanishes is a
 *   missing corridor, which is a fidelity failure).
 * - A non-finite `distance` is refused. Arithmetic on `NaN` propagates through
 *   every vertex, so the stroke would render as nothing at all with no error
 *   anywhere — the failure mode this whole module exists to make impossible.
 * - A join inside the limit yields **one** point, so a straight run keeps its
 *   two vertices and an octilinear elbow stays an elbow. A join past the limit
 *   yields **two** — the ends of both offset pieces — which is the bevel.
 *
 * @param points - The centerline, in schematic space.
 * @param distance - Signed offset in viewBox units.
 */
export function offsetPolyline(
  points: readonly SchematicPoint[],
  distance: number,
): SchematicPoint[] {
  if (!Number.isFinite(distance)) {
    throw new Error(
      `SCHEMATIC_BAD_OFFSET: ${String(distance)} is not a finite distance`,
    );
  }
  // Verbatim, before any dedupe: the promise above is byte-identity.
  if (distance === 0) return points.map((p) => ({ x: p.x, y: p.y }));

  const path = dedupe(points.map(toVec));
  if (path.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));

  // One unit direction and one offset vector per piece.
  const dirs: Vec2[] = [];
  const normals: Vec2[] = [];
  for (let i = 1; i < path.length; i++) {
    const dir = vUnit(vSub(path[i], path[i - 1]));
    dirs.push(dir);
    normals.push(vScale(perpCCW(dir), distance));
  }

  const out: Vec2[] = [vAdd(path[0], normals[0])];
  for (let i = 1; i < path.length - 1; i++) {
    const nIn = normals[i - 1];
    const nOut = normals[i];
    const denominator = 1 + vDot(dirs[i - 1], dirs[i]);
    // The miter point is `(nIn + nOut) / (1 + dIn·dOut)`: the intersection of
    // the two offset lines. The denominator vanishes at a reversal, where the
    // lines are parallel and there is no intersection at all.
    if (denominator > DEGENERATE) {
      const miter = vScale(vAdd(nIn, nOut), 1 / denominator);
      if (Math.hypot(miter[0], miter[1]) <= MITER_LIMIT * Math.abs(distance)) {
        out.push(vAdd(path[i], miter));
        continue;
      }
    }
    out.push(vAdd(path[i], nIn), vAdd(path[i], nOut));
  }
  out.push(vAdd(path[path.length - 1], normals[normals.length - 1]));

  return out.map(toPoint);
}

/**
 * Signed turn at an interior vertex, in radians: `0` for a straight run,
 * `±π` for a full reversal. Shared by the offset tests and the router's own
 * graded turn cost, so both describe a turn the same way.
 */
export function turnAngle(
  before: SchematicPoint,
  at: SchematicPoint,
  after: SchematicPoint,
): number {
  const dIn = vUnit(vSub(toVec(at), toVec(before)));
  const dOut = vUnit(vSub(toVec(after), toVec(at)));
  return Math.atan2(vCross(dIn, dOut), vDot(dIn, dOut));
}
