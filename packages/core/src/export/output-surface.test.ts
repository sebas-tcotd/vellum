import { describe, expect, it } from 'vitest';
import { resolveFullMapOutputSurface } from './output-surface';
import type { ExportSnapshot } from '../types/export-pipeline';

/**
 * Construye un extent con el aspect ratio pedido.
 *
 * @param width - Ancho del rectángulo en unidades de mundo (eje X).
 * @param depth - Profundidad del rectángulo en unidades de mundo (eje Z).
 * @returns El extent centrado en el origen.
 */
function extentOf(width: number, depth: number): ExportSnapshot['extent'] {
  return {
    minX: -width / 2,
    maxX: width / 2,
    minZ: -depth / 2,
    maxZ: depth / 2,
  };
}

describe('resolveFullMapOutputSurface', () => {
  it('en un extent apaisado el lado largo es el ancho y la altura se deriva', () => {
    // aspect = 2 → el lado pedido va al ancho.
    expect(resolveFullMapOutputSurface(extentOf(2000, 1000), 6000)).toEqual({
      width: 6000,
      height: 3000,
    });
  });

  it('en un extent vertical el lado largo es la altura y el ancho se deriva', () => {
    // aspect = 0.5 → el lado pedido va a la altura.
    expect(resolveFullMapOutputSurface(extentOf(1000, 2000), 6000)).toEqual({
      width: 3000,
      height: 6000,
    });
  });

  it('trata el extent cuadrado (aspect exactamente 1) como apaisado', () => {
    expect(resolveFullMapOutputSurface(extentOf(1000, 1000), 12000)).toEqual({
      width: 12000,
      height: 12000,
    });
  });

  it('sin targetLongEdge usa el lado mayor del canvas vivo', () => {
    expect(
      resolveFullMapOutputSurface(extentOf(2000, 1000), undefined, 800, 600),
    ).toEqual({ width: 800, height: 400 });
  });

  it('redondea el lado derivado en lugar de truncarlo', () => {
    // 6000 / 3 = 2000 exacto; con aspect 2.5 la división da 2400.
    expect(resolveFullMapOutputSurface(extentOf(2500, 1000), 6000)).toEqual({
      width: 6000,
      height: 2400,
    });
    // aspect = 1000/300 → 6000 / 3.333… = 1800.0000…; usa un caso con decimal.
    expect(resolveFullMapOutputSurface(extentOf(1000, 700), 6000)).toEqual({
      width: 6000,
      height: Math.round(6000 / (1000 / 700)),
    });
  });

  it('el clamp Math.max(1, …) impide un lado derivado de 0 en un extent extremo', () => {
    // Apaisado extremo: 6000 / 20000 redondearía a 0.
    expect(
      resolveFullMapOutputSurface(extentOf(20_000_000, 1000), 6000),
    ).toEqual({ width: 6000, height: 1 });
    // Vertical extremo: 6000 * 0.00005 redondearía a 0.
    expect(
      resolveFullMapOutputSurface(extentOf(1000, 20_000_000), 6000),
    ).toEqual({ width: 1, height: 6000 });
  });

  it('sin targetLongEdge ni canvas el lado pedido es 0 y sólo sobrevive el clamp', () => {
    // Comportamiento actual, fijado tal cual: el lado largo queda en 0 y el
    // corto en 1. No se añade ninguna guarda nueva aquí.
    expect(
      resolveFullMapOutputSurface(extentOf(2000, 1000), undefined),
    ).toEqual({ width: 0, height: 1 });
  });
});
