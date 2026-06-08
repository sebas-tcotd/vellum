/**
 * Design tokens for the WebGL renderer, read from CSS custom properties at
 * construction time.
 *
 * @remarks
 * This is a copy of the equivalent module in `@vellum/renderer-canvas`.
 * Duplication is intentional — `renderer-webgl` must not depend on
 * `renderer-canvas` (peer-adapter coupling violates the dependency graph).
 * TODO (Story 5.x): Extract `RendererTokens` + `readTokensFromDOM` into
 * `@vellum/core` or a shared `@vellum/tokens` package.
 */

/** Theme design tokens consumed by the renderer. */
export interface RendererTokens {
  background: string;
  terrain: string;
  terrainLow: string;
  terrainMid: string;
  terrainHigh: string;
  water: string;
  green: string;
  text: string;
  transitBg: string;
  roadHighway: string;
  roadHighwayCasing: string;
  roadLargeArterial: string;
  roadLargeArterialCasing: string;
  roadMediumArterial: string;
  roadMediumArterialCasing: string;
  roadLocal: string;
  roadLocalCasing: string;
  roadGravel: string;
  roadGravelCasing: string;
  roadPedestrian: string;
  roadPedestrianCasing: string;
  roadPedestrianWay: string;
  roadRailway: string;
  roadRailwayCasing: string;
  buildingFill: string;
  buildingStroke: string;
  districtFill: string;
  districtLabel: string;
  coastlineStroke: string;
}

const FALLBACKS: RendererTokens = {
  background: '#f7f6f1',
  terrain: '#f7f6f1',
  terrainLow: '#95ae79',
  terrainMid: '#deddbe',
  terrainHigh: '#c4a06a',
  water: '#6db8b7',
  green: '#95ae79',
  text: '#333333',
  transitBg: '#1a1a2e',
  roadHighway: '#a098b0',
  roadHighwayCasing: '#7d748e',
  roadLargeArterial: '#d2938e',
  roadLargeArterialCasing: '#b8756e',
  roadMediumArterial: '#d4a882',
  roadMediumArterialCasing: '#b48a69',
  roadLocal: '#e4e1d1',
  roadLocalCasing: '#8a8278',
  roadGravel: '#e0d5c1',
  roadGravelCasing: '#c4b89e',
  roadPedestrian: '#7a6e60',
  roadPedestrianCasing: '#5d5550',
  roadPedestrianWay: '#8b7d6b',
  roadRailway: '#eceff1',
  roadRailwayCasing: '#455a64',
  buildingFill: '#c8bfb5',
  buildingStroke: '#a09585',
  districtFill: '#b4a08c',
  districtLabel: '#ffffff',
  coastlineStroke: '#4a8f8e',
};

/** Reads `RendererTokens` from CSS custom properties on `:root`. Falls back to defaults in non-DOM environments (tests, workers). */
export function readTokensFromDOM(): RendererTokens {
  if (typeof document === 'undefined') return FALLBACKS;
  const style = getComputedStyle(document.documentElement);
  return {
    background:
      style.getPropertyValue('--color-bg').trim() || FALLBACKS.background,
    terrain:
      style.getPropertyValue('--color-terrain').trim() || FALLBACKS.terrain,
    terrainLow:
      style.getPropertyValue('--color-terrain-low').trim() ||
      FALLBACKS.terrainLow,
    terrainMid:
      style.getPropertyValue('--color-terrain-mid').trim() ||
      FALLBACKS.terrainMid,
    terrainHigh:
      style.getPropertyValue('--color-terrain-high').trim() ||
      FALLBACKS.terrainHigh,
    water: style.getPropertyValue('--color-water').trim() || FALLBACKS.water,
    green: style.getPropertyValue('--color-green').trim() || FALLBACKS.green,
    text: style.getPropertyValue('--color-text').trim() || FALLBACKS.text,
    transitBg:
      style.getPropertyValue('--color-transit-bg').trim() ||
      FALLBACKS.transitBg,
    roadHighway:
      style.getPropertyValue('--color-road-highway').trim() ||
      FALLBACKS.roadHighway,
    roadHighwayCasing:
      style.getPropertyValue('--color-road-highway-casing').trim() ||
      FALLBACKS.roadHighwayCasing,
    roadLargeArterial:
      style.getPropertyValue('--color-road-large-arterial').trim() ||
      FALLBACKS.roadLargeArterial,
    roadLargeArterialCasing:
      style.getPropertyValue('--color-road-large-arterial-casing').trim() ||
      FALLBACKS.roadLargeArterialCasing,
    roadMediumArterial:
      style.getPropertyValue('--color-road-medium-arterial').trim() ||
      FALLBACKS.roadMediumArterial,
    roadMediumArterialCasing:
      style.getPropertyValue('--color-road-medium-arterial-casing').trim() ||
      FALLBACKS.roadMediumArterialCasing,
    roadLocal:
      style.getPropertyValue('--color-road-local').trim() ||
      FALLBACKS.roadLocal,
    roadLocalCasing:
      style.getPropertyValue('--color-road-local-casing').trim() ||
      FALLBACKS.roadLocalCasing,
    roadGravel:
      style.getPropertyValue('--color-road-gravel').trim() ||
      FALLBACKS.roadGravel,
    roadGravelCasing:
      style.getPropertyValue('--color-road-gravel-casing').trim() ||
      FALLBACKS.roadGravelCasing,
    roadPedestrian:
      style.getPropertyValue('--color-road-pedestrian').trim() ||
      FALLBACKS.roadPedestrian,
    roadPedestrianCasing:
      style.getPropertyValue('--color-road-pedestrian-casing').trim() ||
      FALLBACKS.roadPedestrianCasing,
    roadPedestrianWay:
      style.getPropertyValue('--color-road-pedestrian-way').trim() ||
      FALLBACKS.roadPedestrianWay,
    roadRailway:
      style.getPropertyValue('--color-road-railway').trim() ||
      FALLBACKS.roadRailway,
    roadRailwayCasing:
      style.getPropertyValue('--color-road-railway-casing').trim() ||
      FALLBACKS.roadRailwayCasing,
    buildingFill:
      style.getPropertyValue('--color-building').trim() ||
      FALLBACKS.buildingFill,
    buildingStroke:
      style.getPropertyValue('--color-building-stroke').trim() ||
      FALLBACKS.buildingStroke,
    districtFill:
      style.getPropertyValue('--color-district-fill').trim() ||
      FALLBACKS.districtFill,
    districtLabel:
      style.getPropertyValue('--color-district-label').trim() ||
      FALLBACKS.districtLabel,
    coastlineStroke:
      style.getPropertyValue('--color-coastline-stroke').trim() ||
      FALLBACKS.coastlineStroke,
  };
}
