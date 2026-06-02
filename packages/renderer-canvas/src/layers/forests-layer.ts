import type { ForestCell, CityData } from '@vellum/core';
import type { RendererTokens } from '../tokens';

const GRID_SIZE = 512;

/**
 * Renders forest vegetation as a smoothed density overlay.
 *
 * @remarks
 * Instead of individual rectangles, this implementation creates a 512×512 density texture
 * (mapping 1:1 to the game grid). It then renders this texture onto the main canvas
 * using bilinear interpolation (via `imageSmoothingEnabled`) and a Gaussian blur
 * filter to achieve an organic, "patchy" appearance characteristic of resource overlays.
 */
export function renderForestsLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  forestCells: ForestCell[],
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (!isValidEnvironment(forestCells, canvasWidth, canvasHeight)) return;

  const rgb = hexToRgbComponents(tokens.green) || [70, 120, 70];
  const texture = createDensityTexture(forestCells, bounds, rgb);

  renderTextureToCanvas(ctx, texture, canvasWidth, canvasHeight);
}

/**
 * Validates the rendering environment and data availability.
 */
function isValidEnvironment(
  forestCells: ForestCell[],
  width: number,
  height: number,
): boolean {
  return (
    forestCells.length > 0 &&
    Number.isFinite(width) &&
    width > 0 &&
    Number.isFinite(height) &&
    height > 0
  );
}

/**
 * Creates a 512x512 ImageData texture where density is mapped to the alpha channel.
 */
function createDensityTexture(
  cells: ForestCell[],
  bounds: CityData['bounds'],
  rgb: [number, number, number],
): ImageData {
  const imageData = new ImageData(GRID_SIZE, GRID_SIZE);
  const data = imageData.data;

  const cellSizeX = (bounds.maxX - bounds.minX) / GRID_SIZE;
  const cellSizeZ = (bounds.maxZ - bounds.minZ) / GRID_SIZE;

  for (const cell of cells) {
    if (!Number.isFinite(cell.density) || cell.density <= 0) continue;

    const gx = Math.floor((cell.x - bounds.minX) / cellSizeX);
    // Invert Z for the grid (game Z -> texture Y)
    const gz = Math.floor(GRID_SIZE - 1 - (cell.z - bounds.minZ) / cellSizeZ);

    if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) continue;

    const index = (gz * GRID_SIZE + gx) * 4;
    data[index] = rgb[0];
    data[index + 1] = rgb[1];
    data[index + 2] = rgb[2];
    data[index + 3] = Math.min(255, Math.max(0, cell.density * 255));
  }

  return imageData;
}

/**
 * Renders the density texture onto the target context with smoothing and blur filters.
 */
function renderTextureToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  texture: ImageData,
  width: number,
  height: number,
): void {
  // Use a temporary canvas to upscale the ImageData
  const tempCanvas = new OffscreenCanvas(GRID_SIZE, GRID_SIZE);
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(texture, 0, 0);

  ctx.save();

  // Enable bilinear interpolation for smooth scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Apply Gaussian blur for organic patches (approx 1% of canvas width as a heuristic)
  const blurRadius = Math.max(2, Math.round(width / 200));
  ctx.filter = `blur(${blurRadius}px)`;

  // Draw the 512x512 texture stretched to the full canvas size
  ctx.drawImage(tempCanvas, 0, 0, width, height);

  ctx.restore();
}

/**
 * Utility to convert hex color strings to RGB components.
 */
function hexToRgbComponents(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
