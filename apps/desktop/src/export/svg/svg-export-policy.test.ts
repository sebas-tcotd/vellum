import { describe, expect, it } from 'vitest';
import {
  resolveRoadWidthPx,
  roadWidthFactorAtZoom,
} from '@vellum/renderer-webgl';
import {
  DEFAULT_LOCAL_ROAD_WIDTH_PX,
  LOCAL_ROAD_WIDTH_STYLE,
  resolveSvgExportPolicy,
} from './svg-export-policy';

/** `ROAD_WIDTH_STYLES` — duplicated here only so a drift in it fails loudly. */
const TIERS = {
  highway: { fixed: 0.3, scaled: 3.0 },
  largeArterial: { fixed: 0.3, scaled: 2.0 },
  mediumArterial: { fixed: 0.3, scaled: 1.5 },
  local: { fixed: 0.2, scaled: 0.8 },
  pedestrianWay: { fixed: 0.1, scaled: 0.3 },
} as const;

describe('resolveSvgExportPolicy', () => {
  it('calibrates the factor so a local road resolves to exactly the requested width', () => {
    const policy = resolveSvgExportPolicy({
      outputWidth: 4000,
      worldSpanX: 17280,
    });
    expect(policy.localRoadWidthPx).toBe(DEFAULT_LOCAL_ROAD_WIDTH_PX);
    // (6 - 0.2) / 0.8
    expect(policy.roadWidthFactor).toBeCloseTo(7.25, 10);
    // Round-trips through the shared width model, not a special case.
    expect(
      resolveRoadWidthPx(
        LOCAL_ROAD_WIDTH_STYLE.fixed,
        LOCAL_ROAD_WIDTH_STYLE.scaled,
        policy.roadWidthFactor,
      ),
    ).toBeCloseTo(DEFAULT_LOCAL_ROAD_WIDTH_PX, 10);
  });

  it('derives every other tier from its own fixed/scaled pair, preserving the hierarchy', () => {
    const { roadWidthFactor } = resolveSvgExportPolicy({
      outputWidth: 4000,
      worldSpanX: 17280,
    });
    const widths = Object.fromEntries(
      Object.entries(TIERS).map(([tier, style]) => [
        tier,
        resolveRoadWidthPx(style.fixed, style.scaled, roadWidthFactor),
      ]),
    );
    expect(widths.highway).toBeGreaterThan(widths.largeArterial!);
    expect(widths.largeArterial).toBeGreaterThan(widths.mediumArterial!);
    expect(widths.mediumArterial).toBeGreaterThan(widths.local!);
    expect(widths.local).toBeGreaterThan(widths.pedestrianWay!);
    // A highway is 3.0/0.8 of a local road's *scaled* weight — not a hand-picked
    // multiple of the calibrated 6px.
    expect((widths.highway! - 0.3) / (widths.local! - 0.2)).toBeCloseTo(
      3.0 / 0.8,
      10,
    );
  });

  it('honours an explicit calibration override', () => {
    const policy = resolveSvgExportPolicy({
      outputWidth: 1000,
      worldSpanX: 1000,
      localRoadWidthPx: 10,
    });
    expect(
      resolveRoadWidthPx(
        LOCAL_ROAD_WIDTH_STYLE.fixed,
        LOCAL_ROAD_WIDTH_STYLE.scaled,
        policy.roadWidthFactor,
      ),
    ).toBeCloseTo(10, 10);
  });

  it('keeps the geometric scale independent of the road-width policy', () => {
    const wide = resolveSvgExportPolicy({
      outputWidth: 8000,
      worldSpanX: 17280,
    });
    const narrow = resolveSvgExportPolicy({
      outputWidth: 1000,
      worldSpanX: 17280,
    });
    // Doubling the document changes pixels-per-world-unit and nothing else:
    // road weight is stylistic and must not ride the geometric scale.
    expect(wide.pixelsPerWorldUnit).toBeCloseTo(8000 / 17280, 10);
    expect(narrow.pixelsPerWorldUnit).toBeCloseTo(1000 / 17280, 10);
    expect(wide.roadWidthFactor).toBe(narrow.roadWidthFactor);
  });

  it('reports a zero geometric scale for a degenerate extent instead of Infinity', () => {
    const policy = resolveSvgExportPolicy({ outputWidth: 500, worldSpanX: 0 });
    expect(policy.pixelsPerWorldUnit).toBe(0);
  });
});

describe('road-width curve parity with the MapLibre expression', () => {
  /**
   * Independent implementation of the style-spec's `['exponential', b]`
   * interpolation, written from the formula rather than from the module under
   * test — otherwise this would only prove the code agrees with itself.
   */
  function expectedFactor(zoom: number): number {
    const stops: [number, number][] = [
      [11, 0.55],
      [13, 0.85],
      [14, 1.0],
      [18, 16],
      [22, 256],
    ];
    if (zoom <= stops[0]![0]) return stops[0]![1];
    if (zoom >= stops[stops.length - 1]![0]) return stops[stops.length - 1]![1];
    for (let i = 1; i < stops.length; i += 1) {
      const [lowZoom, lowFactor] = stops[i - 1]!;
      const [highZoom, highFactor] = stops[i]!;
      if (zoom > highZoom) continue;
      const t =
        (Math.pow(2, zoom - lowZoom) - 1) /
        (Math.pow(2, highZoom - lowZoom) - 1);
      return lowFactor + t * (highFactor - lowFactor);
    }
    return stops[stops.length - 1]![1];
  }

  it('matches the expression the GPU would evaluate at every stop and between them', () => {
    for (const zoom of [8, 11, 12, 13, 13.5, 14, 15.75, 18, 20, 22, 24]) {
      expect(roadWidthFactorAtZoom(zoom)).toBeCloseTo(expectedFactor(zoom), 10);
    }
  });

  it('resolves the same width MapLibre would paint, since the output is affine in the factor', () => {
    // MapLibre interpolates the *outputs* (`fixed + scaled × f`), not the
    // factor. Interpolating the factor first is equivalent only because the
    // output is affine in it — this pins that equivalence numerically.
    const zoom = 15.3;
    const { fixed, scaled } = TIERS.highway;
    const lowOut = fixed + scaled * 1.0;
    const highOut = fixed + scaled * 16;
    const t = (Math.pow(2, zoom - 14) - 1) / (Math.pow(2, 18 - 14) - 1);
    const maplibreWidth = lowOut + t * (highOut - lowOut);

    expect(
      resolveRoadWidthPx(fixed, scaled, roadWidthFactorAtZoom(zoom)),
    ).toBeCloseTo(maplibreWidth, 10);
  });

  it('clamps outside the stop range rather than extrapolating', () => {
    expect(roadWidthFactorAtZoom(-5)).toBe(0.55);
    expect(roadWidthFactorAtZoom(99)).toBe(256);
    expect(roadWidthFactorAtZoom(Number.NaN)).toBe(0.55);
  });
});
