import type { LandTile, CityData } from '@vellum/core';
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
  // Try hex
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

function buildTerrainRamp(levels: number, baseColor: string): string[] {
  const parsed = parseHsl(baseColor);
  if (!parsed) {
    return Array.from({ length: levels }, () => baseColor);
  }
  const { h, s, l } = parsed;
  return Array.from({ length: levels }, (_, i) => {
    const t = i / (levels - 1);
    const newL = Math.max(0, Math.min(100, l - 15 * t));
    return `hsl(${h}, ${s.toFixed(1)}%, ${newL.toFixed(1)}%)`;
  });
}

// Ramp is built once per call — callers should cache this if needed
function getTerrainRamp(tokens: RendererTokens): string[] {
  return buildTerrainRamp(24, tokens.terrain);
}

export function renderTerrainLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tiles: LandTile[],
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (tiles.length === 0) return;

  const ramp = getTerrainRamp(tokens);
  const rangeX = bounds.maxX - bounds.minX;
  const rangeZ = bounds.maxZ - bounds.minZ;
  // Each terrain cell covers 16 game units. pixelsPerUnit converts world→canvas.
  const pixelsPerUnitX = canvasWidth / rangeX;
  const pixelsPerUnitZ = canvasHeight / rangeZ;
  const CELL_SIZE = 16;
  const cellW = CELL_SIZE * pixelsPerUnitX;
  const cellH = CELL_SIZE * pixelsPerUnitZ;

  // Normalize raw elevation to 0-23 range across the actual data range
  let minElev = Infinity;
  let maxElev = -Infinity;
  for (const tile of tiles) {
    if (tile.elevation < minElev) minElev = tile.elevation;
    if (tile.elevation > maxElev) maxElev = tile.elevation;
  }
  const elevRange = maxElev - minElev || 1;

  for (const tile of tiles) {
    const normalized = (tile.elevation - minElev) / elevRange;
    const colorIndex = Math.floor(normalized * 23);
    ctx.fillStyle = ramp[colorIndex];
    // X is mirrored: game east → canvas left (heightmap col 0 = east in export)
    const px = canvasWidth - (tile.x - bounds.minX) * pixelsPerUnitX - cellW;
    const py = (tile.z - bounds.minZ) * pixelsPerUnitZ;
    ctx.fillRect(px, py, cellW, cellH);
  }
}
