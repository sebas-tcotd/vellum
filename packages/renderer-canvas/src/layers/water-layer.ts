import type { WaterTile, LandTile, CityData } from '@vellum/core';
import type { RendererTokens } from '../tokens';
import { buildPresenceGrid } from '../geometry/PresenceGrid';
import { traceWaterContours, buildWaterPath } from '../geometry/WaterContour';

export function renderWaterLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  waterTiles: WaterTile[],
  landTiles: LandTile[],
  tokens: RendererTokens,
  canvasWidth: number,
  canvasHeight: number,
  bounds: CityData['bounds'],
): void {
  if (waterTiles.length === 0 && landTiles.length === 0) return;

  const grid = buildPresenceGrid(waterTiles, landTiles);
  const polygons = traceWaterContours(grid);
  if (polygons.length === 0) return;

  const path = buildWaterPath(polygons, canvasWidth, canvasHeight, bounds);
  ctx.fillStyle = tokens.water;
  ctx.fill(path, 'evenodd');
}
