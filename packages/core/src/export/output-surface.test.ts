import { describe, expect, it } from 'vitest';
import { mapFrameMarginPixels } from './map-frame-metrics';
import { zoomForWorldUnitsPerPixel } from './output-density';
import {
  resolveFullMapFraming,
  resolveFullMapOutputSurface,
} from './output-surface';
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

describe('resolveFullMapFraming', () => {
  it('crece el extent por igual en los cuatro lados', () => {
    const content = extentOf(17_280, 17_280);
    const { extent, marginWorldUnits } = resolveFullMapFraming(content, 6000);

    expect(marginWorldUnits).toBeGreaterThan(0);
    expect(extent).toEqual({
      minX: content.minX - marginWorldUnits,
      maxX: content.maxX + marginWorldUnits,
      minZ: content.minZ - marginWorldUnits,
      maxZ: content.maxZ + marginWorldUnits,
    });
  });

  it('reserva exactamente el margen del marco evaluado en el zoom de exportación', () => {
    const { extent, surface, marginWorldUnits } = resolveFullMapFraming(
      extentOf(17_280, 17_280),
      6000,
    );

    const worldUnitsPerPixel = (extent.maxX - extent.minX) / surface.width;
    const zoom = zoomForWorldUnitsPerPixel(worldUnitsPerPixel);
    // El punto fijo converge: el margen en píxeles de salida es el que la
    // rampa del marco pide en el zoom que ese mismo margen produce.
    expect(marginWorldUnits / worldUnitsPerPixel).toBeCloseTo(
      mapFrameMarginPixels(zoom),
      2,
    );
  });

  it('conserva el lado largo pedido por el usuario', () => {
    for (const longEdge of [6000, 12_000, 16_000, 20_000] as const) {
      const { surface } = resolveFullMapFraming(
        extentOf(18_000, 16_000),
        longEdge,
      );
      expect(Math.max(surface.width, surface.height)).toBe(longEdge);
    }
  });

  it('el margen sigue al zoom: más resolución da más píxeles de marco y menos mundo reservado', () => {
    const content = extentOf(17_280, 17_280);
    const low = resolveFullMapFraming(content, 6000);
    const high = resolveFullMapFraming(content, 20_000);

    const marginPixels = (framing: typeof low): number =>
      framing.marginWorldUnits /
      ((framing.extent.maxX - framing.extent.minX) / framing.surface.width);

    // Un documento más denso es un zoom más alto, y la rampa del marco dibuja
    // un trazo más grueso ahí: un margen fijo sobraría aquí o faltaría allá.
    expect(marginPixels(high)).toBeGreaterThan(marginPixels(low));
    // Aun así cada píxel cubre menos mundo, así que el margen recorta menos
    // ciudad cuanto mayor es la resolución pedida.
    expect(high.marginWorldUnits).toBeLessThan(low.marginWorldUnits);
  });

  it('acerca al cuadrado el aspect ratio de un extent apaisado', () => {
    const content = extentOf(18_000, 16_000);
    const bare = resolveFullMapOutputSurface(content, 12_000);
    const { surface } = resolveFullMapFraming(content, 12_000);

    expect(surface.width).toBe(bare.width);
    expect(surface.height).toBeGreaterThan(bare.height);
  });

  it('devuelve el extent intacto cuando no hay densidad que evaluar', () => {
    const content = extentOf(2000, 1000);
    // Sin targetLongEdge ni canvas el lado largo es 0: no hay zoom de
    // exportación del que derivar un margen, así que no se inventa ninguno.
    const { extent, marginWorldUnits } = resolveFullMapFraming(
      content,
      undefined,
    );
    expect(marginWorldUnits).toBe(0);
    expect(extent).toEqual(content);
  });

  it('devuelve el extent intacto cuando el contenido es degenerado', () => {
    const degenerate = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    expect(resolveFullMapFraming(degenerate, 6000)).toEqual({
      extent: degenerate,
      surface: expect.anything(),
      marginWorldUnits: 0,
    });
  });
});
