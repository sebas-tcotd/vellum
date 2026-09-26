import { describe, expect, it } from 'vitest';

import { CANOPY_GRID_SIZE } from './forest-canopy';
import { TREES_TILE_SIZE, treesInTile } from './tree-tiles';

// z16 tile whose north-west corner is the world centre: CS1 x ∈ [0, ~611], z ∈ [~−611, 0].
const CENTRE_TILE = { z: 16, x: 2 ** 15, y: 2 ** 15 };

const gridWith = (
  cols: [number, number],
  rows: [number, number],
  d: number,
) => {
  const g = new Float32Array(CANOPY_GRID_SIZE * CANOPY_GRID_SIZE);
  for (let r = rows[0]; r <= rows[1]; r++) {
    for (let c = cols[0]; c <= cols[1]; c++) g[r * CANOPY_GRID_SIZE + c] = d;
  }
  return g;
};

describe('treesInTile', () => {
  it('draws nothing where the grid is empty', () => {
    expect(
      treesInTile(new Float32Array(CANOPY_GRID_SIZE ** 2), CENTRE_TILE),
    ).toEqual([]);
  });

  it('places five crowns per dense cell inside the tile, stably', () => {
    // One dense cell well inside the tile: col 260 (x ≈ 135 m), row 250 (z ≈ −200 m).
    const g = gridWith([260, 260], [250, 250], 1);
    const crowns = treesInTile(g, CENTRE_TILE);
    expect(crowns).toHaveLength(5);
    for (const { x, y } of crowns) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(TREES_TILE_SIZE);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(TREES_TILE_SIZE);
    }
    expect(treesInTile(g, CENTRE_TILE)).toEqual(crowns);
  });

  it('keeps a lone sparse tree as one crown', () => {
    expect(
      treesInTile(gridWith([260, 260], [250, 250], 0.2), CENTRE_TILE),
    ).toHaveLength(1);
  });

  it('ignores cells outside the tile', () => {
    expect(
      treesInTile(gridWith([100, 110], [100, 110], 1), CENTRE_TILE),
    ).toEqual([]);
  });
});
