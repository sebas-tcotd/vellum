import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import { makeCityData } from '@vellum/core/testing';
import { addAreaBoundariesLayer } from './layer-area-boundaries';
import type { ResolvedColors } from '../style-adapter';

describe('addAreaBoundariesLayer', () => {
  it('adds the selection tint over the district areas, matching nothing yet', () => {
    const addLayer = vi.fn();
    const map = {
      getSource: () => undefined,
      getLayer: () => undefined,
      addSource: vi.fn(),
      addLayer,
    } as unknown as maplibregl.Map;
    const park = '#2e7d32';
    const colors = {
      districtFill: '#8a6d3b',
      districtLabel: '#3b2f1e',
      parkAreas: {
        generic: park,
        university: park,
        tradeSchool: park,
        industry: park,
        forestry: park,
      },
    } as unknown as ResolvedColors;

    addAreaBoundariesLayer(map, makeCityData(), colors);

    const ids = addLayer.mock.calls.map(([layer]) => layer.id);
    expect(ids).toContain('district-selected');
    // Drawn above the optional fill, below the dashed outline.
    expect(ids.indexOf('district-selected')).toBeGreaterThan(
      ids.indexOf('district-fill'),
    );
    expect(ids.indexOf('district-selected')).toBeLessThan(
      ids.indexOf('district-boundaries'),
    );
    const layer = addLayer.mock.calls.find(
      ([l]) => l.id === 'district-selected',
    )![0];
    expect(layer).toMatchObject({
      type: 'fill',
      source: 'district-areas',
      filter: ['boolean', false],
      layout: { visibility: 'none' },
      paint: { 'fill-color': colors.districtFill },
    });
  });
});
