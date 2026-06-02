import type { ForestCell, CityData } from '@vellum/core';
import type { RendererTokens } from '../tokens';

function hexToRgbComponents(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/**
 * Renders forest vegetation as density-mapped rectangles onto the forests canvas
 * (z-index 6). Each ForestCell covers 128×128 world units; density (0.0–1.0) maps
 * directly to alpha — denser areas appear more opaque.
 *
 * @remarks
 * The parser already filters cells with density 0, but this layer applies the same
 * defense-in-depth: zero-density cells are silently skipped.
 *
 * Pixel-snapping is applied (same pattern as terrain-layer) to eliminate 1px gaps
 * between adjacent cells, especially visible during PNG export.
 *
 * @param ctx - Canvas 2D rendering context (main or offscreen).
 * @param forestCells - Forest cells to render.
 * @param bounds - World-space bounds from CityData.
 * @param tokens - Renderer design tokens — `tokens.green` is used as the fill color.
 * @param canvasWidth - Canvas width in pixels.
 * @param canvasHeight - Canvas height in pixels.
 */
export function renderForestsLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  forestCells: ForestCell[],
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (forestCells.length === 0) return;

  if (
    !Number.isFinite(canvasWidth) ||
    canvasWidth <= 0 ||
    !Number.isFinite(canvasHeight) ||
    canvasHeight <= 0
  )
    return;

  const rangeX = bounds.maxX - bounds.minX;
  const rangeZ = bounds.maxZ - bounds.minZ;

  if (
    !Number.isFinite(rangeX) ||
    rangeX <= 0 ||
    !Number.isFinite(rangeZ) ||
    rangeZ <= 0
  )
    return;

  const pixelsPerUnitX = canvasWidth / rangeX;
  const pixelsPerUnitZ = canvasHeight / rangeZ;
  // Each forest cell covers 33.75 world units (17280 / 512 — grid is 512×512 over the full map).
  const CELL_SIZE = 17280 / 512;

  const rgb = hexToRgbComponents(tokens.green);

  for (const cell of forestCells) {
    if (!Number.isFinite(cell.density) || cell.density <= 0) continue;
    const alpha = Math.min(1, Math.max(0, cell.density));
    ctx.fillStyle = rgb
      ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`
      : tokens.green;

    // Pixel-snap to eliminate sub-pixel gaps between adjacent cells.
    const x0 = Math.floor((cell.x - bounds.minX) * pixelsPerUnitX);
    const y1 = Math.ceil(
      canvasHeight - (cell.z - bounds.minZ) * pixelsPerUnitZ,
    );
    const x1 = Math.ceil((cell.x - bounds.minX + CELL_SIZE) * pixelsPerUnitX);
    const y0 = Math.floor(
      canvasHeight - (cell.z - bounds.minZ + CELL_SIZE) * pixelsPerUnitZ,
    );
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
}
