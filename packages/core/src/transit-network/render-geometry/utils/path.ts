/** Pure polyline measurement and trimming helpers (world space). */

import type { CsPoint } from '../../../coordinate-transform';
import {
  cubicBezier as cubicBezierVec2,
  cutEnd as cutEndVec2,
  cutStart as cutStartVec2,
  polylineLength,
  type Vec2,
} from '../../geometry-kit';
import { sub, unit } from './vector';

const toVec = (p: CsPoint): Vec2 => [p.x, p.z];
const toCs = (v: Vec2): CsPoint => ({ x: v[0], z: v[1] });

/**
 * Total length of a polyline, in world meters.
 *
 * @remarks
 * Measurement and trimming are frame-agnostic, so they live once in
 * `../../geometry-kit` and the schematic view reuses them in viewBox units
 * (Story 4.3b). These wrappers only change the vocabulary.
 */
export function pathLength(path: readonly Readonly<CsPoint>[]): number {
  return polylineLength(path.map(toVec));
}

/** Cuts `dist` world meters off the start of `path`. */
export function cutStart(
  path: readonly Readonly<CsPoint>[],
  distance: number,
): CsPoint[] {
  return cutStartVec2(path.map(toVec), distance).map(toCs);
}

/** Cuts `dist` world meters off the end of `path`. */
export function cutEnd(
  path: readonly Readonly<CsPoint>[],
  dist: number,
): CsPoint[] {
  return cutEndVec2(path.map(toVec), dist).map(toCs);
}

/** Travel direction (A→B) of the path at its start or end. */
export function endDirection(
  path: readonly Readonly<CsPoint>[],
  at: 'start' | 'end',
): CsPoint {
  if (path.length < 2) return { x: 1, z: 0 };
  return at === 'start'
    ? unit(sub(path[1], path[0]))
    : unit(sub(path[path.length - 1], path[path.length - 2]));
}

export function cubicBezier(
  p0: CsPoint,
  p1: CsPoint,
  p2: CsPoint,
  p3: CsPoint,
  samples: number,
): CsPoint[] {
  return cubicBezierVec2(
    toVec(p0),
    toVec(p1),
    toVec(p2),
    toVec(p3),
    samples,
  ).map(toCs);
}
