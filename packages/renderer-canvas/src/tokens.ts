export interface RendererTokens {
  terrain: string; // --color-terrain (base plano / zona más alta)
  terrainLow: string; // --color-terrain-low (vegetación costera/llanos)
  terrainMid: string; // --color-terrain-mid (agricultura/transición)
  terrainHigh: string; // --color-terrain-high (tierras altas/áridas)
  water: string; // --color-water
  green: string; // --color-green
  text: string; // --color-text
  transitBg: string; // --color-transit-bg
  roadHighway: string; // --color-road-highway
  roadArterial: string; // --color-road-arterial
  roadLocal: string; // --color-road-local
  roadPedestrian: string; // --color-road-pedestrian
  roadCasing: string; // --color-road-casing
}

const FALLBACKS: RendererTokens = {
  terrain: '#f7f6f1',
  terrainLow: '#b2c29d',
  terrainMid: '#deddbe',
  terrainHigh: '#eee5b2',
  water: '#90cccb',
  green: '#d0dcae',
  text: '#333333',
  transitBg: '#1a1a2e',
  roadHighway: '#f6a800',
  roadArterial: '#fcd47a',
  roadLocal: '#ffffff',
  roadPedestrian: '#ededed',
  roadCasing: '#aaaaaa',
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
    roadArterial:
      style.getPropertyValue('--color-road-arterial').trim() ||
      FALLBACKS.roadArterial,
    roadLocal:
      style.getPropertyValue('--color-road-local').trim() ||
      FALLBACKS.roadLocal,
    roadPedestrian:
      style.getPropertyValue('--color-road-pedestrian').trim() ||
      FALLBACKS.roadPedestrian,
    roadCasing:
      style.getPropertyValue('--color-road-casing').trim() ||
      FALLBACKS.roadCasing,
  };
}
