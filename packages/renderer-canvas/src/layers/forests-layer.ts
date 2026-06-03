import type { ForestCell, CityData } from '@vellum/core';
import type { RendererTokens } from '../tokens';

const GRID_SIZE = 512;
const FOREST_WORLD_CELL_SIZE = 17280 / GRID_SIZE;
const DEFAULT_FOREST_COLOR: [number, number, number] = [70, 120, 70] as const;
const MAX_ALPHA = 255;

interface TextureCellBounds {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

interface GridScale {
  cellSizeX: number;
  cellSizeZ: number;
}

/** Renders forest vegetation as a smoothed density overlay. */
export function renderForestsLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  forestCells: ForestCell[],
  bounds: CityData['bounds'],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (!isValidEnvironment(forestCells, canvasWidth, canvasHeight)) return;

  const rgb = hexToRgbComponents(tokens.green) ?? DEFAULT_FOREST_COLOR;
  const texture = createDensityTexture(forestCells, bounds, rgb);

  renderTextureToCanvas(ctx, texture, canvasWidth, canvasHeight);
}

/**
 * Level 1: Orchestrates the creation of the texture map.
 * Reads like plain English: calculate scale -> iterate -> get bounds -> clamp -> draw.
 */
function createDensityTexture(
  cells: ForestCell[],
  bounds: CityData['bounds'],
  rgb: [number, number, number],
): ImageData {
  const imageData = new ImageData(GRID_SIZE, GRID_SIZE);
  const scale = calculateGridScale(bounds);

  for (const cell of cells) {
    if (!isValidDensity(cell.density)) continue;

    const pixelBounds = calculateCellPixelBounds(cell, bounds, scale);
    if (isOutOfBounds(pixelBounds)) continue;

    const clampedBounds = clampToGrid(pixelBounds);
    applyCellToTexture(imageData, clampedBounds, cell.density, rgb);
  }

  return imageData;
}

/**
 * Level 1: Orchestrates the canvas drawing operations.
 */
function renderTextureToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  texture: ImageData,
  width: number,
  height: number,
): void {
  const tempCanvas = createTextureCanvas(texture);

  ctx.save();
  applyOrganicFilters(ctx, width);
  ctx.drawImage(tempCanvas, 0, 0, width, height);
  ctx.restore();
}

// --- Level 2 & 3: Helper Functions & Low-Level Math ---

function isValidEnvironment(
  cells: ForestCell[],
  width: number,
  height: number,
): boolean {
  return (
    cells.length > 0 &&
    Number.isFinite(width) &&
    width > 0 &&
    Number.isFinite(height) &&
    height > 0
  );
}

function isValidDensity(density?: number): boolean {
  return Number.isFinite(density) && density! > 0;
}

function calculateGridScale(bounds: CityData['bounds']): GridScale {
  return {
    cellSizeX: (bounds.maxX - bounds.minX) / GRID_SIZE,
    cellSizeZ: (bounds.maxZ - bounds.minZ) / GRID_SIZE,
  };
}

function calculateCellPixelBounds(
  cell: ForestCell,
  bounds: CityData['bounds'],
  scale: GridScale,
): TextureCellBounds {
  // Z is inverted: higher game Z → lower texture Y (north = top)
  return {
    startX: Math.floor((cell.x - bounds.minX) / scale.cellSizeX),
    endX: Math.ceil(
      (cell.x + FOREST_WORLD_CELL_SIZE - bounds.minX) / scale.cellSizeX,
    ),
    startY: Math.floor(
      GRID_SIZE -
        (cell.z + FOREST_WORLD_CELL_SIZE - bounds.minZ) / scale.cellSizeZ,
    ),
    endY: Math.ceil(GRID_SIZE - (cell.z - bounds.minZ) / scale.cellSizeZ),
  };
}

function isOutOfBounds(b: TextureCellBounds): boolean {
  return (
    b.endX <= 0 || b.startX >= GRID_SIZE || b.endY <= 0 || b.startY >= GRID_SIZE
  );
}

function clampToGrid(b: TextureCellBounds): TextureCellBounds {
  return {
    startX: Math.max(0, b.startX),
    endX: Math.min(GRID_SIZE, b.endX),
    startY: Math.max(0, b.startY),
    endY: Math.min(GRID_SIZE, b.endY),
  };
}

function applyCellToTexture(
  imageData: ImageData,
  bounds: TextureCellBounds,
  density: number,
  rgb: [number, number, number],
): void {
  const alpha = Math.min(MAX_ALPHA, Math.max(0, density * MAX_ALPHA));
  const { data } = imageData;

  for (let y = bounds.startY; y < bounds.endY; y++) {
    for (let x = bounds.startX; x < bounds.endX; x++) {
      const index = (y * GRID_SIZE + x) * 4;
      data[index] = rgb[0];
      data[index + 1] = rgb[1];
      data[index + 2] = rgb[2];
      data[index + 3] = alpha;
    }
  }
}

function createTextureCanvas(texture: ImageData): OffscreenCanvas {
  const canvas = new OffscreenCanvas(GRID_SIZE, GRID_SIZE);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(texture, 0, 0);
  return canvas;
}

function applyOrganicFilters(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  canvasWidth: number,
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const blurRadius = Math.max(2, Math.round(canvasWidth / 200));
  ctx.filter = `blur(${blurRadius}px)`;
}

function hexToRgbComponents(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
