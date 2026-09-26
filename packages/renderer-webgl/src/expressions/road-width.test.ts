import { describe, it, expect } from 'vitest';
import {
  ROAD_WIDTH_EXPR,
  ROAD_CASING_WIDTH_EXPR,
  WORLD_LOCK_ZOOM,
} from './road-width';

// The expressions have the shape:
//   ['interpolate', ['exponential', 2], ['zoom'], z0, out0, z1, out1, ...]
// Each output is a per-feature arithmetic expression, evaluated below.

type Expr = unknown[];
type Props = { fixedWidth: number; scaledWidth: number; worldWidth: number };

function parseStops(expr: Expr): Array<{ zoom: number; out: unknown }> {
  expect(expr[0]).toBe('interpolate');
  expect(expr[1]).toEqual(['exponential', 2]); // geographic-family curve
  expect(expr[2]).toEqual(['zoom']);
  const stops: Array<{ zoom: number; out: unknown }> = [];
  for (let i = 3; i < expr.length; i += 2) {
    stops.push({ zoom: expr[i] as number, out: expr[i + 1] });
  }
  return stops;
}

/** Evaluates the arithmetic subset the width outputs use. */
function evaluate(out: unknown, props: Props): number {
  if (typeof out === 'number') return out;
  const [op, ...args] = out as [string, ...unknown[]];
  if (op === 'get') return props[args[0] as keyof Props];
  const values = args.map((arg) => evaluate(arg, props));
  switch (op) {
    case '+':
      return values.reduce((a, b) => a + b, 0);
    case '*':
      return values.reduce((a, b) => a * b, 1);
    case '-':
      return values[0]! - values[1]!;
    case 'max':
      return Math.max(...values);
    default:
      throw new Error(`unexpected operator ${op}`);
  }
}

/** The tier-weight factor F at a stop: width of a `{0, 1}` cartographic feature. */
const CARTO_UNIT: Props = { fixedWidth: 0, scaledWidth: 1, worldWidth: 0 };
const factorOf = (out: unknown) => evaluate(out, CARTO_UNIT);
/** The casing border at a stop: width of a zero-weight feature. */
const addOf = (out: unknown) =>
  evaluate(out, { fixedWidth: 0, scaledWidth: 0, worldWidth: 0 });

describe('ROAD_WIDTH_EXPR — factor curve', () => {
  const stops = parseStops(ROAD_WIDTH_EXPR as Expr);

  it('is anchored to the previous far-zoom values below z14 (preserves hierarchy)', () => {
    const byZoom = new Map(stops.map((s) => [s.zoom, factorOf(s.out)]));
    expect(byZoom.get(13)).toBeCloseTo(0.85, 5);
    expect(byZoom.get(14)).toBeCloseTo(1.0, 5);
  });

  it('grows geographically (2× per zoom) from z14 upward', () => {
    const byZoom = new Map(stops.map((s) => [s.zoom, factorOf(s.out)]));
    // factor(z) = 2^(z-14): z18 = 16, z22 = 256.
    expect(byZoom.get(18)! / byZoom.get(14)!).toBeCloseTo(2 ** (18 - 14), 5);
    expect(byZoom.get(22)! / byZoom.get(18)!).toBeCloseTo(2 ** (22 - 18), 5);
  });

  it('is strictly monotonic increasing (never freezes / shrinks with zoom)', () => {
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].zoom).toBeGreaterThan(stops[i - 1].zoom);
      expect(factorOf(stops[i].out)).toBeGreaterThan(
        factorOf(stops[i - 1].out),
      );
    }
  });

  it('preserves tier ratios at every stop for cartographic features', () => {
    // With no world width, width is linear in the tier weights, so two tiers
    // keep a constant width ratio at any given zoom.
    for (const s of stops) {
      const local = evaluate(s.out, {
        fixedWidth: 0,
        scaledWidth: 0.8,
        worldWidth: 0,
      });
      const arterial = evaluate(s.out, {
        fixedWidth: 0,
        scaledWidth: 2,
        worldWidth: 0,
      });
      expect(arterial / local).toBeCloseTo(2 / 0.8, 5);
    }
  });
});

describe('ROAD_CASING_WIDTH_EXPR — border', () => {
  const fillStops = parseStops(ROAD_WIDTH_EXPR as Expr);
  const casingStops = parseStops(ROAD_CASING_WIDTH_EXPR as Expr);

  it('matches the fill factor curve exactly (casing tracks fill width)', () => {
    expect(casingStops.map((s) => s.zoom)).toEqual(
      fillStops.map((s) => s.zoom),
    );
    for (let i = 0; i < fillStops.length; i++) {
      expect(
        factorOf(casingStops[i].out) - addOf(casingStops[i].out),
      ).toBeCloseTo(factorOf(fillStops[i].out), 9);
    }
  });

  it('adds a positive, growing-but-bounded border on top of the fill', () => {
    const adds = casingStops.map((s) => addOf(s.out));
    expect(adds.every((a) => a > 0)).toBe(true);
    // Monotonic, and modest at detail zoom (a thin outline, not a second road).
    for (let i = 1; i < adds.length; i++) {
      expect(adds[i]).toBeGreaterThanOrEqual(adds[i - 1]);
    }
    expect(Math.max(...adds)).toBeLessThan(8);
  });
});

describe('world lock at detail zoom', () => {
  const casingStops = parseStops(ROAD_CASING_WIDTH_EXPR as Expr);
  const fillStops = parseStops(ROAD_WIDTH_EXPR as Expr);
  const at = (stops: typeof casingStops, zoom: number) =>
    stops.find((s) => s.zoom === zoom)!.out;
  // A CS1 Small Road: 16 world units kerb to kerb, local tier weights.
  const smallRoad: Props = {
    fixedWidth: 0.2,
    scaledWidth: 0.8,
    worldWidth: 16,
  };

  it('spans the real road width with the casing at z18', () => {
    // 16 units ≈ 16 m; at z18 (512px tiles) ≈ 3.35 px per metre.
    expect(evaluate(at(casingStops, WORLD_LOCK_ZOOM), smallRoad)).toBeCloseTo(
      53.6,
      0,
    );
  });

  it('never draws thinner than the tier weight', () => {
    const skinny: Props = { ...smallRoad, worldWidth: 1 };
    expect(evaluate(at(fillStops, WORLD_LOCK_ZOOM), skinny)).toBeCloseTo(
      0.2 + 0.8 * 16,
      9,
    );
  });

  it('leaves the far zooms on the cartographic weight', () => {
    expect(evaluate(at(fillStops, 14), smallRoad)).toBeCloseTo(1.0, 9);
  });
});
