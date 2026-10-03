import { describe, expect, it, vi } from 'vitest';
import { makeCityData, makeRenderStyle } from '@vellum/core/testing';
import type * as maplibregl from 'maplibre-gl';
import {
  LAYER_ID_MAP,
  NON_TRANSIT_OPACITY,
} from '../constants/layer.constants';
import { resolveColors } from '../style-adapter';
import { addRoadsLayer } from './layer-roads';

function recordedRoadLayerIds(): string[] {
  const layers: maplibregl.LayerSpecification[] = [];
  const map = {
    getSource: vi.fn(() => undefined),
    addSource: vi.fn(),
    getLayer: vi.fn(() => undefined),
    addLayer: vi.fn((layer: maplibregl.LayerSpecification) => {
      layers.push(layer);
    }),
  } as unknown as maplibregl.Map;
  addRoadsLayer(map, makeCityData(), resolveColors(makeRenderStyle()));
  return layers.map((layer) => layer.id);
}

// A layer missing from these tables does not hide with the roads layer, does
// not dim under the Transit theme and survives `clearAll` (roads-cablecar did).
describe('addRoadsLayer — every layer is registered', () => {
  it.each(recordedRoadLayerIds())('%s is in LAYER_ID_MAP.roads', (id) => {
    expect(LAYER_ID_MAP.roads).toContain(id);
  });

  it.each(recordedRoadLayerIds())('%s dims with the Transit theme', (id) => {
    expect(NON_TRANSIT_OPACITY).toHaveProperty(id);
  });
});
