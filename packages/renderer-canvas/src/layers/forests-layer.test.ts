import { describe, it, expect, vi } from 'vitest';
import { renderForestsLayer } from './forests-layer';
import type { ForestCell } from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';

function makeCtx() {
  return {
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    filter: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  } as unknown as OffscreenCanvasRenderingContext2D & {
    drawImage: ReturnType<typeof vi.fn>;
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
  it('array vacío → drawImage no llamado', () => {
    const ctx = makeCtx();
    renderForestsLayer(ctx, [], BOUNDS, MOCK_TOKENS, W, H);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('celda con density 0 → drawImage no llamado (si no hay otras celdas)', () => {
    const ctx = makeCtx();
    renderForestsLayer(
      ctx,
      [makeCell({ density: 0 })],
      BOUNDS,
      MOCK_TOKENS,
      W,
      H,
    );
  });

  it('celda válida → drawImage llamado y filtros aplicados', () => {
    const ctx = makeCtx();
    renderForestsLayer(
      ctx,
      [makeCell({ density: 0.5 })],
      BOUNDS,
      MOCK_TOKENS,
      W,
      H,
    );
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.filter).toContain('blur');
  });

  it('canvas degenerado (width 0) → no renderiza', () => {
    const ctx = makeCtx();
    renderForestsLayer(ctx, [makeCell()], BOUNDS, MOCK_TOKENS, 0, H);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('celda con density NaN → no afecta al resultado (skips)', () => {
    const ctx = makeCtx();
    renderForestsLayer(
      ctx,
      [makeCell({ density: NaN })],
      BOUNDS,
      MOCK_TOKENS,
      W,
      H,
    );
    expect(ctx.drawImage).toHaveBeenCalled();
  });
});
