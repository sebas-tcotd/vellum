import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderForestsLayer } from './forests-layer';
import type { ForestCell } from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';

// --- Nivel 1: Configuración compartida y Mocks ---

function createMockCanvasContext() {
  return {
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    filter: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  } as unknown as OffscreenCanvasRenderingContext2D & {
    drawImage: ReturnType<typeof vi.fn>;
  };
}

const TEST_BOUNDS = makeCityData().bounds;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 1000;

const MOCK_TOKENS = {
  green: '#d0dcae',
  districtFill: '#b4a08c',
  districtLabel: '#555550',
} as unknown as Parameters<typeof renderForestsLayer>[3];

function createMockCell(overrides?: Partial<ForestCell>): ForestCell {
  return { x: 0, z: 0, density: 0.5, ...overrides };
}

// --- Nivel 2: Casos de Prueba (Aplicando patrón AAA) ---

describe('renderForestsLayer', () => {
  let ctx: ReturnType<typeof createMockCanvasContext>;

  beforeEach(() => {
    // Instanciamos un contexto limpio antes de cada test para aislar estados
    ctx = createMockCanvasContext();
  });

  it('no renderiza nada si el array de celdas está vacío', () => {
    // Arrange
    const emptyCells: ForestCell[] = [];

    // Act
    renderForestsLayer(
      ctx,
      emptyCells,
      TEST_BOUNDS,
      MOCK_TOKENS,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
    );

    // Assert
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('no renderiza nada si las dimensiones del canvas son degeneradas (ej. width 0)', () => {
    // Arrange
    const invalidWidth = 0;
    const cells = [createMockCell()];

    // Act
    renderForestsLayer(
      ctx,
      cells,
      TEST_BOUNDS,
      MOCK_TOKENS,
      invalidWidth,
      CANVAS_HEIGHT,
    );

    // Assert
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('salta el procesamiento de celdas con density 0 pero mantiene el flujo de renderizado del overlay', () => {
    // Arrange
    const zeroDensityCells = [createMockCell({ density: 0 })];

    // Act
    renderForestsLayer(
      ctx,
      zeroDensityCells,
      TEST_BOUNDS,
      MOCK_TOKENS,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
    );

    // Assert
    // Se invoca el drawImage (renderiza una capa transparente al no aplicar mutaciones al ImageData)
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('salta el procesamiento de celdas con density NaN sin romper el flujo', () => {
    // Arrange
    const nanDensityCells = [createMockCell({ density: NaN })];

    // Act
    renderForestsLayer(
      ctx,
      nanDensityCells,
      TEST_BOUNDS,
      MOCK_TOKENS,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
    );

    // Assert
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('aplica los filtros orgánicos y dibuja la textura cuando hay celdas válidas', () => {
    // Arrange
    const validCells = [createMockCell({ density: 0.5 })];

    // Act
    renderForestsLayer(
      ctx,
      validCells,
      TEST_BOUNDS,
      MOCK_TOKENS,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
    );

    // Assert
    expect(ctx.save).toHaveBeenCalled();

    // Validamos que se apliquen las configuraciones de alisado refactorizadas
    expect(ctx.imageSmoothingEnabled).toBe(true);
    expect(ctx.imageSmoothingQuality).toBe('high');
    expect(ctx.filter).toContain('blur');

    expect(ctx.drawImage).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });
});
