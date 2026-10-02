import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYER_OPTIONS, hasAdvancedOptions } from './layer';

describe('road layer options', () => {
  it('starts with railways and ferries visible and flights hidden', () => {
    expect(DEFAULT_LAYER_OPTIONS.roads).toEqual({
      showStreetNames: true,
      showRailways: true,
      showFlights: false,
      showFerries: true,
    });
  });
  it.each(['vellummap', 'cslmap'] as const)(
    'offers the roads panel for %s',
    (source) => {
      expect(hasAdvancedOptions('roads', source)).toBe(true);
    },
  );
});

describe('forest layer options', () => {
  it('preserves both existing representations by default', () => {
    expect(DEFAULT_LAYER_OPTIONS.forests).toEqual({
      showCircles: true,
      showHeatmap: true,
    });
  });
  it.each(['vellummap', 'cslmap'] as const)(
    'offers the forest panel for %s',
    (source) => {
      expect(hasAdvancedOptions('forests', source)).toBe(true);
    },
  );
});
