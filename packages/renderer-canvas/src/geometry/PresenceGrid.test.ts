import { describe, it, expect } from 'vitest';
import { buildPresenceGrid, GRID_SIZE } from './PresenceGrid';

const NO_LAND: never[] = [];

describe('buildPresenceGrid', () => {
  it('grid vacío con tiles vacíos', () => {
    const grid = buildPresenceGrid([], NO_LAND);
    expect(grid.length).toBe(GRID_SIZE * GRID_SIZE);
    expect(grid.every((v) => v === 0)).toBe(true);
  });

  it('marca la celda correcta para un tile de agua en el origen del mapa', () => {
    const grid = buildPresenceGrid([{ x: -8640, z: -8640, depth: 1 }], NO_LAND);
    expect(grid[0]).toBe(1);
  });

  it('marca la celda correcta para un tile en el centro del mapa', () => {
    const grid = buildPresenceGrid([{ x: 0, z: 0, depth: 1 }], NO_LAND);
    expect(grid[540 * GRID_SIZE + 540]).toBe(1);
  });

  it('ignora tiles fuera del grid', () => {
    const grid = buildPresenceGrid(
      [
        { x: -99999, z: -99999, depth: 1 },
        { x: 99999, z: 99999, depth: 1 },
      ],
      NO_LAND,
    );
    expect(grid.every((v) => v === 0)).toBe(true);
  });

  it('marca land tiles con resolution > SEA_LEVEL_DEFAULT como agua', () => {
    const landTiles = [{ x: -8640, z: -8640, elevation: 50, resolution: 80 }];
    const grid = buildPresenceGrid([], landTiles);
    expect(grid[0]).toBe(1);
  });

  it('no marca land tiles con resolution <= SEA_LEVEL_DEFAULT', () => {
    const landTiles = [{ x: -8640, z: -8640, elevation: 50, resolution: 30 }];
    const grid = buildPresenceGrid([], landTiles);
    expect(grid[0]).toBe(0);
  });
});
