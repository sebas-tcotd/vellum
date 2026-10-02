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
