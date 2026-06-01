import { describe, it, expect, vi } from 'vitest';
import { renderWaterLayer } from './water-layer';
import { readTokensFromDOM } from '../tokens';

function createMockCtx() {
  return {
    fill: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

const CANVAS_SIZE = 1081;
const NO_LAND: never[] = [];

describe('renderWaterLayer', () => {
  it('no lanza con tiles vacíos', () => {
    const ctx = createMockCtx();
    expect(() =>
      renderWaterLayer(ctx, [], NO_LAND, readTokensFromDOM(), CANVAS_SIZE),
    ).not.toThrow();
  });

  it('no llama fill con tiles vacíos (early return)', () => {
    const ctx = createMockCtx();
    renderWaterLayer(ctx, [], NO_LAND, readTokensFromDOM(), CANVAS_SIZE);
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('llama fill una sola vez para todos los tiles (un Path2D)', () => {
    const ctx = createMockCtx();
    const tiles = [
      { x: -8640, z: -8640, depth: 1 },
      { x: -8624, z: -8640, depth: 3 },
      { x: -8640, z: -8624, depth: 5 },
    ];
    renderWaterLayer(ctx, tiles, NO_LAND, readTokensFromDOM(), CANVAS_SIZE);
    expect(ctx.fill).toHaveBeenCalledOnce();
  });

  it('asigna fillStyle al color del token de agua', () => {
    const ctx = createMockCtx();
    const tokens = readTokensFromDOM();
    const tiles = [{ x: -8640, z: -8640, depth: 2 }];
    renderWaterLayer(ctx, tiles, NO_LAND, tokens, CANVAS_SIZE);
    expect(ctx.fillStyle).toBe(tokens.water);
  });

  it('incluye land tiles con resolution alta como agua (ríos/lagos)', () => {
    const ctx = createMockCtx();
    // resolution > SEA_LEVEL_DEFAULT (40) → debe tratarse como agua
    const landTiles = [{ x: -8640, z: -8640, elevation: 50, resolution: 80 }];
    renderWaterLayer(ctx, [], landTiles, readTokensFromDOM(), CANVAS_SIZE);
    expect(ctx.fill).toHaveBeenCalledOnce();
  });

  it('no lanza con coordenadas fuera del grid', () => {
    const ctx = createMockCtx();
    const tiles = [
      { x: -99999, z: -99999, depth: 1 },
      { x: 99999, z: 99999, depth: 1 },
    ];
    expect(() =>
      renderWaterLayer(ctx, tiles, NO_LAND, readTokensFromDOM(), CANVAS_SIZE),
    ).not.toThrow();
  });
});
