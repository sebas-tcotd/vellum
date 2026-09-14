import { describe, expect, it, vi } from 'vitest';
import { SLOT_M } from '@vellum/core';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import type * as maplibregl from 'maplibre-gl';
import { addTransitLayers } from './layer-transit';

function transitCity() {
  return makeCityData({
    roadNodes: [
      { id: 'a', position: { x: 0, y: 0, z: 0 } },
      { id: 'b', position: { x: 100, y: 0, z: 0 } },
    ],
    roadSegments: [
      makeRoadSegment({ id: 's', startNodeId: 'a', endNodeId: 'b' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'line',
        route: [{ segmentIds: ['s'] }],
        stops: [
          {
            id: 'stop',
            mode: 'Bus',
            position: { x: 50, y: 0, z: 0 },
            name: 'Stop',
          },
        ],
      }),
    ],
  });
}

function recordingMap() {
  const sources: Array<[string, maplibregl.SourceSpecification]> = [];
  const layers: maplibregl.LayerSpecification[] = [];
  const map = {
    getSource: vi.fn(() => undefined),
    addSource: vi.fn((id: string, source: maplibregl.SourceSpecification) => {
      sources.push([id, source]);
    }),
    getLayer: vi.fn(() => undefined),
    addLayer: vi.fn((layer: maplibregl.LayerSpecification) => {
      layers.push(layer);
    }),
  } as unknown as maplibregl.Map;
  return { map, sources, layers };
}

describe('addTransitLayers — contrato MapLibre', () => {
  it('preserva cuatro sources y cinco layers en el z-order vigente', () => {
    const recorder = recordingMap();

    addTransitLayers(recorder.map, transitCity());

    expect(recorder.sources.map(([id]) => id)).toEqual([
      'transit',
      'transit-connectors',
      'transit-stops',
      'transit-stops-dots',
    ]);
    expect(recorder.layers.map(({ id }) => id)).toEqual([
      'transit-connector',
      'transit-line',
      'transit-stops',
      'transit-stops-outline',
      'transit-stops-dot',
    ]);
  });

  it('mantiene el offset GPU calibrado con el SLOT_M canónico', () => {
    const recorder = recordingMap();
    addTransitLayers(recorder.map, transitCity());

    const line = recorder.layers.find(({ id }) => id === 'transit-line');
    expect(line?.type).toBe('line');
    const offset = (line as maplibregl.LineLayerSpecification).paint?.[
      'line-offset'
    ];
    const pxPerMeterAtZ13 = (512 * 8192) / 40075016.686;
    expect(offset).toEqual([
      'interpolate',
      ['exponential', 2],
      ['zoom'],
      13,
      ['*', ['get', 'offsetIdx'], SLOT_M * pxPerMeterAtZ13],
      18,
      ['*', ['get', 'offsetIdx'], SLOT_M * pxPerMeterAtZ13 * 2 ** 5],
    ]);
  });

  it('no registra sources ni layers ajenos a tránsito', () => {
    const recorder = recordingMap();
    addTransitLayers(recorder.map, transitCity());

    expect(recorder.sources).toHaveLength(4);
    expect(recorder.layers).toHaveLength(5);
    expect(recorder.sources.every(([id]) => id.startsWith('transit'))).toBe(
      true,
    );
    expect(recorder.layers.every(({ id }) => id.startsWith('transit'))).toBe(
      true,
    );
  });
});
