import { describe, expect, it, vi } from 'vitest';
import { SLOT_M } from '@vellum/core';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import type * as maplibregl from 'maplibre-gl';
import type { ResolvedColors } from '../style-adapter';
import { addTransitLayers } from './layer-transit';

const TEST_COLORS: Pick<ResolvedColors, 'transferMarker'> = {
  transferMarker: { fill: '#f2b705', stroke: '#8a5a00' },
};

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
  it('preserva cinco sources y seis layers en el z-order vigente', () => {
    const recorder = recordingMap();

    addTransitLayers(recorder.map, transitCity(), TEST_COLORS);

    expect(recorder.sources.map(([id]) => id)).toEqual([
      'transit',
      'transit-connectors',
      'transit-stops',
      'transit-stops-dots',
      'transit-transfer-markers',
    ]);
    expect(recorder.layers.map(({ id }) => id)).toEqual([
      'transit-connector',
      'transit-line',
      'transit-stops',
      'transit-stops-outline',
      'transit-stops-dot',
      'transit-transfer-marker',
    ]);
  });

  it('mantiene el offset GPU calibrado con el SLOT_M canónico', () => {
    const recorder = recordingMap();
    addTransitLayers(recorder.map, transitCity(), TEST_COLORS);

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
    addTransitLayers(recorder.map, transitCity(), TEST_COLORS);

    expect(recorder.sources).toHaveLength(5);
    expect(recorder.layers).toHaveLength(6);
    expect(recorder.sources.every(([id]) => id.startsWith('transit'))).toBe(
      true,
    );
    expect(recorder.layers.every(({ id }) => id.startsWith('transit'))).toBe(
      true,
    );
  });
});

describe('addTransitLayers — marcador de transferencia confirmada', () => {
  function twoLineStopCity() {
    return makeCityData({
      roadNodes: [
        { id: 'a', position: { x: 0, y: 0, z: 0 } },
        { id: 'b', position: { x: 500, y: 0, z: 0 } },
      ],
      roadSegments: [
        makeRoadSegment({ id: 's', startNodeId: 'a', endNodeId: 'b' }),
      ],
      transitLines: [
        makeTransitLine({
          id: 'A',
          route: [{ segmentIds: ['s'] }],
          stops: [
            {
              id: 'stop-a',
              mode: 'Bus',
              position: { x: 0, y: 0, z: 0 },
              name: '',
            },
          ],
        }),
        makeTransitLine({
          id: 'B',
          route: [{ segmentIds: ['s'] }],
          stops: [
            {
              id: 'stop-b',
              mode: 'Bus',
              position: { x: 5, y: 0, z: 0 },
              name: '',
            },
          ],
        }),
      ],
    });
  }

  it('solo incluye transferencias confirmadas (≥2 líneas) en el source dedicado', () => {
    const recorder = recordingMap();
    addTransitLayers(recorder.map, twoLineStopCity(), TEST_COLORS);

    const [, source] = recorder.sources.find(
      ([id]) => id === 'transit-transfer-markers',
    )!;
    const data = (source as { data: { features: unknown[] } }).data;
    expect(data.features).toHaveLength(1);
  });

  it('no produce marcadores de transferencia cuando ninguna parada es compartida', () => {
    const recorder = recordingMap();
    addTransitLayers(recorder.map, transitCity(), TEST_COLORS);

    const [, source] = recorder.sources.find(
      ([id]) => id === 'transit-transfer-markers',
    )!;
    const data = (source as { data: { features: unknown[] } }).data;
    expect(data.features).toHaveLength(0);
  });

  it('pinta el marcador con los colores del tema', () => {
    const recorder = recordingMap();
    addTransitLayers(recorder.map, twoLineStopCity(), TEST_COLORS);

    const marker = recorder.layers.find(
      ({ id }) => id === 'transit-transfer-marker',
    ) as maplibregl.CircleLayerSpecification;
    expect(marker.paint?.['circle-color']).toBe(
      TEST_COLORS.transferMarker.fill,
    );
    expect(marker.paint?.['circle-stroke-color']).toBe(
      TEST_COLORS.transferMarker.stroke,
    );
  });
});
