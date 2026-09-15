import { describe, expect, it } from 'vitest';
import type { RenderStyleParams } from '@vellum/core';
import { resolveColors } from './style-adapter';

/** Minimal but complete `RenderStyleParams` — every field `resolveColors` reads. */
const STYLE: RenderStyleParams = {
  mapBackground: '#ffffff',
  mapFrame: '#000000',
  terrain: { base: '#e8e0d8', low: '#d9e6c3', mid: '#c9b98a', high: '#f2f2f2' },
  contourLine: '#b0a080',
  water: '#a0c8f0',
  forests: '#3f7d3f',
  transitBackground: '#101010',
  roads: {
    highway: { generic: { fill: '#e8a33d', casing: '#b87a1d' } },
    largeArterial: { generic: { fill: '#f5d76e', casing: '#c9a63e' } },
    mediumArterial: { generic: { fill: '#ffffff', casing: '#c0c0c0' } },
    local: {
      generic: { fill: '#ffffff', casing: '#d0d0d0' },
      gravel: { fill: '#e0d8c8', casing: '#b0a890' },
    },
    pedestrian: {
      path: { fill: '#f0e0d0', casing: '#c0b0a0' },
      way: { fill: '#f0e0d0', casing: '#c0b0a0' },
      street: { fill: '#f0e0d0', casing: '#c0b0a0' },
    },
    rail: {
      train: { fill: '#707070', casing: '#404040' },
      metro: { fill: '#8060a0', casing: '#503070' },
    },
    ferry: { fill: '#4080c0', casing: '#4080c0' },
  },
  buildings: {
    residential: {
      low: { fill: '#c8bfb5', stroke: '#a09585' },
      high: { fill: '#c8bfb5', stroke: '#a09585' },
      selfSufficient: { fill: '#c8bfb5', stroke: '#a09585' },
    },
    commercial: {
      low: { fill: '#c8bfb5', stroke: '#a09585' },
      high: { fill: '#c8bfb5', stroke: '#a09585' },
      leisure: { fill: '#c8bfb5', stroke: '#a09585' },
      tourism: { fill: '#c8bfb5', stroke: '#a09585' },
      organic: { fill: '#c8bfb5', stroke: '#a09585' },
    },
    office: {
      generic: { fill: '#c8bfb5', stroke: '#a09585' },
      tech: { fill: '#c8bfb5', stroke: '#a09585' },
      financial: { fill: '#c8bfb5', stroke: '#a09585' },
    },
    industry: {
      generic: { fill: '#c8bfb5', stroke: '#a09585' },
      forestry: { fill: '#c8bfb5', stroke: '#a09585' },
      ore: { fill: '#c8bfb5', stroke: '#a09585' },
      oil: { fill: '#c8bfb5', stroke: '#a09585' },
      farming: { fill: '#c8bfb5', stroke: '#a09585' },
    },
    civic: {
      publicTransport: { fill: '#8888cc', stroke: '#444488' },
      education: { fill: '#cc88cc', stroke: '#884488' },
      services: { fill: '#88cccc', stroke: '#448888' },
    },
    none: { fill: '#c8bfb5', stroke: '#a09585' },
  },
  districts: { fill: '#cc4444', label: '#222222' },
  grid: { color: '#000000', opacity: 0.1, width: 1, dasharray: [2, 2] },
};

describe('resolveColors', () => {
  it('falls back to the built-in transferMarker colors when the theme omits the group', () => {
    const colors = resolveColors(STYLE);
    expect(colors.transferMarker).toEqual({
      fill: '#f2b705',
      stroke: '#8a5a00',
    });
  });

  it('reflects a real theme override of transferMarker, not the built-in default', () => {
    const styleWithOverride: RenderStyleParams = {
      ...STYLE,
      transferMarker: { fill: '#111111', stroke: '#222222' },
    };

    const colors = resolveColors(styleWithOverride);

    expect(colors.transferMarker).toEqual({
      fill: '#111111',
      stroke: '#222222',
    });
    // Not swapped, and not silently ignored in favor of the default.
    expect(colors.transferMarker.fill).not.toBe('#f2b705');
    expect(colors.transferMarker.stroke).not.toBe('#8a5a00');
  });
});
