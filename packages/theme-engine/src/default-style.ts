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
};
