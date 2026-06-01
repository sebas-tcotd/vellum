import type { WaterTile, LandTile } from '@vellum/core';
import { SEA_LEVEL_DEFAULT } from '@vellum/core';

export const GRID_SIZE = 1081;
export const CELL_SIZE = 16;
export const MAP_ORIGIN = -8640;

function mark(grid: Uint8Array, x: number, z: number): void {
  const col = Math.round((x - MAP_ORIGIN) / CELL_SIZE);
  const row = Math.round((z - MAP_ORIGIN) / CELL_SIZE);
  if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE) {
    grid[row * GRID_SIZE + col] = 1;
  }
}

// Builds a binary presence grid (1 = water, 0 = land).
// Includes both ocean/sea tiles (elevation ≤ sea level) and inland water tiles
// (land tiles whose `elevation` field exceeds sea level — rivers and lakes
// that sit above the ocean but still have a water surface above them).
export function buildPresenceGrid(
  waterTiles: WaterTile[],
  landTiles: LandTile[],
): Uint8Array {
  const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
  for (const tile of waterTiles) {
    mark(grid, tile.x, tile.z);
  }
  for (const tile of landTiles) {
    if (tile.resolution > SEA_LEVEL_DEFAULT) {
      mark(grid, tile.x, tile.z);
    }
  }
  return grid;
}
