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

type Hsl = { h: number; s: number; l: number };

function lerpHsl(a: Hsl, b: Hsl, t: number): Hsl {
  return {
    h: a.h + (b.h - a.h) * t,
    s: a.s + (b.s - a.s) * t,
    l: a.l + (b.l - a.l) * t,
  };
}

function buildTerrainRamp(levels: number, stopColors: string[]): string[] {
  const validStops = stopColors
    .map(parseHsl)
    .filter((s): s is Hsl => s !== null);
  if (validStops.length < 2) {
    return Array.from({ length: levels }, () => stopColors[0] ?? '#f7f6f1');
  }
  const segCount = validStops.length - 1;
  return Array.from({ length: levels }, (_, i) => {
    const t = i / (levels - 1);
    const seg = Math.min(Math.floor(t * segCount), segCount - 1);
    const segT = t * segCount - seg;
    const { h, s, l } = lerpHsl(validStops[seg]!, validStops[seg + 1]!, segT);
    return `hsl(${h.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
  });
}

// Ramp is built once per call — callers should cache this if needed.
// Stops go low→mid→high: vegetated lowlands → agriculture → arid highlands.
function getTerrainRamp(tokens: RendererTokens): string[] {
  return buildTerrainRamp(24, [
    tokens.terrainLow,
    tokens.terrainMid,
    tokens.terrainHigh,
  ]);
}

export function renderTerrainLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tiles: LandTile[],
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
  zoom = 1,
  panX = 0,
  panY = 0,
): void {
  if (tiles.length === 0) return;

  const ramp = getTerrainRamp(tokens);
  const rangeX = bounds.maxX - bounds.minX;
  const rangeZ = bounds.maxZ - bounds.minZ;
  // Each terrain cell covers 16 game units. pixelsPerUnit converts world→canvas.
  const pixelsPerUnitX = canvasWidth / rangeX;
  const pixelsPerUnitZ = canvasHeight / rangeZ;
  const CELL_SIZE = 16;

  // Anchor the low end of the ramp to sea level so terrainLow always maps
  // to land just above water, regardless of the map's actual minimum elevation.
  const minElev = bounds.seaLevel;
  let maxElev = -Infinity;
  for (const tile of tiles) {
    if (tile.elevation > maxElev) maxElev = tile.elevation;
  }
  const elevRange = maxElev - minElev || 1;

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  for (const tile of tiles) {
    const normalized = (tile.elevation - minElev) / elevRange;
    const colorIndex = Math.max(0, Math.floor(normalized * 23));
    ctx.fillStyle = ramp[colorIndex];
    // Snap to integer pixels to eliminate sub-pixel gaps between adjacent tiles.
    const x0 = Math.floor((tile.x - bounds.minX) * pixelsPerUnitX);
    const y1 = Math.ceil(
      canvasHeight - (tile.z - bounds.minZ) * pixelsPerUnitZ,
    );
    const x1 = Math.ceil((tile.x - bounds.minX + CELL_SIZE) * pixelsPerUnitX);
    const y0 = Math.floor(
      canvasHeight - (tile.z - bounds.minZ + CELL_SIZE) * pixelsPerUnitZ,
    );
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  ctx.restore();
}
