import { describe, expect, it } from 'vitest';
import {
  MAP_FRAME_SHADOW_BLUR_STOPS,
  MAP_FRAME_SHADOW_OFFSET,
  MAP_FRAME_WIDTH_STOPS,
  interpolateZoomStops,
  mapFrameMarginPixels,
} from './map-frame-metrics';

describe('interpolateZoomStops', () => {
  it('devuelve el valor exacto en cada stop declarado', () => {
    for (const stop of MAP_FRAME_WIDTH_STOPS) {
      expect(interpolateZoomStops(MAP_FRAME_WIDTH_STOPS, stop.zoom)).toBe(
        stop.value,
      );
    }
  });

  it('interpola linealmente entre dos stops', () => {
    // Zoom 8 está a mitad de camino entre los stops 6 (6 px) y 10 (12 px).
    expect(interpolateZoomStops(MAP_FRAME_WIDTH_STOPS, 8)).toBe(9);
  });

  it('mantiene el primer y el último stop fuera del rango declarado', () => {
    // MapLibre no extrapola: un export por encima del zoom 18 sigue viendo
    // 130 px de marco, y el cálculo del margen tiene que coincidir.
    expect(interpolateZoomStops(MAP_FRAME_WIDTH_STOPS, 2)).toBe(6);
    expect(interpolateZoomStops(MAP_FRAME_WIDTH_STOPS, 24)).toBe(130);
  });

  it('no lanza con un zoom no finito ni con una rampa vacía', () => {
    expect(interpolateZoomStops(MAP_FRAME_WIDTH_STOPS, Number.NaN)).toBe(6);
    expect(interpolateZoomStops([], 12)).toBe(0);
  });
});

describe('mapFrameMarginPixels', () => {
  it('suma media anchura de trazo, el desplazamiento de sombra y su blur', () => {
    const zoom = 14;
    const expected =
      interpolateZoomStops(MAP_FRAME_WIDTH_STOPS, zoom) / 2 +
      Math.abs(MAP_FRAME_SHADOW_OFFSET[1]) +
      interpolateZoomStops(MAP_FRAME_SHADOW_BLUR_STOPS, zoom);

    expect(mapFrameMarginPixels(zoom)).toBeCloseTo(expected, 10);
    // 38/2 + 4 + 22.8
    expect(mapFrameMarginPixels(zoom)).toBeCloseTo(45.8, 10);
  });

  it('crece monótonamente con el zoom y se satura en el último stop', () => {
    const samples = [6, 8, 10, 12, 14, 16, 18].map(mapFrameMarginPixels);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeGreaterThan(samples[index - 1]!);
    }
    expect(mapFrameMarginPixels(22)).toBe(mapFrameMarginPixels(18));
  });
});
