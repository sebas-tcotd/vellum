import type * as maplibregl from 'maplibre-gl';
import { describe, expect, it, vi } from 'vitest';
import {
  FRAME_WIDTH_EXPR,
  SHADOW_BLUR_EXPR,
  SHADOW_OFFSET,
  addMapFrameLayer,
} from './layer-map-frame';
import type { ResolvedColors } from '../style-adapter';

/**
 * The expressions this layer painted before the stop tables moved to
 * `@vellum/core`, copied verbatim from `8a64ba1`.
 *
 * @remarks
 * The whole point of generating them from `MAP_FRAME_WIDTH_STOPS` is that the
 * margin `resolveFullMapFraming` reserves and the frame MapLibre paints come
 * from one table. Nothing else pins the *generated* expression: evaluating the
 * tables directly still passes if the generator emits `value, zoom` instead of
 * `zoom, value`, and so does asserting that a layer named `map-frame` was
 * added. The frame would then be stroked at wild widths while the reserved
 * margin stayed correct — which is the clipping this story exists to remove.
 */
const LITERAL_FRAME_WIDTH_EXPR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  6,
  6,
  10,
  12,
  12,
  20,
  14,
  38,
  16,
  72,
  18,
  130,
];

const LITERAL_SHADOW_BLUR_EXPR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  6,
  3.6,
  10,
  7.2,
  12,
  12,
  14,
  22.8,
  16,
  43.2,
  18,
  78,
];

describe('map frame expressions', () => {
  it('generates exactly the ramps the layer used to declare literally', () => {
    expect(FRAME_WIDTH_EXPR).toEqual(LITERAL_FRAME_WIDTH_EXPR);
    expect(SHADOW_BLUR_EXPR).toEqual(LITERAL_SHADOW_BLUR_EXPR);
    expect(SHADOW_OFFSET).toEqual([0, 4]);
  });

  it('orders each stop as zoom then value, the way MapLibre reads them', () => {
    // A transposed pair still produces a well-formed `interpolate`, so the
    // ordering is asserted on its own rather than only through deep equality.
    const [, , , ...stops] = LITERAL_FRAME_WIDTH_EXPR as unknown[];
    const generated = (FRAME_WIDTH_EXPR as unknown[]).slice(3);
    for (let index = 0; index < stops.length; index += 2) {
      expect(generated[index]).toBe(stops[index]);
      expect(generated[index + 1]).toBe(stops[index + 1]);
    }
  });
});

describe('addMapFrameLayer', () => {
  it('paints both layers with the generated ramps', () => {
    const added: maplibregl.AddLayerObject[] = [];
    const map = {
      getSource: vi.fn(() => undefined),
      addSource: vi.fn(),
      getLayer: vi.fn(() => undefined),
      addLayer: vi.fn((layer: maplibregl.AddLayerObject) => {
        added.push(layer);
      }),
    } as unknown as maplibregl.Map;

    addMapFrameLayer(map, { mapFrame: '#f5f0e6' } as ResolvedColors);

    const paints = added.map(
      (layer) => (layer as { paint: Record<string, unknown> }).paint,
    );
    // The shadow is the wider reach of the two, so its width, blur and
    // translate are exactly what `mapFrameMarginPixels` reserves room for.
    expect(paints[0]).toMatchObject({
      'line-width': LITERAL_FRAME_WIDTH_EXPR,
      'line-blur': LITERAL_SHADOW_BLUR_EXPR,
      'line-translate': [0, 4],
      'line-translate-anchor': 'viewport',
    });
    expect(paints[1]).toMatchObject({
      'line-width': LITERAL_FRAME_WIDTH_EXPR,
      'line-color': '#f5f0e6',
    });
  });
});
