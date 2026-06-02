export interface RendererTokens {
  terrain: string; // --color-terrain (base plano / zona más alta)
  terrainLow: string; // --color-terrain-low (vegetación costera/llanos)
  terrainMid: string; // --color-terrain-mid (agricultura/transición)
  terrainHigh: string; // --color-terrain-high (tierras altas/áridas)
  water: string; // --color-water
  green: string; // --color-green
  text: string; // --color-text
  transitBg: string; // --color-transit-bg

  // Road fills — OSM Humanitarian palette (ajustado para contraste con terreno CS1)
  roadHighway: string; // --color-road-highway
  roadHighwayCasing: string; // --color-road-highway-casing
  roadLargeArterial: string; // --color-road-large-arterial
  roadLargeArterialCasing: string; // --color-road-large-arterial-casing
  roadMediumArterial: string; // --color-road-medium-arterial
  roadLocal: string; // --color-road-local
  roadLocalCasing: string; // --color-road-local-casing
  roadGravel: string; // --color-road-gravel
  roadGravelCasing: string; // --color-road-gravel-casing
  roadPedestrian: string; // --color-road-pedestrian
  roadPedestrianCasing: string; // --color-road-pedestrian-casing
  roadPedestrianWay: string; // --color-road-pedestrian-way
  roadRailway: string; // --color-road-railway
  roadRailwayCasing: string; // --color-road-railway-casing

  // Building fill — OSM Humanitarian palette
  buildingFill: string; // --color-building
}

const FALLBACKS: RendererTokens = {
  terrain: '#f7f6f1',
  terrainLow: '#b2c29d',
  terrainMid: '#deddbe',
  terrainHigh: '#eee5b2',
  water: '#6db8b7',
  green: '#d0dcae',
  text: '#333333',
  transitBg: '#1a1a2e',
  roadHighway: '#a098b0',
  roadHighwayCasing: '#7d748e',
  roadLargeArterial: '#d2938e',
  roadLargeArterialCasing: '#b8756e',
  roadMediumArterial: '#d4a882',
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
};

export function readTokensFromDOM(): RendererTokens {
  if (typeof document === 'undefined') return FALLBACKS;
  const style = getComputedStyle(document.documentElement);
  return {
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
  };
}
