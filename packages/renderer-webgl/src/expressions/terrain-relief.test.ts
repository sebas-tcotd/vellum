import { describe, expect, it } from 'vitest';
import type { TerrainDem } from '@vellum/core';
import {
  buildColorReliefRamp,
  buildContourColorRamp,
  resolveElevationColor,
} from './terrain-relief';
import { adjustLightness, mixColorTokens } from './color-mix';

const TERRAIN = {
  low: '#000000',
  mid: '#808080',
  high: '#ffffff',
};

const DEM: TerrainDem = {
  dataUri: 'data:image/png;base64,',
  elevMin: 1000,
  elevMax: 3000,
};

describe('mixColorTokens', () => {
  it('mixes hex tokens component-wise in sRGB', () => {
    expect(mixColorTokens('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColorTokens('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(mixColorTokens('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });

  it('expands three-digit hex', () => {
    expect(mixColorTokens('#f00', '#f00', 0.5)).toBe('#ff0000');
  });

  it('parses the hsl() form the theme contract also admits', () => {
    // hsl(0, 100%, 50%) is pure red; hsl(120, 100%, 50%) pure green.
    expect(mixColorTokens('hsl(0, 100%, 50%)', 'hsl(0, 100%, 50%)', 0.5)).toBe(
      '#ff0000',
    );
    expect(
      mixColorTokens('hsl(120, 100%, 50%)', 'hsl(120, 100%, 50%)', 0),
    ).toBe('#00ff00');
    expect(mixColorTokens('hsl(0, 0%, 100%)', 'hsl(0, 0%, 0%)', 0.5)).toBe(
      '#808080',
    );
  });

  it('clamps t and survives a non-finite ratio', () => {
    expect(mixColorTokens('#000000', '#ffffff', -5)).toBe('#000000');
    expect(mixColorTokens('#000000', '#ffffff', 5)).toBe('#ffffff');
    expect(mixColorTokens('#000000', '#ffffff', Number.NaN)).toBe('#000000');
  });

  it('falls back to the start colour rather than guessing an unknown form', () => {
    // Never invent a colour the theme did not specify.
    expect(mixColorTokens('#123456', 'rebeccapurple', 0.5)).toBe('#123456');
    expect(mixColorTokens('var(--x)', '#ffffff', 0.5)).toBe('var(--x)');
  });
});

describe('adjustLightness', () => {
  it('darkens a light colour and lightens a dark one', () => {
    expect(adjustLightness('#ffffff', 0.3)).toBe(
      mixColorTokens('#ffffff', '#000000', 0.3),
    );
    expect(adjustLightness('#000000', 0.3)).toBe(
      mixColorTokens('#000000', '#ffffff', 0.3),
    );
  });

  it('picks direction from the colour itself, never a caller hint', () => {
    // Same amount, opposite colours: the two results must differ, proving
    // the direction is derived from `color`, not hardcoded.
    const light = adjustLightness('#eeeeee', 0.3);
    const dark = adjustLightness('#111111', 0.3);
    expect(light).not.toBe(dark);
    expect(light < '#eeeeee').toBe(true);
    expect(dark > '#111111').toBe(true);
  });

  it('clamps the amount and survives a non-finite one', () => {
    expect(adjustLightness('#ffffff', 5)).toBe('#000000');
    expect(adjustLightness('#ffffff', -5)).toBe('#ffffff');
    expect(adjustLightness('#ffffff', Number.NaN)).toBe('#ffffff');
  });

  it('keeps an unparseable token unchanged', () => {
    expect(adjustLightness('var(--terrain)', 0.3)).toBe('var(--terrain)');
  });
});

describe('resolveElevationColor', () => {
  it('lands on the theme anchors at the ends and the midpoint of the domain', () => {
    expect(resolveElevationColor(TERRAIN, DEM, 1000)).toBe(TERRAIN.low);
    expect(resolveElevationColor(TERRAIN, DEM, 2000)).toBe('#808080');
    expect(resolveElevationColor(TERRAIN, DEM, 3000)).toBe(TERRAIN.high);
  });

  it('interpolates linearly within each half of the ramp', () => {
    // Quarter of the way up the domain: halfway between low and mid.
    expect(resolveElevationColor(TERRAIN, DEM, 1500)).toBe('#404040');
    // Three quarters up: halfway between mid (0x80) and high (0xff) —
    // 128 + 127/2 = 191.5, which rounds to 192.
    expect(resolveElevationColor(TERRAIN, DEM, 2500)).toBe('#c0c0c0');
  });

  it('clamps outside the measured dry-land range', () => {
    expect(resolveElevationColor(TERRAIN, DEM, -9999)).toBe(TERRAIN.low);
    expect(resolveElevationColor(TERRAIN, DEM, 99999)).toBe(TERRAIN.high);
    expect(resolveElevationColor(TERRAIN, DEM, Number.NaN)).toBe(TERRAIN.low);
  });

  it('never divides by zero on a perfectly flat map', () => {
    // `MIN_DOMAIN_RAW` widens a degenerate domain; without it every contour
    // would resolve to NaN and emit an unparseable colour.
    const flat: TerrainDem = { ...DEM, elevMin: 500, elevMax: 500 };
    const color = resolveElevationColor(TERRAIN, flat, 500);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('follows the active theme rather than a hardcoded palette', () => {
    const warm = { low: '#004400', mid: '#cc9900', high: '#ffffff' };
    expect(resolveElevationColor(warm, DEM, 1000)).toBe('#004400');
    expect(resolveElevationColor(warm, DEM, 2000)).toBe('#cc9900');
  });
});

describe('buildContourColorRamp', () => {
  it('drives the ramp off each isolines own elevation property', () => {
    const ramp = buildContourColorRamp(TERRAIN, DEM) as unknown[];
    expect(ramp[0]).toBe('interpolate');
    expect(ramp[1]).toEqual(['linear']);
    // `['get','elevation']`, not `['elevation']`: the raster relief reads the
    // decoded DEM value, a line feature carries its altitude as a property.
    expect(ramp[2]).toEqual(['get', 'elevation']);
  });

  it('shares the relief ramps domain and elevation break points', () => {
    const contour = buildContourColorRamp(TERRAIN, DEM) as unknown[];
    const relief = buildColorReliefRamp(TERRAIN, DEM) as unknown[];
    // Drop the relief's leading transparent sentinel stop, which a line
    // feature has no edge to fade at; the elevations at which each ramp
    // changes anchor must still line up exactly.
    expect([contour[3], contour[5], contour[7]]).toEqual([
      relief[5],
      relief[7],
      relief[9],
    ]);
    expect([contour[3], contour[5], contour[7]]).toEqual([1000, 2000, 3000]);
  });

  it('adjusts every anchor away from the raw relief colour, not toward it', () => {
    // The bug this replaced: an isoline painted in exactly the relief's own
    // colour has 1:1 contrast against it by construction and vanishes into
    // the terrain on screen.
    const contour = buildContourColorRamp(TERRAIN, DEM) as unknown[];
    expect(contour[4]).toBe(adjustLightness(TERRAIN.low, 0.3));
    expect(contour[6]).toBe(adjustLightness(TERRAIN.mid, 0.3));
    expect(contour[8]).toBe(adjustLightness(TERRAIN.high, 0.3));
    expect(contour[4]).not.toBe(TERRAIN.low);
    expect(contour[6]).not.toBe(TERRAIN.mid);
    expect(contour[8]).not.toBe(TERRAIN.high);
  });

  it('leaves the SVG export literal resolver on the raw, unadjusted ramp', () => {
    // The interactive map and the export are allowed to diverge here on
    // purpose: a static document has no antialiased blending to correct for,
    // so a contour matching its terrain colour exactly is the correct answer
    // there, not a bug.
    const ramp = buildContourColorRamp(TERRAIN, DEM) as unknown[];
    expect(ramp[4]).not.toBe(resolveElevationColor(TERRAIN, DEM, 1000));
    expect(resolveElevationColor(TERRAIN, DEM, 1000)).toBe(TERRAIN.low);
    expect(resolveElevationColor(TERRAIN, DEM, 2000)).toBe(TERRAIN.mid);
    expect(resolveElevationColor(TERRAIN, DEM, 3000)).toBe(TERRAIN.high);
  });

  it('darkens a light theme and lightens a dark one, without naming either theme', () => {
    // Direction comes from each colour's own brightness — never a
    // theme-identity special case, which would silently do nothing for a
    // third-party theme.
    const day = buildContourColorRamp(
      { low: '#9fd17a', mid: '#e4dfc9', high: '#c9ad7f' },
      DEM,
    ) as string[];
    // Day's anchors are all light; darkening reduces every channel.
    expect(day[4]! < '#9fd17a').toBe(true);

    const transit = buildContourColorRamp(
      { low: '#16213e', mid: '#1e2a45', high: '#26324f' },
      DEM,
    ) as string[];
    // Transit's anchors are all near-black; lightening raises the channels,
    // so the adjusted hex sorts after the original.
    expect(transit[4]! > '#16213e').toBe(true);
  });

  it('stays visible even when a theme flattens the relief to one colour', () => {
    // Grayscale sets terrain.low === mid === high === white: the relief
    // itself carries no elevation information to begin with, so every
    // contour legitimately becomes the same colour. What must still hold is
    // that colour differs from the white land fill it sits on.
    const flat = buildContourColorRamp(
      { low: '#ffffff', mid: '#ffffff', high: '#ffffff' },
      DEM,
    ) as string[];
    expect(flat[4]).toBe(flat[6]);
    expect(flat[6]).toBe(flat[8]);
    expect(flat[4]).not.toBe('#ffffff');
  });

  it('widens a degenerate domain instead of emitting duplicate stops', () => {
    const flat = buildContourColorRamp(TERRAIN, {
      ...DEM,
      elevMin: 500,
      elevMax: 500,
    }) as number[];
    // Duplicate stops make MapLibre reject the whole expression.
    expect(flat[3]).toBeLessThan(flat[5] as number);
    expect(flat[5]).toBeLessThan(flat[7] as number);
  });
});
