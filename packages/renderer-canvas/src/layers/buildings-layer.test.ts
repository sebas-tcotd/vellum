import { describe, it, expect, vi } from 'vitest';
import {
  renderBuildingsLayer,
  BUILDING_EXCLUDED_ITEM_CLASSES,
} from './buildings-layer';
import type { Building } from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';

function makeCtx() {
  return {
    fillStyle: '' as string,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as OffscreenCanvasRenderingContext2D & {
    beginPath: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    closePath: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
  };
}

const BOUNDS = makeCityData().bounds;
const W = 1000;
const H = 1000;

// Tokens mínimos — solo buildingFill es relevante para esta capa.
const MOCK_TOKENS = {
  buildingFill: '#c8bfb5',
} as unknown as Parameters<typeof renderBuildingsLayer>[3];

/** Footprint triangular válido (3 vértices distintos) en world-space. */
function triangleFootprint(): Building['footprint'] {
  return [
    { x: -1000, y: 60, z: -1000 },
    { x: 1000, y: 60, z: -1000 },
    { x: 0, y: 60, z: 1000 },
  ];
}

function makeBuilding(overrides?: Partial<Building>): Building {
  return {
    id: 'building-1',
    position: { x: -1000, y: 60, z: -1000 },
    itemClass: 'Residential',
    footprint: triangleFootprint(),
    ...overrides,
  };
}

function render(ctx: ReturnType<typeof makeCtx>, buildings: Building[]): void {
  renderBuildingsLayer(ctx, buildings, BOUNDS, MOCK_TOKENS, W, H);
}

describe('renderBuildingsLayer', () => {
  it('Test 1 — array vacío no llama fill', () => {
    const ctx = makeCtx();
    render(ctx, []);
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('Test 2 — edificio con Beautification Item es excluido', () => {
    const ctx = makeCtx();
    render(ctx, [makeBuilding({ itemClass: 'Beautification Item' })]);
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('Test 3 — todos los ItemClasses excluidos son filtrados', () => {
    for (const excluded of BUILDING_EXCLUDED_ITEM_CLASSES) {
      const ctx = makeCtx();
      render(ctx, [makeBuilding({ itemClass: excluded })]);
      expect(ctx.fill, `${excluded} debe ser excluido`).not.toHaveBeenCalled();
    }
  });

  it('Test 4 — edificio válido renderiza polígono', () => {
    const ctx = makeCtx();
    render(ctx, [makeBuilding({ itemClass: 'Residential' })]);
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
    expect(ctx.moveTo).toHaveBeenCalledTimes(1);
    expect(ctx.lineTo).toHaveBeenCalledTimes(2);
    expect(ctx.closePath).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  it('Test 5 — edificio de mod con ItemClass desconocido es incluido', () => {
    const ctx = makeCtx();
    render(ctx, [makeBuilding({ itemClass: 'SomeModBuilding' })]);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  it('Test 6 — footprint con < 3 puntos es saltado silenciosamente', () => {
    const ctx = makeCtx();
    render(ctx, [
      makeBuilding({
        itemClass: 'Residential',
        footprint: [
          { x: -1000, y: 60, z: -1000 },
          { x: 1000, y: 60, z: 1000 },
        ],
      }),
    ]);
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('Test 7 — múltiples edificios, mix de incluidos y excluidos', () => {
    const ctx = makeCtx();
    render(ctx, [
      makeBuilding({ itemClass: 'Beautification Item' }), // excluido
      makeBuilding({ itemClass: 'Residential' }), // incluido
      makeBuilding({ itemClass: 'Commercial' }), // incluido
    ]);
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it('Test 8 — fillStyle es asignado al token correcto', () => {
    const ctx = makeCtx();
    const tokens = {
      buildingFill: '#abcdef',
    } as unknown as Parameters<typeof renderBuildingsLayer>[3];
    renderBuildingsLayer(
      ctx,
      [makeBuilding({ itemClass: 'Residential' })],
      BOUNDS,
      tokens,
      W,
      H,
    );
    expect(ctx.fillStyle).toBe('#abcdef');
  });

  // --- Review Follow-ups (code-review 2026-06-02) ---

  it('Test 9 — proyecta cada vértice world→canvas en moveTo/lineTo', () => {
    // Bounds simples para coordenadas verificables a mano:
    // x_canvas = ((x - 0) / 100) * 100 = x
    // y_canvas = 100 - ((z - 0) / 100) * 100 = 100 - z
    const ctx = makeCtx();
    const bounds = { minX: 0, maxX: 100, minZ: 0, maxZ: 100, seaLevel: 40 };
    renderBuildingsLayer(
      ctx,
      [
        makeBuilding({
          itemClass: 'Residential',
          footprint: [
            { x: 10, y: 60, z: 20 },
            { x: 30, y: 60, z: 40 },
            { x: 50, y: 60, z: 60 },
          ],
        }),
      ],
      bounds,
      MOCK_TOKENS,
      100,
      100,
    );
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 80);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 30, 60);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 50, 40);
  });

  it('Test 10 — bounds degenerados (rangeX <= 0) no renderizan', () => {
    const ctx = makeCtx();
    const bounds = { minX: 500, maxX: 500, minZ: 0, maxZ: 100, seaLevel: 40 };
    renderBuildingsLayer(
      ctx,
      [makeBuilding({ itemClass: 'Residential' })],
      bounds,
      MOCK_TOKENS,
      W,
      H,
    );
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('Test 11 — footprint null/undefined no lanza y se salta', () => {
    const ctx = makeCtx();
    const malformed = makeBuilding({ itemClass: 'Residential' });
    // Datos malformados del parser: footprint ausente.
    (malformed as unknown as { footprint: unknown }).footprint = undefined;
    expect(() => render(ctx, [malformed])).not.toThrow();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('Test 12 — vértice no-finito (NaN/Infinity) descarta el edificio', () => {
    const ctx = makeCtx();
    render(ctx, [
      makeBuilding({
        itemClass: 'Residential',
        footprint: [
          { x: Number.NaN, y: 60, z: -1000 },
          { x: 1000, y: 60, z: -1000 },
          { x: 0, y: 60, z: 1000 },
        ],
      }),
    ]);
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('Test 13 — canvasWidth/canvasHeight 0 o negativo no renderiza', () => {
    for (const [w, h] of [
      [0, H],
      [W, 0],
      [-100, H],
      [W, -100],
    ]) {
      const ctx = makeCtx();
      renderBuildingsLayer(
        ctx,
        [makeBuilding({ itemClass: 'Residential' })],
        BOUNDS,
        MOCK_TOKENS,
        w,
        h,
      );
      expect(ctx.fill, `${w}x${h} no debe renderizar`).not.toHaveBeenCalled();
    }
  });

  it('Test 14 — canvasWidth/canvasHeight NaN/Infinity no renderiza', () => {
    for (const [w, h] of [
      [Number.NaN, H],
      [W, Number.NaN],
      [Number.POSITIVE_INFINITY, H],
      [W, Number.POSITIVE_INFINITY],
    ]) {
      const ctx = makeCtx();
      renderBuildingsLayer(
        ctx,
        [makeBuilding({ itemClass: 'Residential' })],
        BOUNDS,
        MOCK_TOKENS,
        w,
        h,
      );
      expect(ctx.fill, `${w}x${h} no debe renderizar`).not.toHaveBeenCalled();
    }
  });

  it('Test 15 — itemClass null/undefined no está excluido → renderiza (AC3)', () => {
    const ctx = makeCtx();
    const noClass = makeBuilding({ itemClass: 'Residential' });
    (noClass as unknown as { itemClass: unknown }).itemClass = undefined;
    expect(() => render(ctx, [noClass])).not.toThrow();
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });
});
