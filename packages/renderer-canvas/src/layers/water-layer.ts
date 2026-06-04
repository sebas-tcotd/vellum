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
  zoom = 1,
  panX = 0,
  panY = 0,
): void {
  if (waterTiles.length === 0 && landTiles.length === 0) return;

  const grid = buildPresenceGrid(waterTiles, landTiles);
  const polygons = traceWaterContours(grid);
  if (polygons.length === 0) return;

  const path = buildWaterPath(polygons, canvasWidth, canvasHeight, bounds);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);
  ctx.fillStyle = tokens.water;
  ctx.fill(path, 'evenodd');
  ctx.restore();
}
