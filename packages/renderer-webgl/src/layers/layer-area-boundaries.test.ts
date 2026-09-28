import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import { addDistrictSelectionLayers } from './layer-area-boundaries';
import type { ResolvedColors } from '../style-adapter';

describe('addDistrictSelectionLayers', () => {
  const colors = { districtFill: '#8a6d3b' } as unknown as ResolvedColors;

  it('adds the tint and an accent dashed outline, matching nothing yet', () => {
    const addLayer = vi.fn();
    const map = {
      getSource: () => ({}),
      getLayer: () => undefined,
      addLayer,
    } as unknown as maplibregl.Map;

    addDistrictSelectionLayers(map, colors);

    const [tint, outline] = addLayer.mock.calls.map(([layer]) => layer);
    expect(tint).toMatchObject({
      id: 'district-selected',
      type: 'fill',
      source: 'district-areas',
      filter: ['boolean', false],
      layout: { visibility: 'none' },
      paint: { 'fill-color': colors.districtFill },
    });
    expect(outline).toMatchObject({
      id: 'district-selected-outline',
      type: 'line',
      source: 'district-areas',
      filter: ['boolean', false],
      paint: { 'line-dasharray': [3, 2] },
    });
  });

  it('adds nothing without district areas', () => {
    const addLayer = vi.fn();
    const map = {
      getSource: () => undefined,
      addLayer,
    } as unknown as maplibregl.Map;
    addDistrictSelectionLayers(map, colors);
    expect(addLayer).not.toHaveBeenCalled();
  });
});
