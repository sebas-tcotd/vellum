export interface RendererTokens {
  terrain: string; // --color-terrain
  water: string; // --color-water
  green: string; // --color-green
  text: string; // --color-text
  transitBg: string; // --color-transit-bg
}

export function readTokensFromDOM(): RendererTokens {
  const style = getComputedStyle(document.documentElement);
  return {
    terrain: style.getPropertyValue('--color-terrain').trim() || '#f7f6f1',
    water: style.getPropertyValue('--color-water').trim() || '#90cccb',
    green: style.getPropertyValue('--color-green').trim() || '#d0dcae',
    text: style.getPropertyValue('--color-text').trim() || '#333333',
    transitBg: style.getPropertyValue('--color-transit-bg').trim() || '#1a1a2e',
  };
}
