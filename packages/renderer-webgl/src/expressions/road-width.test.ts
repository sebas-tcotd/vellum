import { describe, it, expect } from 'vitest';
import { ROAD_WIDTH_EXPR, ROAD_CASING_WIDTH_EXPR } from './road-width';

// The expressions have the shape:
//   ['interpolate', ['exponential', 2], ['zoom'], z0, out0, z1, out1, ...]
// where each output is ['+', ['get','fixedWidth'], ['*', ['get','scaledWidth'], F] (, ADD?)].

type Expr = unknown[];

function parseStops(expr: Expr): Array<{ zoom: number; out: Expr }> {
  expect(expr[0]).toBe('interpolate');
  expect(expr[1]).toEqual(['exponential', 2]); // geographic-family curve
  expect(expr[2]).toEqual(['zoom']);
  const stops: Array<{ zoom: number; out: Expr }> = [];
  for (let i = 3; i < expr.length; i += 2) {
    stops.push({ zoom: expr[i] as number, out: expr[i + 1] as Expr });
  }
  return stops;
}

/** Extracts the scaledWidth factor F from ['+', get fixed, ['*', get scaled, F], add?]. */
function factorOf(out: Expr): number {
  const mul = out[2] as Expr; // ['*', ['get','scaledWidth'], F]
  expect(mul[0]).toBe('*');
  expect(mul[1]).toEqual(['get', 'scaledWidth']);
  return mul[2] as number;
}

/** Extracts the casing additive (4th term), or 0 if absent. */
function addOf(out: Expr): number {
  return typeof out[3] === 'number' ? out[3] : 0;
}

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

  it('preserves tier ratios at every stop (factor is tier-independent)', () => {
    // The factor multiplies scaledWidth, which carries the hierarchy; so two
    // tiers keep a constant width ratio at any given zoom. Verified indirectly:
    // every stop's output references scaledWidth linearly with no per-tier term.
    for (const s of stops) {
      expect(s.out[1] as Expr).toEqual(['get', 'fixedWidth']);
      expect((s.out[2] as Expr)[1]).toEqual(['get', 'scaledWidth']);
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
      expect(factorOf(casingStops[i].out)).toBe(factorOf(fillStops[i].out));
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
