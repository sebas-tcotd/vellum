/** Vector arithmetic helpers over `CsPoint` (world space). */

import type { CsPoint } from '../../../coordinate-transform';

export function sub(a: CsPoint, b: CsPoint): CsPoint {
  return { x: a.x - b.x, z: a.z - b.z };
}

export function add(a: CsPoint, b: CsPoint): CsPoint {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function scale(a: CsPoint, s: number): CsPoint {
  return { x: a.x * s, z: a.z * s };
}

export function norm(a: CsPoint): number {
  return Math.hypot(a.x, a.z);
}

export function unit(a: CsPoint): CsPoint {
  const n = norm(a);
  return n > 0 ? { x: a.x / n, z: a.z / n } : { x: 1, z: 0 };
}

/** Right of travel direction `d` in the rendered frame (matches MapLibre `line-offset` > 0). */
export function rightOf(d: CsPoint): CsPoint {
  const u = unit(d);
  return { x: u.z, z: -u.x };
}

/** Projects `p` onto a polyline; returns closest point, segment direction, and distance. */
export function projectOnPath(
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
