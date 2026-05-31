import { describe, it, expect, vi } from 'vitest';
import { renderWaterLayer } from './water-layer';
import { makeCityData } from '@vellum/core/testing';
import { readTokensFromDOM } from '../tokens';

function createMockCtx() {
  return {
    fillRect: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

describe('renderWaterLayer', () => {
  it('no lanza con tiles vacíos', () => {
    const ctx = createMockCtx();
    expect(() =>
      renderWaterLayer(
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
    renderWaterLayer(
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
      { x: 0, z: 0, depth: 1 },
      { x: 1, z: 1, depth: 5 },
      { x: 2, z: 2, depth: 8 },
    ];
    const bounds = makeCityData().bounds;
    renderWaterLayer(ctx, tiles, bounds, readTokensFromDOM(), 800, 600);
    expect(ctx.fillRect).toHaveBeenCalledTimes(3);
  });

  it('asigna colores distintos a profundidades distintas (rampa)', () => {
    const ctx = createMockCtx();
    const tiles = [
      { x: 0, z: 0, depth: 0 },
      { x: 1, z: 1, depth: 8 },
    ];
    const bounds = makeCityData().bounds;
    const colors: string[] = [];
    Object.defineProperty(ctx, 'fillStyle', {
      set: (v: string) => colors.push(v),
      get: () => colors.at(-1) ?? '',
    });
    renderWaterLayer(ctx, tiles, bounds, readTokensFromDOM(), 800, 600);
    expect(colors[0]).not.toBe(colors[1]);
  });

  it('clampea profundidades fuera de rango', () => {
    const ctx = createMockCtx();
    const tiles = [
      { x: 0, z: 0, depth: -1 },
      { x: 1, z: 1, depth: 100 },
    ];
    const bounds = makeCityData().bounds;
    expect(() =>
      renderWaterLayer(ctx, tiles, bounds, readTokensFromDOM(), 800, 600),
    ).not.toThrow();
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });
});
