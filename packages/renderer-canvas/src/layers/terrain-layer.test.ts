import { describe, it, expect, vi } from 'vitest';
import { renderTerrainLayer } from './terrain-layer';
import { makeCityData } from '@vellum/core/testing';
import { readTokensFromDOM } from '../tokens';

function createMockCtx() {
  return {
    fillRect: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

describe('renderTerrainLayer', () => {
  it('no lanza con tiles vacíos', () => {
    const ctx = createMockCtx();
    expect(() =>
      renderTerrainLayer(
        ctx,
        [],
        makeCityData().bounds,
        readTokensFromDOM(),
        800,
        600,
      ),
    ).not.toThrow();
  });

  it('no llama fillRect con tiles vacíos', () => {
    const ctx = createMockCtx();
    renderTerrainLayer(
      ctx,
      [],
      makeCityData().bounds,
      readTokensFromDOM(),
      800,
      600,
    );
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('llama fillRect por cada tile', () => {
    const ctx = createMockCtx();
    const tiles = [
      { x: 0, z: 0, elevation: 5 },
      { x: 1, z: 1, elevation: 20 },
    ];
    const bounds = makeCityData().bounds;
    renderTerrainLayer(ctx, tiles, bounds, readTokensFromDOM(), 800, 600);
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });

  it('asigna colores distintos a elevaciones distintas (rampa)', () => {
    const ctx = createMockCtx();
    const tiles = [
      { x: 0, z: 0, elevation: 0 },
      { x: 1, z: 1, elevation: 23 },
    ];
    const bounds = makeCityData().bounds;
    const colors: string[] = [];
    Object.defineProperty(ctx, 'fillStyle', {
      set: (v: string) => colors.push(v),
      get: () => colors.at(-1) ?? '',
    });
    renderTerrainLayer(ctx, tiles, bounds, readTokensFromDOM(), 800, 600);
    expect(colors[0]).not.toBe(colors[1]);
  });

  it('clampea elevaciones fuera de rango', () => {
    const ctx = createMockCtx();
    const tiles = [
      { x: 0, z: 0, elevation: -5 },
      { x: 1, z: 1, elevation: 100 },
    ];
    const bounds = makeCityData().bounds;
    expect(() =>
      renderTerrainLayer(ctx, tiles, bounds, readTokensFromDOM(), 800, 600),
    ).not.toThrow();
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });
});
