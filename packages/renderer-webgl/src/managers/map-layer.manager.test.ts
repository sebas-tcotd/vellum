import { describe, expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';
import { DEFAULT_LAYER_OPTIONS } from '@vellum/core';
import { makeRenderStyle } from '@vellum/core/testing';
import { resolveColors } from '../style-adapter';
import { MapLayerManager } from './map-layer.manager';

vi.mock('../layers/layer-forests', () => ({ retintForests: vi.fn() }));

describe('forest sublayer visibility', () => {
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    'reconciles circles=%s heatmap=%s through global visibility and theme',
    async (showCircles, showHeatmap) => {
      const map = {
        getLayer: vi.fn(() => ({})),
        setLayoutProperty: vi.fn(),
        setPaintProperty: vi.fn(),
        setFilter: vi.fn(),
        moveLayer: vi.fn(),
      };
      const manager = new MapLayerManager(
        map as unknown as Map,
        resolveColors(makeRenderStyle()),
      );
      const options = {
        ...DEFAULT_LAYER_OPTIONS,
        forests: { showCircles, showHeatmap },
      };
      const visibility = (id: string) =>
        map.setLayoutProperty.mock.calls
          .filter(([layer]) => layer === id)
          .at(-1)?.[2];
      const check = (global: boolean) => {
        expect(visibility('forests-trees')).toBe(
          global && showCircles ? 'visible' : 'none',
        );
        expect(visibility('forests-canopy')).toBe(
          global && showHeatmap ? 'visible' : 'none',
        );
      };
      manager.setOptions(options);
      check(true);
      manager.setVisibility('forests', false);
      manager.setOptions(options);
      check(false);
      await manager.applyTheme(options);
      check(false);
      manager.setVisibility('forests', true);
      check(true);
    },
  );
});
