// packages/core/src/testing/marginalia-factory.ts
// Factories de marginalia para tests — importar desde '@vellum/core/testing'
import type { RoadCategoryColors, RenderStyleParams } from '../types/theme';
import {
  DEFAULT_LAYER_OPTIONS,
  LAYER_NAMES,
  type LayerVisibility,
} from '../types/layer';
import type {
  ExportPresentationOptions,
  ExportPreviewSnapshot,
  MarginaliaCountTemplate,
  MarginaliaLabels,
} from '../types/export-presentation';

/**
 * Crea opciones de presentación con todo apagado, autor vacío y esquina
 * `bottom-left`. Pasar `overrides` para activar bloques concretos.
 */
export function makePresentationOptions(
  overrides?: Partial<ExportPresentationOptions>,
): ExportPresentationOptions {
  return {
    showCityName: false,
    showRoadLegend: false,
    showTransitLegend: false,
    showElevationLegend: false,
    showScaleBar: false,
    showOrientation: false,
    showSummary: false,
    showSourceNote: false,
    author: '',
    corner: 'bottom-left',
    ...overrides,
  };
}

function count(noun: string): MarginaliaCountTemplate {
  return { one: `{count} ${noun}`, other: `{count} ${noun}s` };
}

/** Crea textos de marginalia en inglés, resueltos como los resolvería la UI. */
export function makeMarginaliaLabels(
  overrides?: Partial<MarginaliaLabels>,
): MarginaliaLabels {
  return {
    roadLegendTitle: 'Roads',
    roadTiers: {
      highway: 'Highway',
      train: 'Train track',
      metro: 'Metro track',
      largeArterial: 'Large road',
      mediumArterial: 'Medium road',
      local: 'Local road',
      gravel: 'Gravel road',
      pedestrian: 'Path',
      pedestrianStreet: 'Pedestrian street',
      pedestrianWay: 'Footway',
    },
    transitLegendTitle: 'Transit',
    transitModes: {
      Bus: 'Bus',
      Tram: 'Tram',
      Train: 'Train',
      Metro: 'Metro',
      CableCar: 'Cable car',
      Monorail: 'Monorail',
      Ferry: 'Ferry',
      Blimp: 'Blimp',
      Trolleybus: 'Trolleybus',
      Unknown: 'Other',
    },
    transitMore: { one: '+{count} line', other: '+{count} lines' },
    elevationLegendTitle: 'Elevation',
    summary: {
      roads: count('road'),
      buildings: count('building'),
      districts: count('district'),
      parks: count('park'),
      lines: count('line'),
      stops: count('stop'),
    },
    sourceDate: 'Jan 1, 2026',
    sourceStatement:
      'Cities: Skylines data; local coordinates without geographic projection',
    north: 'N',
    thousandsSeparator: ',',
    ...overrides,
  };
}

function road(fill: string, casing: string): RoadCategoryColors {
  return {
    fill: fill as `#${string}`,
    casing: casing as `#${string}`,
  };
}

function building(fill: string) {
  return {
    fill: fill as `#${string}`,
    stroke: '#a09585' as `#${string}`,
  };
}

/** Crea un `RenderStyleParams` completo y verosímil para tests de export. */
export function makeRenderStyle(
  overrides?: Partial<RenderStyleParams>,
): RenderStyleParams {
  const b = building('#c8bfb5');
  return {
    mapBackground: '#f7f6f1',
    mapFrame: '#3b3a36',
    terrain: {
      base: '#f7f6f1',
      low: '#95ae79',
      mid: '#deddbe',
      high: '#c4a06a',
    },
    contourLine: '#000000',
    water: '#6db8b7',
    forests: '#14592a',
    transitBackground: '#1a1a2e',
    roads: {
      highway: { generic: road('#a098b0', '#7d748e') },
      largeArterial: { generic: road('#d2938e', '#b8756e') },
      mediumArterial: { generic: road('#d4a882', '#b48a69') },
      local: {
        generic: road('#e4e1d1', '#8a8278'),
        gravel: road('#e0d5c1', '#c4b89e'),
      },
      pedestrian: {
        path: road('#7a6e60', '#5d5550'),
        way: road('#8b7d6b', '#8b7d6b'),
        street: road('#7a6e60', '#5d5550'),
      },
      rail: {
        train: road('#eceff1', '#455a64'),
        metro: road('#eceff2', '#455a65'),
      },
      ferry: road('#1a5276', '#1a5276'),
    },
    buildings: {
      residential: { low: b, high: b, selfSufficient: b },
      commercial: { low: b, high: b, leisure: b, tourism: b, organic: b },
      office: { generic: b, tech: b, financial: b },
      industry: { generic: b, forestry: b, ore: b, oil: b, farming: b },
      civic: { publicTransport: b, education: b, services: b },
      none: b,
    },
    districts: { fill: '#b4a08c', label: '#222222' },
    grid: { color: '#555555', opacity: 0.25, width: 1, dasharray: [4, 4] },
    ...overrides,
  };
}

/**
 * Crea un `ExportPreviewSnapshot` verosímil: viewport 640×480 norte arriba,
 * sin pitch, todas las capas visibles.
 */
export function makeExportPreviewSnapshot(
  overrides?: Partial<ExportPreviewSnapshot>,
): ExportPreviewSnapshot {
  return {
    dataUrl: 'data:image/png;base64,viewport',
    width: 640,
    height: 480,
    viewportSurface: { width: 640, height: 480 },
    bearingDegrees: 0,
    liveBearingDegrees: 0,
    livePitchDegrees: 0,
    viewportWorldUnitsPerPixel: 4,
    style: makeRenderStyle(),
    activeLayers: Object.fromEntries(
      LAYER_NAMES.map((layer) => [layer, true]),
    ) as LayerVisibility,
    layerOptions: DEFAULT_LAYER_OPTIONS,
    ...overrides,
  };
}
