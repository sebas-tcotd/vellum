import { beforeAll, describe, expect, it, vi } from 'vitest';
import type maplibregl from 'maplibre-gl';
import { addWatermarkLayer } from './layer-watermark';
import { WATERMARK_LAYER_ID } from '../constants/layer.constants';

// jsdom never fires `onload` for a data-URI image, so the real loader would
// hang forever. The stub resolves immediately; what is under test is the
// insertion order, not image decoding.
beforeAll(() => {
  class ImmediateImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin = '';
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', ImmediateImage);
});

/**
 * A map double that records the layer stack the way MapLibre orders it.
 *
 * @remarks
 * `addLayer(layer, beforeId)` inserts *before* `beforeId`, which is exactly
 * the semantic this regression is about — a stub that appended would not be
 * able to reproduce the bug.
 */
function fakeMap(initialLayers: string[]) {
  const layers = initialLayers.map((id) => ({ id }));
  const images = new Set<string>();
  const map = {
    getStyle: () => ({ layers }),
    getLayer: (id: string) => layers.find((l) => l.id === id),
    getSource: () => undefined,
    addSource: vi.fn(),
    hasImage: (id: string) => images.has(id),
    addImage: (id: string) => images.add(id),
    addLayer: (layer: { id: string }, beforeId?: string) => {
      const at = beforeId ? layers.findIndex((l) => l.id === beforeId) : -1;
      if (at < 0) layers.push({ id: layer.id });
      else layers.splice(at, 0, { id: layer.id });
    },
  } as unknown as maplibregl.Map;
  return { map, ids: () => layers.map((l) => l.id) };
}

describe('addWatermarkLayer', () => {
  it('sits directly above the background, never underneath it', async () => {
    // A MapLibre `background` layer paints the viewport opaque. Inserting the
    // watermark below it drew the mark and then covered it completely — which
    // only became visible once the background started following the theme.
    const { map, ids } = fakeMap(['background', 'base-land', 'roads-fill']);
    await addWatermarkLayer(map);

    const order = ids();
    expect(order.indexOf(WATERMARK_LAYER_ID)).toBe(
      order.indexOf('background') + 1,
    );
  });

  it('stays below the cartography, so it never covers the map', async () => {
    const { map, ids } = fakeMap(['background', 'base-land', 'roads-fill']);
    await addWatermarkLayer(map);

    const order = ids();
    expect(order.indexOf(WATERMARK_LAYER_ID)).toBeLessThan(
      order.indexOf('base-land'),
    );
  });

  it('appends on top when there is no background to sit above', async () => {
    // Better than being buried at the bottom, which is what the old
    // "before the first layer" behaviour degraded to.
    const { map, ids } = fakeMap(['base-land']);
    await addWatermarkLayer(map);
    expect(ids()).toEqual(['base-land', WATERMARK_LAYER_ID]);
  });
});
