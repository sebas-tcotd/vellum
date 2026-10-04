import type { RenderStyleParams, RoadCategoryColors } from '@vellum/core';

function road(fill: string, casing: string): RoadCategoryColors {
  return { fill: fill as `#${string}`, casing: casing as `#${string}` };
}

const BUILDING_DEFAULT = { fill: '#c8bfb5', stroke: '#a09585' } as const;

/**
 * Interim default theme, applied until Story 5.1 wires up `.vellumstyle`
 * loading and the built-in "Day" theme (Story 5.2). Values match the previous
 * hardcoded `RendererTokens` fallbacks exactly — no visual change from this story.
 * @remarks
 * Buildings use a single flat color across every zoning category (matches the
 * pre-Story-5.0 renderer, which had no per-category building coloring).
 */
export const DEFAULT_RENDER_STYLE_PARAMS: RenderStyleParams = {
  mapBackground: '#f7f6f1',
  mapFrame: '#f5f0e6',
  terrain: {
    base: '#f7f6f1',
    low: '#95ae79',
    mid: '#deddbe',
    high: '#c4a06a',
  },
  water: '#6db8b7',
  coastline: '#4c8180',
  contourLine: '#000000',
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
      metro: road('#eceff1', '#e4572e'),
    },
    ferry: road('#1A5276', '#1A5276'),
  },
  buildings: {
    residential: {
      low: BUILDING_DEFAULT,
      high: BUILDING_DEFAULT,
      selfSufficient: BUILDING_DEFAULT,
    },
    commercial: {
      low: BUILDING_DEFAULT,
      high: BUILDING_DEFAULT,
      leisure: BUILDING_DEFAULT,
      tourism: BUILDING_DEFAULT,
      organic: BUILDING_DEFAULT,
    },
    office: {
      generic: BUILDING_DEFAULT,
      tech: BUILDING_DEFAULT,
      financial: BUILDING_DEFAULT,
    },
    industry: {
      generic: BUILDING_DEFAULT,
      forestry: BUILDING_DEFAULT,
      ore: BUILDING_DEFAULT,
      oil: BUILDING_DEFAULT,
      farming: BUILDING_DEFAULT,
    },
    civic: {
      publicTransport: BUILDING_DEFAULT,
      education: BUILDING_DEFAULT,
      services: BUILDING_DEFAULT,
    },
    none: BUILDING_DEFAULT,
  },
  districts: { fill: '#b4a08c', label: '#ffffff' },
  grid: { color: '#555555', opacity: 0.25, width: 1, dasharray: [4, 4] },
  parkAreas: {
    generic: '#95ae79',
    university: '#c4a06a',
    tradeSchool: '#d2938e',
    industry: '#a098b0',
    forestry: '#14592a',
  },
  transferMarker: {
    fill: '#f2b705',
    stroke: '#8a5a00',
  },
  roadLabels: {
    color: '#3d3a35',
  },
};

/**
 * Keys the loader never fills from the defaults: when a theme omits one, the renderer
 * derives it from the theme's own colors (`coastline` from `water`), so a fixed default
 * would only ever be wrong. They stay in {@link DEFAULT_RENDER_STYLE_PARAMS} so the
 * emitted JSON Schema documents them.
 */
export const DERIVED_WHEN_OMITTED = ['coastline'] as const;

/**
 * The defaults without the {@link DERIVED_WHEN_OMITTED} keys the given theme omits:
 * what the loader fills in and what the validator requires of that theme.
 */
export function defaultsFor(
  theme: Record<string, unknown>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = { ...DEFAULT_RENDER_STYLE_PARAMS };
  for (const key of DERIVED_WHEN_OMITTED) {
    if (theme[key] === undefined) delete defaults[key];
  }
  return defaults;
}
