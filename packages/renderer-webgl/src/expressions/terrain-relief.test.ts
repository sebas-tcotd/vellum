import { describe, expect, it } from 'vitest';
import type { TerrainDem } from '@vellum/core';
import { buildContourColorRamp, resolveElevationColor } from './terrain-relief';
import { adjustColorForContrast, mixColorTokens } from './color-mix';

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

function rgbChannels(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    return [0, 2, 4].map((offset) =>
      Number.parseInt(hex[1]!.slice(offset, offset + 2), 16),
    ) as [number, number, number];
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),/.exec(color);
  if (!rgba) throw new Error(`Unsupported test colour: ${color}`);
  return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
}

function testLuminance(color: string): number {
  const linear = rgbChannels(color).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function testContrast(first: string, second: string): number {
  const values = [testLuminance(first), testLuminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

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

describe('adjustColorForContrast', () => {
  it('darkens and lightens by the minimum discrete amount needed for 3:1', () => {
    const darkened = adjustColorForContrast('#ffffff', '#202020', 3);
    const lightened = adjustColorForContrast('#16213e', '#4a4a56', 3);

    expect(darkened).toBe('#949494');
    expect(testContrast(darkened, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(testLuminance(darkened)).toBeLessThan(testLuminance('#ffffff'));
    expect(testContrast(lightened, '#16213e')).toBeGreaterThanOrEqual(3);
    expect(testLuminance(lightened)).toBeGreaterThan(testLuminance('#16213e'));
  });

  it('falls back to the opposite direction when the hint cannot reach the target', () => {
    const adjusted = adjustColorForContrast('#fefefe', '#ffffff', 3);
    expect(testLuminance(adjusted)).toBeLessThan(testLuminance('#fefefe'));
    expect(testContrast(adjusted, '#fefefe')).toBeGreaterThanOrEqual(3);
  });

  it('preserves hex and hsl alpha instead of making the line opaque', () => {
    const hex = adjustColorForContrast('#ffffff80', '#000000', 3);
    const hsl = adjustColorForContrast('hsl(0 0% 100% / 50%)', '#000000', 3);
    const permissiveHsl = adjustColorForContrast(
      'hsl(0 0% 100% 25%)',
      '#000000',
      3,
    );
    expect(hex).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5019607843137255\)$/);
    expect(hsl).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5\)$/);
    expect(permissiveHsl).toMatch(/^rgba\(\d+, \d+, \d+, 0\.25\)$/);
  });

  it('keeps an unparseable token unchanged', () => {
    expect(adjustColorForContrast('var(--terrain)', '#000000', 3)).toBe(
      'var(--terrain)',
    );
  });

  it('bounds HSL channels and handles invalid contrast requests safely', () => {
    const bounded = adjustColorForContrast(
      'hsl(0 200% 200% / 50%)',
      '#000000',
      3,
    );
    expect(rgbChannels(bounded).every((channel) => channel <= 255)).toBe(true);
    expect(adjustColorForContrast('#123456', '#ffffff', 1)).toBe('#123456');
    expect(adjustColorForContrast('#123456', '#ffffff', Number.NaN)).toBe(
      '#123456',
    );
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
  const CONTOUR_LINE = '#202020';
  const ELEVATIONS = [1000, 1500, 2000, 2500, 3000];

  function matchedColors(expression: unknown[]): Map<number, string> {
    const matches = new Map<number, string>();
    for (let index = 2; index < expression.length - 1; index += 2) {
      matches.set(expression[index] as number, expression[index + 1] as string);
    }
    return matches;
  }

  it('drives the ramp off each isolines own elevation property', () => {
    const ramp = buildContourColorRamp(
      TERRAIN,
      CONTOUR_LINE,
      DEM,
      ELEVATIONS,
    ) as unknown[];
    expect(ramp[0]).toBe('match');
    // `['get','elevation']`, not `['elevation']`: the raster relief reads the
    // decoded DEM value, a line feature carries its altitude as a property.
    expect(ramp[1]).toEqual(['get', 'elevation']);
  });

  it('contrasts every real isoline elevation, including values between anchors', () => {
    const ramp = buildContourColorRamp(
      TERRAIN,
      CONTOUR_LINE,
      DEM,
      ELEVATIONS,
    ) as unknown[];
    const matches = matchedColors(ramp);
    for (const elevation of ELEVATIONS) {
      const terrainColor = resolveElevationColor(TERRAIN, DEM, elevation);
      expect(
        testContrast(matches.get(elevation)!, terrainColor),
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it.each([
    ['Day', { low: '#9fd17a', mid: '#e4dfc9', high: '#c9ad7f' }, '#8c8c8c'],
    [
      'Grayscale',
      { low: '#ffffff', mid: '#ffffff', high: '#ffffff' },
      '#dcdcdc',
    ],
    ['Transit', { low: '#16213e', mid: '#1e2a45', high: '#26324f' }, '#4a4a56'],
  ])(
    'keeps every sampled %s isoline at 3:1 or better',
    (_name, terrain, contourLine) => {
      const ramp = buildContourColorRamp(
        terrain,
        contourLine,
        DEM,
        ELEVATIONS,
      ) as unknown[];
      const matches = matchedColors(ramp);
      for (const elevation of ELEVATIONS) {
        const terrainColor = resolveElevationColor(terrain, DEM, elevation);
        expect(
          testContrast(matches.get(elevation)!, terrainColor),
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it('preserves interpolated alpha on a non-anchor isoline', () => {
    const alphaTerrain = {
      low: '#ffffff80',
      mid: '#80808040',
      high: '#00000020',
    };
    const ramp = buildContourColorRamp(
      alphaTerrain,
      '#202020',
      DEM,
      [1500],
    ) as unknown[];
    expect(matchedColors(ramp).get(1500)).toMatch(
      /^rgba\(\d+, \d+, \d+, 0\.3764705882352941\)$/,
    );
  });

  it('keeps the SVG resolver on the unadjusted theme ramp', () => {
    const ramp = buildContourColorRamp(
      TERRAIN,
      CONTOUR_LINE,
      DEM,
      ELEVATIONS,
    ) as unknown[];
    expect(matchedColors(ramp).get(1000)).not.toBe(
      resolveElevationColor(TERRAIN, DEM, 1000),
    );
    expect(resolveElevationColor(TERRAIN, DEM, 1000)).toBe(TERRAIN.low);
    expect(resolveElevationColor(TERRAIN, DEM, 2000)).toBe(TERRAIN.mid);
    expect(resolveElevationColor(TERRAIN, DEM, 3000)).toBe(TERRAIN.high);
  });

  it('widens a degenerate domain instead of emitting duplicate stops', () => {
    const flat = buildContourColorRamp(
      TERRAIN,
      CONTOUR_LINE,
      { ...DEM, elevMin: 500, elevMax: 500 },
      [564, 500, 500, Number.NaN],
    ) as unknown[];
    expect([...matchedColors(flat).keys()]).toEqual([500, 564]);
  });
});
