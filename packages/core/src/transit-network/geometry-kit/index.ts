/**
 * The dimensionless half of the LOOM rendering geometry: the arithmetic that is
 * true in *any* 2-D frame and in any unit.
 *
 * @remarks
 * ADR-0004 put the canonical LOOM geometry in `../render-geometry`, and with it
 * the one formula that decides where a line sits inside its corridor
 * ({@link slotOffsetIndex}). Story 4.3b needs exactly the same rules in the
 * schematic view, which draws in viewBox units on a vertically mirrored frame
 * (`{x, y}`, y growing *down*) rather than in world metres on the map frame
 * (`{x, z}`, z growing north).
 *
 * Duplicating the formula in a second module is what ADR-0004 forbids, so the
 * pieces that do not care about the frame live here once, over a plain
 * {@link Vec2} pair of numbers. `../render-geometry` keeps its `CsPoint`
 * signatures as thin adapters over these functions — the map's output is
 * unchanged, float for float — and the schematic adapts the same functions to
 * `SchematicPoint`.
 *
 * What is deliberately *not* here is the handedness. {@link perpCW} and
 * {@link perpCCW} are both offered, and each frame states which one means
 * "right of travel": the map frame is `z` north (`perpCW`), the schematic frame
 * is `y` down, i.e. mirrored, so the same visual hand is `perpCCW`. Hiding that
 * choice behind one `rightOf` is precisely how a mirrored diagram gets shipped.
 *
 * This module is internal to `@vellum/core`; nothing is re-exported from the
 * package barrel.
 */

/** A point or vector in an unspecified 2-D frame: `[first axis, second axis]`. */
export type Vec2 = readonly [number, number];

export function vAdd(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

export function vSub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function vScale(a: Vec2, s: number): Vec2 {
  return [a[0] * s, a[1] * s];
}

export function vDot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

/** Z-component of the cross product: positive when `b` is counter-clockwise of `a`. */
export function vCross(a: Vec2, b: Vec2): number {
  return a[0] * b[1] - a[1] * b[0];
}

export function vNorm(a: Vec2): number {
  return Math.hypot(a[0], a[1]);
}

/** Unit vector, falling back to the first axis for a zero-length input. */
export function vUnit(a: Vec2): Vec2 {
  const n = vNorm(a);
  return n > 0 ? [a[0] / n, a[1] / n] : [1, 0];
}

/**
 * Rotation by −90° in the frame's own orientation (`[v1, −v0]`).
 *
 * @remarks
 * In the map frame (`x` east, `z` north) this is "right of travel", which is
 * also the direction of a positive MapLibre `line-offset`.
 */
export function perpCW(a: Vec2): Vec2 {
  const u = vUnit(a);
  return [u[1], -u[0]];
}

/**
 * Rotation by +90° in the frame's own orientation (`[−v1, v0]`).
 *
 * @remarks
 * In a mirrored frame such as SVG user space (`x` right, `y` *down*) this is the
 * hand {@link perpCW} points to on the map — see the module remarks.
 */
export function perpCCW(a: Vec2): Vec2 {
  const u = vUnit(a);
  return [-u[1], u[0]];
}

/**
 * Canonical LOOM slot formula (ADR-0004): the signed, dimensionless offset
 * index of the line at `position` of a corridor carrying `slotCount` lines.
 *
 * @remarks
 * The single definition in the repo. Its physical displacement is
 * `offsetIndex × <one slot>`, where the slot width is the caller's unit:
 * `SLOT_M` metres on the map, `SCHEMATIC_SLOT` viewBox units in the diagram.
 */
export function slotOffsetIndex(position: number, slotCount: number): number {
  return position - (slotCount - 1) / 2;
}

/** Total length of a polyline. */
export function polylineLength(path: readonly Vec2[]): number {
  if (path.length < 2) return 0;
  let totalLength = 0;
  for (let i = 1; i < path.length; i++) {
    totalLength += vNorm(vSub(path[i], path[i - 1]));
  }
  return totalLength;
}

/** Cuts `distance` off the start of `path`. */
export function cutStart(path: readonly Vec2[], distance: number): Vec2[] {
  if (distance <= 0) return [...path];
  if (path.length < 2) return [...path];

  let remainingDistance = distance;

  for (let i = 1; i < path.length; i++) {
    const startPoint = path[i - 1];
    const endPoint = path[i];
    const segmentVector = vSub(endPoint, startPoint);
    const segmentLength = vNorm(segmentVector);

    if (segmentLength > remainingDistance) {
      const t = remainingDistance / segmentLength;
      return [vAdd(startPoint, vScale(segmentVector, t)), ...path.slice(i)];
    }

    remainingDistance -= segmentLength;
  }
  return [path[path.length - 1]];
}

/** Cuts `distance` off the end of `path`. */
export function cutEnd(path: readonly Vec2[], distance: number): Vec2[] {
  return [...cutStart([...path].reverse(), distance)].reverse();
}

/** Projects `p` onto a polyline; returns closest point, segment vector, and distance. */
export function projectOnPolyline(
  p: Vec2,
  path: readonly Vec2[],
): { point: Vec2; dir: Vec2; dist: number } | null {
  let best: { point: Vec2; dir: Vec2; dist: number } | null = null;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const ab = vSub(b, a);
    const len2 = ab[0] * ab[0] + ab[1] * ab[1];
    if (len2 === 0) continue;
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2),
    );
    const point = vAdd(a, vScale(ab, t));
    const dist = vNorm(vSub(p, point));
    if (best === null || dist < best.dist) {
      best = { point, dir: ab, dist };
    }
  }
  return best;
}

/** Shortest distance from `p` to a polyline (0-length polylines fall back to the vertex). */
export function distanceToPolyline(p: Vec2, path: readonly Vec2[]): number {
  const hit = projectOnPolyline(p, path);
  if (hit !== null) return hit.dist;
  return path.length > 0 ? vNorm(vSub(p, path[0])) : Number.POSITIVE_INFINITY;
}

/** The point at a given arc fraction (clamped to `[0, 1]`) of a polyline. */
export function pointAtFraction(path: readonly Vec2[], fraction: number): Vec2 {
  if (path.length === 0) return [0, 0];
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + vNorm(vSub(path[i], path[i - 1])));
  }
  const total = cum[cum.length - 1];
  if (total <= 0) return path[0];
  const want = Math.min(total, Math.max(0, fraction * total));
  for (let i = 1; i < path.length; i++) {
    if (cum[i] >= want) {
      const span = cum[i] - cum[i - 1];
      const t = span > 0 ? (want - cum[i - 1]) / span : 0;
      return vAdd(path[i - 1], vScale(vSub(path[i], path[i - 1]), t));
    }
  }
  return path[path.length - 1];
}

/**
 * A closed rounded-rectangle (stadium/capsule) ring, centered at `center` with
 * local axes `along`/`across` and half-extents `halfAlong`/`halfAcross`. The
 * corner radius is the smaller half-extent, so a marker much longer in one axis
 * becomes a capsule and a near-square one becomes a rounded square.
 * `stepsPerCorner` arc segments approximate each 90° corner.
 */
export function roundedRectRing(
  center: Vec2,
  along: Vec2,
  across: Vec2,
  halfAlong: number,
  halfAcross: number,
  stepsPerCorner: number,
): Vec2[] {
  const cornerRadius = Math.max(0, Math.min(halfAlong, halfAcross));
  const innerAlong = halfAlong - cornerRadius;
  const innerAcross = halfAcross - cornerRadius;

  const toFrame = (offsetAlong: number, offsetAcross: number): Vec2 =>
    vAdd(
      vAdd(center, vScale(along, offsetAlong)),
      vScale(across, offsetAcross),
    );

  const HALF_PI = Math.PI / 2;
  const corners = [
    { centerU: innerAlong, centerV: innerAcross, startAngle: 0 },
    { centerU: -innerAlong, centerV: innerAcross, startAngle: HALF_PI },
    { centerU: -innerAlong, centerV: -innerAcross, startAngle: Math.PI },
    { centerU: innerAlong, centerV: -innerAcross, startAngle: 3 * HALF_PI },
  ];

  const ring: Vec2[] = [];
  for (const corner of corners) {
    for (let step = 0; step <= stepsPerCorner; step++) {
      const angle = corner.startAngle + (step / stepsPerCorner) * HALF_PI;
      ring.push(
        toFrame(
          corner.centerU + cornerRadius * Math.cos(angle),
          corner.centerV + cornerRadius * Math.sin(angle),
        ),
      );
    }
  }

  ring.push(ring[0]);
  return ring;
}

/**
 * Cubic Bézier sampled into `samples + 1` points.
 *
 * @remarks
 * Frame-agnostic like the rest of the kit: the geographic map draws node inner
 * connections with it in world meters, and the schematic view draws its own in
 * viewBox units. A Bézier is tangent to `p0→p1` at its start and to `p2→p3` at
 * its end, and never leaves the convex hull of the four control points — which
 * is what makes it a safe joint inside a node area.
 */
export function cubicBezier(
  p0: Vec2,
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  samples: number,
): Vec2[] {
  const coordinate = (
    a: number,
    b: number,
    c: number,
    d: number,
    t: number,
    u: number,
  ): number =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  const points: Vec2[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    points.push([
      coordinate(p0[0], p1[0], p2[0], p3[0], t, u),
      coordinate(p0[1], p1[1], p2[1], p3[1], t, u),
    ]);
  }
  return points;
}
