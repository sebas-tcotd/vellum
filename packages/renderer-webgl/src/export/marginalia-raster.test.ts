import {
  composeMarginalia,
  resolveMarginaliaFrame,
  DEFAULT_LAYER_OPTIONS,
  type MarginaliaLayout,
} from '@vellum/core';
import {
  makeCityData,
  makeLayerVisibility,
  makeMarginaliaLabels,
  makePresentationOptions,
  makeRenderStyle,
} from '@vellum/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  encodeCanvasWithMarginalia,
  loadMarginaliaFont,
  marginaliaOverlayFor,
} from './marginalia-raster';

function layout(): MarginaliaLayout {
  return composeMarginalia(
    {
      presentation: makePresentationOptions({
        showCityName: true,
        corner: 'top-left',
      }),
      labels: makeMarginaliaLabels(),
      style: makeRenderStyle(),
      cityData: makeCityData(),
      activeLayers: makeLayerVisibility(),
      layerOptions: DEFAULT_LAYER_OPTIONS,
    },
    resolveMarginaliaFrame({
      area: 'full-map',
      format: 'png-1x',
      surface: { width: 1000, height: 1000 },
      extent: { minX: 0, maxX: 1000, minZ: 0, maxZ: 1000 },
      viewportWorldUnitsPerPixel: 1,
      camera: { bearing: 0, pitch: 0 },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('marginaliaOverlayFor', () => {
  it('devuelve null para un frame que no toca el panel', () => {
    const painted = layout();
    expect(marginaliaOverlayFor(painted)).not.toBeNull();
    expect(
      marginaliaOverlayFor(painted, {
        x: 900,
        y: 900,
        width: 100,
        height: 100,
      }),
    ).toBeNull();
  });
});

describe('encodeCanvasWithMarginalia', () => {
  it('copia el frame WebGL, pinta encima escalado al frame físico y solo después codifica', async () => {
    const order: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_target, key) => {
          if (key === 'createLinearGradient')
            return () => ({ addColorStop: () => undefined });
          return (...args: unknown[]) => {
            order.push(String(key));
            if (key === 'scale') order.push(`scale:${args.join(',')}`);
          };
        },
        set: () => true,
      },
    );
    class FakeOffscreenCanvas {
      constructor(
        readonly width: number,
        readonly height: number,
      ) {
        order.push(`canvas:${width}x${height}`);
      }
      getContext() {
        return ctx;
      }
      async convertToBlob() {
        order.push('convertToBlob');
        return new Blob([new Uint8Array([1, 2, 3])]);
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    const source = { width: 2000, height: 2000 } as HTMLCanvasElement;

    const bytes = await encodeCanvasWithMarginalia(source, {
      layout: layout(),
      rect: { x: 0, y: 0, width: 1000, height: 1000 },
    });

    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(order[0]).toBe('canvas:2000x2000');
    expect(order[1]).toBe('drawImage');
    expect(order).toContain('scale:2,2');
    expect(order.indexOf('fillText')).toBeGreaterThan(1);
    expect(order.at(-1)).toBe('convertToBlob');
  });
});

describe('encodeCanvasWithMarginalia sin OffscreenCanvas', () => {
  it('recurre a un <canvas> del documento y codifica con toBlob', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const drawImage = vi.fn();
    const ctx = new Proxy(
      { drawImage },
      {
        get: (target, key) =>
          key in target
            ? target[key as 'drawImage']
            : key === 'createLinearGradient'
              ? () => ({ addColorStop: () => undefined })
              : () => undefined,
        set: () => true,
      },
    );
    const fallback = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toBlob: (callback: (blob: Blob | null) => void) =>
        callback(new Blob([new Uint8Array([4, 5])])),
    };
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(fallback as unknown as HTMLElement);
    const source = { width: 1000, height: 1000 } as HTMLCanvasElement;

    const bytes = await encodeCanvasWithMarginalia(source, {
      layout: layout(),
      rect: { x: 0, y: 0, width: 1000, height: 1000 },
    });

    expect(createElement).toHaveBeenCalledWith('canvas');
    expect(fallback.width).toBe(1000);
    expect(drawImage).toHaveBeenCalledWith(source, 0, 0);
    expect(bytes).toEqual(new Uint8Array([4, 5]));
  });

  it('sin contexto 2D falla con un error explícito', async () => {
    class NoContextCanvas {
      getContext() {
        return null;
      }
    }
    vi.stubGlobal('OffscreenCanvas', NoContextCanvas);
    await expect(
      encodeCanvasWithMarginalia({ width: 1, height: 1 } as HTMLCanvasElement, {
        layout: layout(),
        rect: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).rejects.toThrow('2D canvas context is unavailable');
  });
});

describe('loadMarginaliaFont', () => {
  it('espera a DM Mono y avisa si no está disponible', async () => {
    const load = vi.fn(async () => [] as FontFace[]);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(loadMarginaliaFont()).resolves.toBe(false);
    expect(load).toHaveBeenCalledWith(expect.stringContaining("'DM Mono'"));
    expect(warn).toHaveBeenCalledOnce();

    load.mockResolvedValueOnce([{} as FontFace]);
    await expect(loadMarginaliaFont()).resolves.toBe(true);
  });
});
