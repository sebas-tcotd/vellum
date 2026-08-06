// packages/core/src/testing/city-data-factory.ts
// Factories para tests — importar desde '@vellum/core/testing' (nunca desde el barrel principal)
import type {
  Building,
  CityData,
  RoadSegment,
  TransitLine,
} from '../types/city-data';
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
  landPolygon: [],
  coastline: { elevation: 40, lines: [] },
  inlandWaterPolygons: [],
  contourLines: [],
  terrainBands: [],
  terrainDem: {
    dataUri: 'data:image/png;base64,',
    elevMin: 0,
    elevMax: 6400,
  },
  roadNodes: [],
  roadSegments: [],
  transitLines: [],
  buildings: [],
  forestCells: [],
  districts: [],
  parkAreas: [],
};

/**
 * Crea un `CityData` mínimo válido con todos los arrays vacíos.
 * Pasar `overrides` para personalizar campos específicos en cada test.
 */
export function makeCityData(overrides?: Partial<CityData>): CityData {
  return { ...MINIMAL_CITY_DATA, ...overrides };
}

/**
 * Crea un `RoadSegment` con valores predeterminados razonables.
 * Pasar `overrides` para personalizar campos específicos en cada test.
 */
export function makeRoadSegment(overrides?: Partial<RoadSegment>): RoadSegment {
  return {
    id: 'seg-1',
    startNodeId: 'node-1',
    endNodeId: 'node-2',
    points: [],
    wayType: ['Road'],
    itemClass: 'Basic Road',
    width: 16,
    ...overrides,
  };
}

/**
 * Crea un `TransitLine` con valores predeterminados razonables.
 * Pasar `overrides` para personalizar campos específicos en cada test.
 */
export function makeTransitLine(overrides?: Partial<TransitLine>): TransitLine {
  const defined = Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<TransitLine>;
  return {
    id: 'line-1',
    name: 'Test Line',
    mode: 'Bus',
    color: '#FF6600',
    stops: [],
    route: [],
    ...defined,
  };
}

/**
 * Crea un `Building` con valores predeterminados razonables.
 * Pasar `overrides` para personalizar campos específicos en cada test.
 */
export function makeBuilding(overrides?: Partial<Building>): Building {
  return {
    id: 'building-1',
    name: 'Test Building',
    position: { x: 0, y: 60, z: 0 },
    itemClass: 'Low Residential - Level1',
    serviceType: 'ResidentialLow',
    footprint: [
      { x: -10, y: 60, z: -10 },
      { x: 10, y: 60, z: -10 },
      { x: 0, y: 60, z: 10 },
    ],
    ...overrides,
  };
}

/**
 * Crea un `LayerVisibility` con todas las capas visibles por defecto.
 * Pasar `overrides` para ocultar capas específicas en cada test.
 */
export function makeLayerVisibility(
  overrides?: Partial<LayerVisibility>,
): LayerVisibility {
  return {
    ...Object.fromEntries(LAYER_NAMES.map((n) => [n, true])),
    ...overrides,
  } as LayerVisibility;
}
