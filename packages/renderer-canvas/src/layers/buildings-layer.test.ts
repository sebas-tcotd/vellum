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
});
