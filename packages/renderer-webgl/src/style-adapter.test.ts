import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { makeCityData } from '@vellum/core/testing';
import { buildDistrictAreasGeoJson } from './geojson/builders/environment.builder';
import { districtFillColor } from './layers/layer-area-boundaries';
import { TRANSIT_DIM_FACTOR } from './constants/layer.constants';
import { DEFAULT_LAYER_OPTIONS } from '@vellum/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { MapLayerManager } from './managers/map-layer.manager';
import { describe, expect, it, vi } from 'vitest';
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

it('resolves specialization variants from each theme independently of building RICO colors', () => {
  const theme = structuredClone(STYLE);
  theme.buildings.industry.forestry.fill = '#123456';
  theme.buildings.office.tech.fill = '#654321';
  const colors = resolveColors(theme);
  expect(colors.districtSpecialization['industry.forestry']).toBe('#123456');
  expect(colors.districtSpecialization['office.tech']).toBe('#654321');
  expect(colors.districtSpecialization.neutral).toBe(theme.districts.fill);
  expect(
    resolveColors(STYLE).districtSpecialization['industry.forestry'],
  ).not.toBe('#123456');
});

it('toggles specialization paint independently of fill and selection without rebuilding geometry', () => {
  const map = {
    getLayer: vi.fn(() => ({})),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn(),
    setFilter: vi.fn(),
  };
  const manager = new MapLayerManager(
    map as unknown as MapLibreMap,
    resolveColors(STYLE),
  );
  manager.setVisibility('districts', true);
  manager.setSelectedDistrict('selected');
  const options = {
    ...DEFAULT_LAYER_OPTIONS,
    districts: {
      ...DEFAULT_LAYER_OPTIONS.districts,
      colorBySpecialization: true,
    },
  };
  manager.setOptions(options);
  expect(map.setLayoutProperty).toHaveBeenCalledWith(
    'district-fill',
    'visibility',
    'visible',
  );
  expect(map.setPaintProperty).toHaveBeenCalledWith(
    'district-fill',
    'fill-color',
    expect.arrayContaining(['match']),
  );
  expect(map.setFilter).toHaveBeenLastCalledWith('district-selected-outline', [
    '==',
    ['get', 'id'],
    'selected',
  ]);
  expect(options.districts.showFill).toBe(false);
  manager.setVisibility('districts', false);
  expect(map.setLayoutProperty).toHaveBeenCalledWith(
    'district-fill',
    'visibility',
    'none',
  );
  manager.setVisibility('districts', true);
  manager.setOptions(DEFAULT_LAYER_OPTIONS);
  expect(map.setPaintProperty).toHaveBeenCalledWith(
    'district-fill',
    'fill-color',
    STYLE.districts.fill,
  );
  expect(map.setLayoutProperty).toHaveBeenCalledWith(
    'district-selected',
    'visibility',
    'visible',
  );
});

it('evaluates live fill expressions against generated district properties', () => {
  const theme = structuredClone(STYLE);
  theme.buildings.industry.forestry.fill = '#123456';
  theme.buildings.office.tech.fill = '#654321';
  const city = makeCityData({
    source: 'vellummap',
    districts: [['Forest'], ['Hightech'], ['Forest', 'Future']].map(
      (specializations, index) => ({
        id: String(index),
        name: String(index),
        position: { x: 0, y: 0, z: 0 },
        specializations,
        boundary: [
          {
            exterior: [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
            holes: [],
          },
        ],
      }),
    ),
  });
  const expression = createExpression(
    districtFillColor(resolveColors(theme), true),
    'fill-color',
  );
  expect(expression.result).toBe('success');
  if (expression.result !== 'success')
    throw new Error('Invalid district expression');
  const colors = buildDistrictAreasGeoJson(city).features.map((feature) =>
    expression.value.evaluate(
      { zoom: 12 },
      { type: 3, properties: feature.properties },
    ),
  );
  expect(colors).toEqual(['#123456', '#654321', theme.districts.fill]);
});
it('applies a new theme to active specialization without rebuilding or losing selection and dimming', async () => {
  const paints = new Map<string, unknown>();
  const map = {
    getLayer: vi.fn(() => ({})),
    getSource: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    setLayoutProperty: vi.fn(),
    setPaintProperty: vi.fn((id: string, property: string, value: unknown) =>
      paints.set(`${id}:${property}`, value),
    ),
    setFilter: vi.fn(),
  };
  const manager = new MapLayerManager(
    map as unknown as MapLibreMap,
    resolveColors(STYLE),
  );
  const options = {
    ...DEFAULT_LAYER_OPTIONS,
    districts: {
      ...DEFAULT_LAYER_OPTIONS.districts,
      colorBySpecialization: true,
    },
  };
  manager.setVisibility('districts', true);
  manager.setOptions(options);
  manager.setSelectedDistrict('selected');
  manager.setTransitDimming(true);
  const theme = structuredClone(STYLE);
  theme.buildings.industry.forestry.fill = '#123456';
  manager.updateColors(resolveColors(theme));
  await manager.applyTheme(options);
  expect(paints.get('district-fill:fill-color')).toEqual(
    districtFillColor(resolveColors(theme), true),
  );
  expect(paints.get('district-fill:fill-opacity')).toEqual([
    '*',
    0.5,
    TRANSIT_DIM_FACTOR,
  ]);
  expect(map.setFilter).toHaveBeenCalledWith('district-selected', [
    '==',
    ['get', 'id'],
    'selected',
  ]);
  expect(map.setLayoutProperty).toHaveBeenCalledWith(
    'district-selected',
    'visibility',
    'visible',
  );
  expect(map.addSource).not.toHaveBeenCalled();
  expect(map.addLayer).not.toHaveBeenCalled();
  manager.setTransitDimming(false);
  expect(paints.get('district-fill:fill-opacity')).toBe(0.5);
});
