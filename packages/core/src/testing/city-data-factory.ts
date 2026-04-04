// packages/core/src/testing/city-data-factory.ts
// Factories para tests — importar desde '@vellum/core/testing' (nunca desde el barrel principal)
import type { CityData, RoadSegment } from '../types/city-data';
import type { LayerVisibility } from '../types/layer';
import { LAYER_NAMES } from '../types/layer';

const DEFAULT_BOUNDS = {
  minX: -8640,
  maxX: 8640,
  minZ: -8640,
  maxZ: 8640,
  seaLevel: 40,
};

const MINIMAL_CITY_DATA: CityData = {
  cityName: 'Test City',
  fileName: 'test-city.cslmap',
  generatedAt: '2026-01-01T00:00:00Z',
  bounds: DEFAULT_BOUNDS,
  landTiles: [],
  waterTiles: [],
  roadNodes: [],
  roadSegments: [],
  transitLines: [],
  buildings: [],
  forestCells: [],
  districts: [],
};

export function makeCityData(overrides?: Partial<CityData>): CityData {
  return { ...MINIMAL_CITY_DATA, ...overrides };
}

export function makeRoadSegment(overrides?: Partial<RoadSegment>): RoadSegment {
  return {
    id: 'seg-1',
    startNodeId: 'node-1',
    endNodeId: 'node-2',
    wayType: ['Road'],
    itemClass: 'Basic Road',
    width: 16,
    ...overrides,
  };
}

export function makeLayerVisibility(overrides?: Partial<LayerVisibility>): LayerVisibility {
  return {
    ...Object.fromEntries(LAYER_NAMES.map((n) => [n, true])),
    ...overrides,
  } as LayerVisibility;
}
