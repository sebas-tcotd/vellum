import { describe, expect, it } from 'vitest';
import { CS1_LAT_SIGN } from '../../coordinate-transform';
import { rightOf } from '../render-geometry/utils/vector';
import type { SchematicPoint } from './contract';
import {
  MITER_LIMIT,
  offsetPolyline,
  offsetTowards,
  turnAngle,
} from './offset';
import { toPlane } from './grid-layout';

const at = (x: number, y: number): SchematicPoint => ({ x, y });

/** Distance from `p` to the closest point of a polyline. */
function distanceTo(
  p: SchematicPoint,
  path: readonly SchematicPoint[],
): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
          );
    best = Math.min(
      best,
      Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)),
    );
  }
  return best;
}

describe('offsetTowards', () => {
  it('points at the same hand as the map, on a frame whose y grows down', () => {
    // The calibration this whole module hinges on. `rightOf` is defined in the
    // map frame ({x, z}, z north); `toPlane` mirrors that frame vertically. So
    // the plane's own offset direction must be the mirrored image of the map's,
    // for every direction — not just for the axis-aligned ones.
    for (let deg = 0; deg < 360; deg += 15) {
      const radians = (deg * Math.PI) / 180;
      const world = { x: Math.cos(radians), z: Math.sin(radians) };
      const mirrored = toPlane(rightOf(world));
      const ours = offsetTowards(toPlane(world));
      expect(ours.x).toBeCloseTo(mirrored.x, 12);
      expect(ours.y).toBeCloseTo(mirrored.y, 12);
    }
  });

  it('puts a positive offset visually right of travel on screen', () => {
    // Travelling right across the screen, "right of travel" is downwards, and in
    // SVG downwards is +y. Stated separately from the mirror identity above so a
    // sign flip in `toPlane` and `rightOf` at once could not cancel out.
    expect(CS1_LAT_SIGN).toBe(1);
    const hand = offsetTowards(at(1, 0));
    expect(hand.x).toBeCloseTo(0, 12);
    expect(hand.y).toBeCloseTo(1, 12);
  });
});

describe('offsetPolyline', () => {
  it('moves a straight run sideways by exactly the distance', () => {
    const offset = offsetPolyline([at(0, 0), at(100, 0)], 6);
    expect(offset).toEqual([
      { x: 0, y: 6 },
      { x: 100, y: 6 },
    ]);
  });

  it('does not care which way the centerline is written down', () => {
    // Reversing the path flips the travel direction, and so the hand a positive
    // offset points at; negating the distance flips it back. The result must be
    // the very same stroke, read backwards — otherwise the two ends of a corridor
    // would disagree about which side its slots are on.
    const line = [at(0, 0), at(50, 50), at(100, 50), at(100, 200)];
    const forward = offsetPolyline(line, 6);
    const backward = offsetPolyline([...line].reverse(), -6).reverse();
    expect(forward).toHaveLength(backward.length);
    forward.forEach((p, i) => {
      expect(p.x).toBeCloseTo(backward[i].x, 9);
      expect(p.y).toBeCloseTo(backward[i].y, 9);
    });
  });

  it('hands back the centerline unchanged at distance zero', () => {
    const line = [at(0, 0), at(10, 10), at(20, 0)];
    expect(offsetPolyline(line, 0)).toEqual(line);
  });

  it.each([
    ['45°', at(100, 100)],
    ['90°', at(100, 0)],
  ])(
    'keeps a %s elbow a single mitered vertex at the right distance',
    (_name, corner) => {
      const line = [at(0, 0), corner, at(corner.x, corner.y + 100)];
      const offset = offsetPolyline(line, 6);
      // One point in, one per elbow, one out: the miter did not bevel.
      expect(offset).toHaveLength(3);
      // The join is where both offset lines meet, so it stays exactly 6 away
      // from the centerline it came from.
      expect(distanceTo(offset[1], line)).toBeCloseTo(6, 9);
    },
  );

  it('bevels a 180° reversal instead of reaching for an infinite miter', () => {
    // Out and straight back: the two offset lines are parallel and never meet,
    // so a miter would be at infinity. Two finite points are the only answer.
    const line = [at(0, 0), at(100, 0), at(0, 0)];
    const offset = offsetPolyline(line, 6);
    expect(offset).toHaveLength(4);
    for (const p of offset) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(distanceTo(p, line)).toBeLessThanOrEqual(6 + 1e-9);
    }
  });

  it('never reaches further than the miter limit allows', () => {
    // Sweep the whole range of turns, including the ones sharper than the limit.
    for (let deg = 5; deg <= 355; deg += 5) {
      const radians = (deg * Math.PI) / 180;
      const line = [
        at(-100, 0),
        at(0, 0),
        at(100 * Math.cos(radians), 100 * Math.sin(radians)),
      ];
      for (const p of offsetPolyline(line, 6)) {
        expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(
          100 + MITER_LIMIT * 6 + 1e-6,
        );
      }
    }
  });

  it('ignores degenerate repeated vertices instead of producing NaN', () => {
    const offset = offsetPolyline(
      [at(0, 0), at(0, 0), at(100, 0), at(100, 0)],
      6,
    );
    expect(offset).toEqual([
      { x: 0, y: 6 },
      { x: 100, y: 6 },
    ]);
  });

  it('returns a single-vertex path untouched rather than dropping the stroke', () => {
    expect(offsetPolyline([at(5, 5), at(5, 5)], 6)).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
  });

  it('keeps two different slots of one corridor a slot apart', () => {
    const line = [at(0, 0), at(100, 0), at(100, 100)];
    const a = offsetPolyline(line, -3);
    const b = offsetPolyline(line, 3);
    // Neither stroke ever comes within a stroke width of the other: that is what
    // "no line is hidden under another" means, measured.
    for (const p of a) expect(distanceTo(p, b)).toBeGreaterThan(4);
    for (const p of b) expect(distanceTo(p, a)).toBeGreaterThan(4);
  });
});

describe('turnAngle', () => {
  it.each([
    ['straight ahead', at(2, 0), 0],
    ['a 45° bend', at(1, 1), Math.PI / 4],
    ['a 45° bend the other way', at(1, -1), -Math.PI / 4],
    ['a 90° bend', at(0, 1), Math.PI / 2],
    ['a full reversal', at(-2, 0), Math.PI],
  ] as const)('measures %s', (_name, after, expected) => {
    expect(Math.abs(turnAngle(at(-1, 0), at(0, 0), after))).toBeCloseTo(
      Math.abs(expected),
      9,
    );
  });
});
