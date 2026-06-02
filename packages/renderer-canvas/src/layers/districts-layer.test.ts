import { describe, it, expect, vi } from 'vitest';
import { renderDistrictsLayer } from './districts-layer';
import type { District } from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';

function makeCtx() {
  return {
    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 0 as number,
    font: '' as string,
    textAlign: '' as string,
    textBaseline: '' as string,
    strokeText: vi.fn(),
    fillText: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as OffscreenCanvasRenderingContext2D & {
    strokeText: ReturnType<typeof vi.fn>;
    fillText: ReturnType<typeof vi.fn>;
  };
}

const BOUNDS = makeCityData().bounds;
const W = 1000;
const H = 1000;

const MOCK_TOKENS = {
  districtFill: '#b4a08c',
  districtLabel: '#555550',
} as unknown as Parameters<typeof renderDistrictsLayer>[3];

function makeDistrict(overrides?: Partial<District>): District {
  return {
    id: '1',
    name: 'Distrito Norte',
    position: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

describe('renderDistrictsLayer', () => {
  it('array vacío → fillText no llamado', () => {
    const ctx = makeCtx();
    renderDistrictsLayer(ctx, [], BOUNDS, MOCK_TOKENS, W, H);
    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.strokeText).not.toHaveBeenCalled();
  });

  it('distrito sin nombre → skip', () => {
    const ctx = makeCtx();
    renderDistrictsLayer(
      ctx,
      [makeDistrict({ name: '' })],
      BOUNDS,
      MOCK_TOKENS,
      W,
      H,
    );
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('distrito válido → strokeText() y fillText() llamados con el nombre', () => {
    const ctx = makeCtx();
    renderDistrictsLayer(ctx, [makeDistrict()], BOUNDS, MOCK_TOKENS, W, H);
    expect(ctx.strokeText).toHaveBeenCalledTimes(1);
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    const [text] = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ...unknown[],
    ];
    expect(text).toBe('Distrito Norte');
  });

  it('posición no-finita → distrito descartado', () => {
    const ctx = makeCtx();
    renderDistrictsLayer(
      ctx,
      [makeDistrict({ position: { x: NaN, y: 0, z: 0 } })],
      BOUNDS,
      MOCK_TOKENS,
      W,
      H,
    );
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('canvas degenerado (width 0) → no renderiza', () => {
    const ctx = makeCtx();
    renderDistrictsLayer(ctx, [makeDistrict()], BOUNDS, MOCK_TOKENS, 0, H);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('bounds degenerados (rangeZ 0) → no renderiza', () => {
    const ctx = makeCtx();
    const degenerateBounds = { ...BOUNDS, minZ: 0, maxZ: 0 };
    renderDistrictsLayer(
      ctx,
      [makeDistrict()],
      degenerateBounds,
      MOCK_TOKENS,
      W,
      H,
    );
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('font configurado correctamente — DM Mono, center, middle', () => {
    const ctx = makeCtx();
    renderDistrictsLayer(ctx, [makeDistrict()], BOUNDS, MOCK_TOKENS, W, H);
    expect((ctx as unknown as { font: string }).font).toContain('DM Mono');
    expect((ctx as unknown as { textAlign: string }).textAlign).toBe('center');
    expect((ctx as unknown as { textBaseline: string }).textBaseline).toBe(
      'middle',
    );
  });

  it('fillText posicionado con coordenadas finitas', () => {
    const ctx = makeCtx();
    renderDistrictsLayer(ctx, [makeDistrict()], BOUNDS, MOCK_TOKENS, W, H);
    expect(ctx.fillText).toHaveBeenCalledTimes(1);
    const args = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      number,
      number,
    ];
    expect(args[0]).toBe('Distrito Norte');
    expect(Number.isFinite(args[1])).toBe(true);
    expect(Number.isFinite(args[2])).toBe(true);
  });

  it('outline stroke aplicado antes del fill — strokeText llamado antes de fillText', () => {
    const ctx = makeCtx();
    const callOrder: string[] = [];
    (ctx.strokeText as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('stroke');
    });
    (ctx.fillText as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callOrder.push('fill');
    });
    renderDistrictsLayer(ctx, [makeDistrict()], BOUNDS, MOCK_TOKENS, W, H);
    expect(callOrder).toEqual(['stroke', 'fill']);
  });

  it('fill usa tokens.districtLabel', () => {
    const ctx = makeCtx();
    let fillStyleAtFillCall = '';
    (ctx.fillText as ReturnType<typeof vi.fn>).mockImplementation(() => {
      fillStyleAtFillCall = (ctx as unknown as { fillStyle: string }).fillStyle;
    });
    renderDistrictsLayer(ctx, [makeDistrict()], BOUNDS, MOCK_TOKENS, W, H);
    expect(fillStyleAtFillCall).toBe('#555550');
  });

  it('múltiples distritos → strokeText() y fillText() llamados por cada uno con nombre', () => {
    const ctx = makeCtx();
    const districts = [
      makeDistrict({ id: '1', name: 'A' }),
      makeDistrict({ id: '2', name: 'B' }),
      makeDistrict({ id: '3', name: 'C' }),
    ];
    renderDistrictsLayer(ctx, districts, BOUNDS, MOCK_TOKENS, W, H);
    expect(ctx.strokeText).toHaveBeenCalledTimes(3);
    expect(ctx.fillText).toHaveBeenCalledTimes(3);
  });
});
