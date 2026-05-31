export interface RendererTokens {
  terrain: string; // --color-terrain
  water: string; // --color-water
  green: string; // --color-green
  text: string; // --color-text
  transitBg: string; // --color-transit-bg
}

const FALLBACKS: RendererTokens = {
  terrain: '#f7f6f1',
  water: '#90cccb',
  green: '#d0dcae',
  text: '#333333',
  transitBg: '#1a1a2e',
};

export function readTokensFromDOM(): RendererTokens {
  if (typeof document === 'undefined') return FALLBACKS;
  const style = getComputedStyle(document.documentElement);
  return {
    terrain:
      style.getPropertyValue('--color-terrain').trim() || FALLBACKS.terrain,
    water: style.getPropertyValue('--color-water').trim() || FALLBACKS.water,
    green: style.getPropertyValue('--color-green').trim() || FALLBACKS.green,
    text: style.getPropertyValue('--color-text').trim() || FALLBACKS.text,
    transitBg:
      style.getPropertyValue('--color-transit-bg').trim() ||
      FALLBACKS.transitBg,
  };
}
