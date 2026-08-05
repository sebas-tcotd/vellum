import { describe, expect, it } from 'vitest';
import type { TerrainDem } from '@vellum/core';
import { resolveElevationColor } from './terrain-relief';
import { mixColorTokens } from './color-mix';

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
