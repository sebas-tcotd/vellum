/**
 * Angles at which a corridor leaves its nodes, in the drawing plane.
 *
 * @remarks
 * The router (circular order, `octi` §4.3), the node splitting of SSTD §2 and
 * the metrics all need the **geographic** order of the corridors around a node,
 * and all three must agree on it. `LineGraphNode.edgeIds` is sorted
 * counter-clockwise in *world* space, but the plane flips the vertical axis
 * (`CS1_LAT_SIGN`), which mirrors the orientation; reading the angle in the
 * plane once, here, keeps the three consumers from each guessing the flip.
 */

import { CS1_LAT_SIGN, type CsPoint } from '../../coordinate-transform';
import type { SchematicPoint } from './contract';

/**
 * How far along the corridor (world meters) the departure direction is read.
 * A road curls right at a junction; a few tens of meters out says where the
 * corridor is actually heading. Short corridors use a third of their length.
 */
export const DEPARTURE_PROBE_M = 50;

const toPlanePoint = (p: CsPoint): SchematicPoint => ({
  x: p.x,
  y: -CS1_LAT_SIGN * p.z,
});

/**
 * Plane angle (radians, `atan2` convention) of the direction in which `path`
 * leaves its `end`, or `null` when the path has no length.
 */
export function departureAngle(
  path: readonly CsPoint[],
  end: 'start' | 'end',
): number | null {
  const points = (end === 'start' ? path : [...path].reverse())
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z))
    .map(toPlanePoint);
  if (points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
  }
  if (total <= 0) return null;
  const want = Math.min(DEPARTURE_PROBE_M, total / 3);
  let walked = 0;
  const origin = points[0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const piece = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + piece >= want && piece > 0) {
      // Never behind the piece's start: once a degenerate hit at the origin has
      // been skipped, `walked` is already past `want`.
      const t = Math.max(0, (want - walked) / piece);
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (Math.hypot(x - origin.x, y - origin.y) > 0) {
        return Math.atan2(y - origin.y, x - origin.x);
      }
    }
    walked += piece;
  }
  const last = points[points.length - 1];
  return Math.atan2(last.y - origin.y, last.x - origin.x);
}

/**
 * Plane angle of the first drawn piece of a centerline leaving `end`, or
 * `null` when every vertex coincides.
 */
export function drawnDepartureAngle(
  points: readonly SchematicPoint[],
  end: 'start' | 'end',
): number | null {
  const ordered = end === 'start' ? points : [...points].reverse();
  const origin = ordered[0];
  for (let i = 1; i < ordered.length; i++) {
    const dx = ordered[i].x - origin.x;
    const dy = ordered[i].y - origin.y;
    if (Math.hypot(dx, dy) > 1e-9) return Math.atan2(dy, dx);
  }
  return null;
}

/** `angle` folded into `[0, 2π)`. */
export function normalizeAngle(angle: number): number {
  const turn = 2 * Math.PI;
  return ((angle % turn) + turn) % turn;
}

/**
 * Whether `drawn` is a cyclic rotation of `geographic`: the same circular
 * order of the same ids, wherever the sequence starts.
 */
export function sameCircularOrder(
  geographic: readonly string[],
  drawn: readonly string[],
): boolean {
  if (geographic.length !== drawn.length) return false;
  if (geographic.length <= 2) return true;
  const start = drawn.indexOf(geographic[0]);
  if (start < 0) return false;
  for (let i = 0; i < geographic.length; i++) {
    if (drawn[(start + i) % drawn.length] !== geographic[i]) return false;
  }
  return true;
}
