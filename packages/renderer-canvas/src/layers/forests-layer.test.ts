import { describe, it, expect, vi } from 'vitest';
import { renderForestsLayer } from './forests-layer';
import type { ForestCell } from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';

function makeCtx() {
  return {
    fillStyle: '' as string,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as OffscreenCanvasRenderingContext2D & {
    fillRect: ReturnType<typeof vi.fn>;
  };
}

const BOUNDS = makeCityData().bounds;
const W = 1000;
const H = 1000;

const MOCK_TOKENS = {
  green: '#d0dcae',
  districtFill: '#b4a08c',
  districtLabel: '#555550',
} as unknown as Parameters<typeof renderForestsLayer>[3];

function makeCell(overrides?: Partial<ForestCell>): ForestCell {
  return { x: 0, z: 0, density: 0.5, ...overrides };
}

describe('renderForestsLayer', () => {
  it('array vacío → fillRect no llamado', () => {
    const ctx = makeCtx();
    renderForestsLayer(ctx, [], BOUNDS, MOCK_TOKENS, W, H);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('celda con density 0 → skip', () => {
    const ctx = makeCtx();
    renderForestsLayer(
      ctx,
      [makeCell({ density: 0 })],
      BOUNDS,
      MOCK_TOKENS,
      W,
      H,
    );
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('celda con density 0.5 → fillRect llamado 1 vez con alpha 0.500', () => {
    const ctx = makeCtx();
    renderForestsLayer(
      ctx,
      [makeCell({ density: 0.5 })],
      BOUNDS,
      MOCK_TOKENS,
      W,
      H,
    );
    expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    expect((ctx as unknown as { fillStyle: string }).fillStyle).toContain(
      'rgba(',
    );
    expect((ctx as unknown as { fillStyle: string }).fillStyle).toContain(
      '0.500',
    );
  });

  it('celda con density 1.0 → alpha 1.000', () => {
    const ctx = makeCtx();
    renderForestsLayer(
      ctx,
      [makeCell({ density: 1.0 })],
      BOUNDS,
      MOCK_TOKENS,
      W,
      H,
    );
    expect((ctx as unknown as { fillStyle: string }).fillStyle).toContain(
      '1.000',
    );
  });

  it('canvas degenerado (width 0) → no renderiza', () => {
    const ctx = makeCtx();
    renderForestsLayer(ctx, [makeCell()], BOUNDS, MOCK_TOKENS, 0, H);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('bounds degenerados (rangeX 0) → no renderiza', () => {
    const ctx = makeCtx();
    const degenerateBounds = { ...BOUNDS, minX: 0, maxX: 0 };
    renderForestsLayer(ctx, [makeCell()], degenerateBounds, MOCK_TOKENS, W, H);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('múltiples celdas — density 0 se salta → fillRect llamado 2 veces', () => {
    const ctx = makeCtx();
    const cells = [
      makeCell({ density: 0.3 }),
      makeCell({ density: 0 }),
      makeCell({ density: 0.8 }),
    ];
    renderForestsLayer(ctx, cells, BOUNDS, MOCK_TOKENS, W, H);
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });

  it('celda con density NaN → skip (NaN <= 0 es false en JS)', () => {
    const ctx = makeCtx();
    renderForestsLayer(
      ctx,
      [makeCell({ density: NaN })],
      BOUNDS,
      MOCK_TOKENS,
      W,
      H,
    );
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('color usa tokens.green → fillStyle contiene los componentes RGB de #d0dcae', () => {
    const ctx = makeCtx();
    renderForestsLayer(
      ctx,
      [makeCell({ density: 1.0 })],
      BOUNDS,
      MOCK_TOKENS,
      W,
      H,
    );
    // #d0dcae → r=208, g=220, b=174
    expect((ctx as unknown as { fillStyle: string }).fillStyle).toContain(
      '208,220,174',
    );
  });
});
