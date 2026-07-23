/** Polyline measurement and trimming helpers (world space). */

import type { CsPoint } from '../../../coordinate-transform';
import { norm, sub, add, scale, unit } from './vector';

/** Total length of a polyline, in world meters. */
export function pathLength(path: CsPoint[]): number {
  if (path.length < 2) return 0;

  let totalLength = 0;

  for (let i = 1; i < path.length; i++) {
    const segmentVector = sub(path[i], path[i - 1]);
    totalLength += norm(segmentVector);
  }

  return totalLength;
}

/** Cuts `dist` world meters off the start of `path`. */
export function cutStart(path: CsPoint[], distance: number): CsPoint[] {
  if (distance <= 0) return path;
  if (path.length < 2) return [...path];

  let remainingDistance = distance;

  for (let i = 1; i < path.length; i++) {
    const startPoint = path[i - 1];
    const endPoint = path[i];
    const segmentVector = sub(endPoint, startPoint);
    const segmentLength = norm(segmentVector);

    if (segmentLength > remainingDistance) {
      const t = remainingDistance / segmentLength;
      const cutPoint = add(startPoint, scale(segmentVector, t));

      return [cutPoint, ...path.slice(i)];
    }

    remainingDistance -= segmentLength;
  }
  return [path[path.length - 1]];
}

/** Cuts `dist` world meters off the end of `path`. */
export function cutEnd(path: CsPoint[], dist: number): CsPoint[] {
  return [...cutStart([...path].reverse(), dist)].reverse();
}

/** Travel direction (A→B) of the path at its start or end. */
export function endDirection(path: CsPoint[], at: 'start' | 'end'): CsPoint {
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
  const points: CsPoint[] = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;

    const x = calculateCubicBezierCoordinate(p0.x, p1.x, p2.x, p3.x, t, u);
    const z = calculateCubicBezierCoordinate(p0.z, p1.z, p2.z, p3.z, t, u);

    points.push({ x, z });
  }

  return points;
}

function calculateCubicBezierCoordinate(
  a: number,
  b: number,
  c: number,
  d: number,
  t: number,
  u: number,
): number {
  // Fórmula de Bézier cúbica: (1-t)³·a + 3(1-t)²t·b + 3(1-t)t²·c + t³·d
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}
