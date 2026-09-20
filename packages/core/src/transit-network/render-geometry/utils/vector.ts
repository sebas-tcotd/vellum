/**
 * Pure vector arithmetic over `CsPoint` (world space), adapted from the
 * frame-agnostic `../../geometry-kit`.
 *
 * @remarks
 * The kit offers both perpendiculars and refuses to name either one "right",
 * because the answer depends on the frame. Here the frame is the rendered map
 * (`x` east, `z` north), so right of travel is {@link perpCW} — the direction a
 * positive MapLibre `line-offset` moves a line. The schematic view draws on the
 * vertically mirrored SVG frame and therefore uses the *other* perpendicular
 * for the same visual hand; see `../../schematic/offset.ts`.
 */

import type { CsPoint } from '../../../coordinate-transform';
import {
  perpCW,
  projectOnPolyline,
  vAdd,
  vNorm,
  vScale,
  vSub,
  vUnit,
  type Vec2,
} from '../../geometry-kit';

const toVec = (p: CsPoint): Vec2 => [p.x, p.z];
const toCs = (v: Vec2): CsPoint => ({ x: v[0], z: v[1] });

export function sub(a: CsPoint, b: CsPoint): CsPoint {
  return toCs(vSub(toVec(a), toVec(b)));
}

export function add(a: CsPoint, b: CsPoint): CsPoint {
  return toCs(vAdd(toVec(a), toVec(b)));
}

export function scale(a: CsPoint, s: number): CsPoint {
  return toCs(vScale(toVec(a), s));
}

export function norm(a: CsPoint): number {
  return vNorm(toVec(a));
}

export function unit(a: CsPoint): CsPoint {
  return toCs(vUnit(toVec(a)));
}

/** Right of travel direction `d` in the rendered frame (matches MapLibre `line-offset` > 0). */
export function rightOf(d: CsPoint): CsPoint {
  return toCs(perpCW(toVec(d)));
}

/** Projects `p` onto a polyline; returns closest point, segment direction, and distance. */
export function projectOnPath(
  p: CsPoint,
  path: readonly Readonly<CsPoint>[],
): { point: CsPoint; dir: CsPoint; dist: number } | null {
  const hit = projectOnPolyline(toVec(p), path.map(toVec));
  return hit === null
    ? null
    : { point: toCs(hit.point), dir: toCs(hit.dir), dist: hit.dist };
}
