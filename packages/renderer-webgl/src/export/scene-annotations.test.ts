import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYER_OPTIONS,
  type CityData,
  type LayerVisibility,
} from '@vellum/core';
import { makeCityData, makeTransitLine } from '@vellum/core/testing';
import { buildSceneAnnotations } from './scene-annotations';
import type { ResolvedColors } from '../style-adapter';

const COLORS = {
  districtLabel: '#222222',
  ferry: '#4080c0',
} as unknown as ResolvedColors;

const ALL_VISIBLE: LayerVisibility = {
  terrain: true,
  basemap: true,
  roads: true,
  transit: true,
  buildings: true,
  forests: true,
  districts: true,
};

function annotate(
  cityData: CityData,
  overrides: Partial<Parameters<typeof buildSceneAnnotations>[0]> = {},
) {
  return buildSceneAnnotations({
    cityData,
    activeLayers: ALL_VISIBLE,
    layerOptions: DEFAULT_LAYER_OPTIONS,
    colors: COLORS,
    background: '#ffffff',
    ...overrides,
  });
}

describe('buildSceneAnnotations — the coverage matrix', () => {
  it('labels districts from their own name and position', () => {
    const city = makeCityData({
      districts: [
        { id: 'd-1', name: 'Centro', position: { x: 100, z: 200 } },
      ] as CityData['districts'],
    });
    const { labels } = annotate(city);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({
      id: 'label-district-d-1',
      layer: 'districts',
      entityId: 'd-1',
      text: 'Centro',
      at: { x: 100, z: 200 },
    });
  });

  it('reports a district with no name instead of inventing one', () => {
    const city = makeCityData({
      districts: [
        { id: 'd-1', name: '   ', position: { x: 0, z: 0 } },
      ] as CityData['districts'],
    });
    const result = annotate(city);
    expect(result.labels).toHaveLength(0);
    expect(result.missingLabelSources).toBe(1);
  });

  it('labels park areas only when the user asked to see them', () => {
    const city = makeCityData({
      parkAreas: [
        {
          id: 'p-1',
          name: 'Parque Norte',
          position: { x: 0, z: 0 },
          parkType: 'Generic',
        },
      ] as unknown as CityData['parkAreas'],
    });
    expect(annotate(city).labels).toHaveLength(0);
    const shown = annotate(city, {
      layerOptions: {
        ...DEFAULT_LAYER_OPTIONS,
        districts: { ...DEFAULT_LAYER_OPTIONS.districts, showParkAreas: true },
      },
    });
    expect(shown.labels.map((label) => label.text)).toEqual(['Parque Norte']);
  });

  it('falls back to a line id, which is real data, not a fabricated name', () => {
    const city = makeCityData({
      transitLines: [
        makeTransitLine({
          id: 'line-7',
          name: '',
          mode: 'Metro',
          stops: [
            { id: 's1', position: { x: 0, y: 0, z: 0 } },
          ] as unknown as never,
        }),
      ],
    });
    const { labels } = annotate(city);
    expect(labels.map((label) => label.text)).toEqual(['line-7']);
  });

  it('never labels roads or buildings — the domain holds no place names', () => {
    const city = makeCityData({
      roadNodes: [
        { id: 'n1', position: { x: 0, y: 0, z: 0 } },
        { id: 'n2', position: { x: 100, y: 0, z: 0 } },
      ],
      buildings: [
        {
          id: 'b-1',
          name: 'Small House 03',
          itemClass: 'Residential Low',
          serviceType: 'None',
          footprint: [
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
            { x: 10, y: 0, z: 10 },
          ],
        },
      ] as unknown as CityData['buildings'],
    });
    const { labels } = annotate(city);
    // 'Small House 03' is an asset id, not a place name; printing it would
    // bury the map in noise and imply information the map does not have.
    expect(labels.filter((label) => label.layer === 'buildings')).toHaveLength(
      0,
    );
    expect(labels.filter((label) => label.layer === 'roads')).toHaveLength(0);
  });

  it('emits nothing for a layer the user switched off', () => {
    const city = makeCityData({
      districts: [
        { id: 'd-1', name: 'Centro', position: { x: 0, z: 0 } },
      ] as CityData['districts'],
    });
    const hidden = annotate(city, {
      activeLayers: { ...ALL_VISIBLE, districts: false },
    });
    expect(hidden.labels).toHaveLength(0);
    // A hidden layer is not a missing source — nothing to warn about.
    expect(hidden.missingLabelSources).toBe(0);
  });
});

describe('buildSceneAnnotations — symbols', () => {
  function cityWithMode(mode: string): CityData {
    return makeCityData({
      transitLines: [
        makeTransitLine({
          id: 'l-1',
          name: 'Línea 1',
          mode: mode as never,
          color: '#ff6600',
          stops: [
            { id: 's1', position: { x: 0, y: 0, z: 0 } },
          ] as unknown as never,
        }),
      ],
    });
  }

  it.each([
    ['Bus', 'transit-bus'],
    ['Tram', 'transit-tram'],
    ['Train', 'transit-train'],
    ['Metro', 'transit-metro'],
    ['CableCar', 'transit-cablecar'],
    ['Monorail', 'transit-monorail'],
    ['Ferry', 'transit-ferry'],
    ['Blimp', 'transit-blimp'],
    ['Trolleybus', 'transit-trolleybus'],
  ])('covers the %s mode with its own catalogue entry', (mode, symbol) => {
    const { symbols, symbolFallbacks } = annotate(cityWithMode(mode));
    expect(symbols.map((instance) => instance.symbol)).toEqual([symbol]);
    expect(symbolFallbacks).toBe(0);
  });

  it('reports a fallback rather than dropping an unknown mode', () => {
    const { symbols, symbolFallbacks } = annotate(cityWithMode('Unknown'));
    expect(symbols.map((instance) => instance.symbol)).toEqual([
      'transit-unknown',
    ]);
    expect(symbolFallbacks).toBe(1);
  });

  it('carries the line colour and its own stable instance identity', () => {
    const { symbols } = annotate(cityWithMode('Bus'));
    expect(symbols[0]).toMatchObject({
      id: 'symbol-transit-l-1',
      entityId: 'l-1',
      color: '#ff6600',
    });
  });

  it('respects the transit mode filter', () => {
    const filtered = annotate(cityWithMode('Bus'), {
      layerOptions: {
        ...DEFAULT_LAYER_OPTIONS,
        transit: { visibleModes: ['Metro'] },
      },
    });
    expect(filtered.symbols).toHaveLength(0);
    expect(filtered.labels).toHaveLength(0);
  });
});

describe('buildSceneAnnotations — typography', () => {
  it('names a font stack and embeds no font file', () => {
    const city = makeCityData({
      districts: [
        { id: 'd-1', name: 'Centro', position: { x: 0, z: 0 } },
      ] as CityData['districts'],
    });
    const style = annotate(city).labels[0]!.style;
    expect(style.fontFamily).toContain('monospace');
    expect(style.fontFamily).not.toContain('url(');
    expect(style.fontFamily).not.toContain('.woff');
  });

  it('omits the halo on a transparent export rather than inventing a colour', () => {
    const city = makeCityData({
      districts: [
        { id: 'd-1', name: 'Centro', position: { x: 0, z: 0 } },
      ] as CityData['districts'],
    });
    const opaque = annotate(city).labels[0]!.style;
    expect(opaque.haloColor).toBe('#ffffff');

    const transparent = annotate(city, { background: null }).labels[0]!.style;
    expect(transparent.haloColor).toBeUndefined();
  });
});
