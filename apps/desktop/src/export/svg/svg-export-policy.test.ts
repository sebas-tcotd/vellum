import { describe, expect, it } from 'vitest';
import {
  resolveRoadWidthPx,
  roadCasingAddPxAtZoom,
  roadWidthFactorAtZoom,
} from '@vellum/renderer-webgl';
import {
  DEFAULT_LOCAL_ROAD_WIDTH_PX,
  LOCAL_ROAD_WIDTH_STYLE,
  resolveSvgExportPolicy,
  SvgExportPolicyError,
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
  // A full CS1 map (17280 world units) exported at these widths.
  const FULL_MAP = 17280;

  it('derives the road factor from the document density, matching the live map', () => {
    const policy = resolveSvgExportPolicy({
      outputWidth: 6000,
      worldSpanX: FULL_MAP,
    });
    // The document covers 17280 units in 6000px; the factor must be exactly
    // what the GPU would paint at the zoom that renders at that density.
    expect(policy.roadWidthFactor).toBeCloseTo(
      roadWidthFactorAtZoom(policy.equivalentZoom),
      10,
    );
    expect(
      resolveRoadWidthPx(
        LOCAL_ROAD_WIDTH_STYLE.fixed,
        LOCAL_ROAD_WIDTH_STYLE.scaled,
        policy.roadWidthFactor,
      ),
    ).toBeCloseTo(policy.localRoadWidthPx, 10);
  });

  it('scales road weight with the document, instead of pinning it to one width', () => {
    // The bug this replaced: a fixed 6px local road read as motorway-thick on
    // a small document and as a hairline on a huge one.
    const widths = [1000, 6000, 16000, 20000].map(
      (outputWidth) =>
        resolveSvgExportPolicy({ outputWidth, worldSpanX: FULL_MAP })
          .localRoadWidthPx,
    );
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
    }
  });

  it('gives a zoomed-in viewport heavier roads than a whole-island one', () => {
    // Same output surface, different world span: this is exactly the
    // difference between exporting three blocks and exporting the map.
    const blocks = resolveSvgExportPolicy({
      outputWidth: 1600,
      worldSpanX: 400,
    });
    const island = resolveSvgExportPolicy({
      outputWidth: 1600,
      worldSpanX: FULL_MAP,
    });
    expect(blocks.localRoadWidthPx).toBeGreaterThan(island.localRoadWidthPx);
    expect(blocks.equivalentZoom).toBeGreaterThan(island.equivalentZoom);
  });

  it('still honours a pinned width through the shared width model', () => {
    const policy = resolveSvgExportPolicy({
      outputWidth: 1000,
      worldSpanX: FULL_MAP,
      localRoadWidthPx: DEFAULT_LOCAL_ROAD_WIDTH_PX,
    });
    expect(
      resolveRoadWidthPx(
        LOCAL_ROAD_WIDTH_STYLE.fixed,
        LOCAL_ROAD_WIDTH_STYLE.scaled,
        policy.roadWidthFactor,
      ),
    ).toBeCloseTo(DEFAULT_LOCAL_ROAD_WIDTH_PX, 10);
    // (6 - 0.2) / 0.8
    expect(policy.roadWidthFactor).toBeCloseTo(7.25, 10);
  });

  it('derives every other tier from its own fixed/scaled pair, preserving the hierarchy', () => {
    const { roadWidthFactor } = resolveSvgExportPolicy({
      outputWidth: 6000,
      worldSpanX: FULL_MAP,
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
    // A highway is 3.0/0.8 of a local road's *scaled* weight — not a
    // hand-picked multiple of the local road's resolved width.
    expect((widths.highway! - 0.3) / (widths.local! - 0.2)).toBeCloseTo(
      3.0 / 0.8,
      10,
    );
  });

  it('keeps the geometric scale reported separately from the road weight', () => {
    const policy = resolveSvgExportPolicy({
      outputWidth: 8000,
      worldSpanX: FULL_MAP,
    });
    expect(policy.pixelsPerWorldUnit).toBeCloseTo(8000 / FULL_MAP, 10);
    // Pinning the road weight must not disturb the geometric scale.
    const pinned = resolveSvgExportPolicy({
      outputWidth: 8000,
      worldSpanX: FULL_MAP,
      localRoadWidthPx: 3,
    });
    expect(pinned.pixelsPerWorldUnit).toBe(policy.pixelsPerWorldUnit);
    expect(pinned.roadWidthFactor).not.toBe(policy.roadWidthFactor);
  });

  it('rejects a pinned width that could not produce a usable stroke', () => {
    for (const localRoadWidthPx of [
      0,
      -3,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() =>
        resolveSvgExportPolicy({
          outputWidth: 1000,
          worldSpanX: 17280,
          localRoadWidthPx,
        }),
      ).toThrow(SvgExportPolicyError);
    }
  });

  it('resolves the casing border off the same zoom curve as the fill', () => {
    const policy = resolveSvgExportPolicy({
      outputWidth: 6000,
      worldSpanX: 17280,
    });
    expect(policy.roadCasingAddPx).toBeCloseTo(
      roadCasingAddPxAtZoom(policy.equivalentZoom),
      10,
    );
    // A larger document sits at a higher zoom, so the border grows with it
    // instead of being a fixed fraction of the fill.
    const larger = resolveSvgExportPolicy({
      outputWidth: 20000,
      worldSpanX: 17280,
    });
    expect(larger.roadCasingAddPx).toBeGreaterThan(policy.roadCasingAddPx);
  });

  it('reports a zero geometric scale for a degenerate extent instead of Infinity', () => {
    const policy = resolveSvgExportPolicy({ outputWidth: 500, worldSpanX: 0 });
    expect(policy.pixelsPerWorldUnit).toBe(0);
    expect(Number.isFinite(policy.roadWidthFactor)).toBe(true);
    expect(Number.isFinite(policy.localRoadWidthPx)).toBe(true);
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
