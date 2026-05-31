import type { WaterTile, CityData } from '@vellum/core';
import type { RendererTokens } from '../tokens';

function parseHsl(color: string): { h: number; s: number; l: number } | null {
  const hsl = color.match(
    /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i,
  );
  if (hsl) {
    return {
      h: parseFloat(hsl[1]),
      s: parseFloat(hsl[2]),
      l: parseFloat(hsl[3]),
    };
  }
  const hex = color.trim().replace('#', '');
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let s = 0;
    let h = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }
  return null;
}

function buildWaterRamp(levels: number, baseColor: string): string[] {
  const parsed = parseHsl(baseColor);
  if (!parsed) {
    return Array.from({ length: levels }, () => baseColor);
  }
  const { h, s, l } = parsed;
  return Array.from({ length: levels }, (_, i) => {
    const t = i / (levels - 1);
    // Deeper water = darker and slightly more saturated
    const newL = Math.max(0, Math.min(100, l - 10 * t));
    const newS = Math.min(100, s + 5 * t);
    return `hsl(${h}, ${newS.toFixed(1)}%, ${newL.toFixed(1)}%)`;
  });
}

function getWaterRamp(tokens: RendererTokens): string[] {
  return buildWaterRamp(9, tokens.water);
}

export function renderWaterLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tiles: WaterTile[],
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (tiles.length === 0) return;

  const ramp = getWaterRamp(tokens);
  const rangeX = bounds.maxX - bounds.minX;
  const rangeZ = bounds.maxZ - bounds.minZ;
  const cellWidth = canvasWidth / rangeX;
  const cellHeight = canvasHeight / rangeZ;

  for (const tile of tiles) {
    const colorIndex = Math.max(0, Math.min(8, tile.depth));
    ctx.fillStyle = ramp[colorIndex];
    const px = (tile.x - bounds.minX) * cellWidth;
    const py = (tile.z - bounds.minZ) * cellHeight;
    ctx.fillRect(px, py, cellWidth, cellHeight);
  }
}
