import type { CapabilityReport, TilePlanTile } from '@vellum/core';
import { describe, expect, it } from 'vitest';
import {
  applyBoxFilter,
  downsampleRgba,
  preflightQuality,
  processQualityPng,
  type ExportQualityConfig,
  type RasterImage,
} from './export-quality';

const capability: CapabilityReport = {
  contextType: 'webgl2',
  webgl2: true,
  maxTextureSize: 4096,
  maxRenderbufferSize: 4096,
  maxViewportDims: [4096, 4096],
  maxCanvasSize: 4096,
  toBlob: true,
  memoryAvailableBytes: 'unknown',
};

const tile: TilePlanTile = {
  sequence: 0,
  tileX: 0,
  tileY: 0,
  usefulRect: { x: 0, y: 0, width: 100, height: 100 },
  renderRect: { x: 0, y: 0, width: 100, height: 100 },
  camera: { longitude: 0, latitude: 0, zoom: 1, bearing: 0, pitch: 0 },
  extent: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 },
};

function image(width: number, height: number, pixels: number[]): RasterImage {
  return { width, height, pixels: new Uint8Array(pixels) };
}

describe('export quality', () => {
  it('has an independent quality flag and does not mutate planner limits', () => {
    const config: ExportQualityConfig = { enabled: true, ssaa: 2 };
    const before = capability.maxCanvasSize;

    expect(preflightQuality(tile, capability, config)).toMatchObject({
      eligible: true,
      physicalWidth: 200,
      physicalHeight: 200,
      factor: 2,
    });
    expect(capability.maxCanvasSize).toBe(before);
    expect(
      preflightQuality(tile, capability, { enabled: false, ssaa: 2 }),
    ).toMatchObject({ eligible: false, reason: 'flag' });
  });

  it('rejects a fixed factor when any measured GPU limit is exceeded', () => {
    expect(
      preflightQuality(
        { ...tile, renderRect: { ...tile.renderRect, width: 2100 } },
        capability,
        { enabled: true, ssaa: 2 },
      ),
    ).toMatchObject({ eligible: false, reason: 'gpu-limit' });
  });

  it('allows a CPU-only box filter when GPU limits are not measured', () => {
    expect(
      preflightQuality(
        tile,
        {
          ...capability,
          maxTextureSize: 'unknown',
          maxRenderbufferSize: 'unknown',
          maxViewportDims: 'unknown',
          maxCanvasSize: 'unknown',
        },
        { enabled: true, filter: 'box-3x3' },
      ),
    ).toMatchObject({ eligible: true, factor: 1 });
  });

  it('downsamples premultiplied color while preserving transparent alpha', async () => {
    const output = await downsampleRgba(
      image(2, 2, [255, 0, 0, 255, 0, 0, 255, 0, 255, 0, 0, 255, 0, 0, 255, 0]),
      2,
      new AbortController().signal,
    );

    expect(output.pixels).toEqual(new Uint8Array([255, 0, 0, 128]));
  });

  it('runs filter and re-encode only after physical dimensions are verified', async () => {
    const calls: string[] = [];
    const codec = {
      decode: async (): Promise<RasterImage> => {
        calls.push('decode');
        return image(
          2,
          2,
          [10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255],
        );
      },
      encode: async (value: RasterImage): Promise<Uint8Array> => {
        calls.push(`${value.width}x${value.height}`);
        return new Uint8Array([value.pixels[3]]);
      },
    };

    await processQualityPng(
      new Uint8Array([1]),
      { ...tile, renderRect: { ...tile.renderRect, width: 1, height: 1 } },
      { enabled: true, ssaa: 2, filter: 'box-3x3' },
      codec,
      new AbortController().signal,
    );
    expect(calls).toEqual(['decode', '1x1']);
  });

  it('rejects a clamped physical capture instead of accepting a degraded result', async () => {
    const codec = {
      decode: async (): Promise<RasterImage> =>
        image(3, 2, new Array(24).fill(1)),
      encode: async (): Promise<Uint8Array> => new Uint8Array([1]),
    };

    await expect(
      processQualityPng(
        new Uint8Array([1]),
        { ...tile, renderRect: { ...tile.renderRect, width: 1, height: 1 } },
        { enabled: true, ssaa: 2 },
        codec,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: 'QualityVariantError' });
  });

  it('checks cancellation at the filter boundary', async () => {
    const controller = new AbortController();
    const result = applyBoxFilter(
      image(1, 1, [10, 20, 30, 255]),
      controller.signal,
    );
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('normalizes box-filter alpha by the actual edge sample count', async () => {
    const output = await applyBoxFilter(
      image(1, 1, [255, 0, 0, 255]),
      new AbortController().signal,
    );

    expect(output.pixels).toEqual(new Uint8Array([255, 0, 0, 255]));
  });

  it('rejects a decoded pixel buffer shorter than its measured dimensions', async () => {
    const codec = {
      decode: async (): Promise<RasterImage> => image(1, 1, [255, 0, 0]),
      encode: async (): Promise<Uint8Array> => new Uint8Array([1]),
    };

    await expect(
      processQualityPng(
        new Uint8Array([1]),
        { ...tile, renderRect: { ...tile.renderRect, width: 1, height: 1 } },
        { enabled: true, ssaa: 1 },
        codec,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: 'QualityVariantError' });
  });

  it('rejects SSAA sources whose dimensions are not divisible by the factor', async () => {
    await expect(
      downsampleRgba(
        image(3, 2, new Array(24).fill(255)),
        2,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: 'QualityVariantError' });
  });

  it('keeps adjacent SSAA tile boundaries aligned without dropping columns', async () => {
    const makeGradient = (width: number, height: number, offset: number) => {
      const pixels: number[] = [];
      for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1)
          pixels.push((x + offset) * 20, 0, 0, 255);
      return image(width, height, pixels);
    };
    const combined = await downsampleRgba(
      makeGradient(8, 2, 0),
      2,
      new AbortController().signal,
    );
    const left = await downsampleRgba(
      makeGradient(4, 2, 0),
      2,
      new AbortController().signal,
    );
    const right = await downsampleRgba(
      makeGradient(4, 2, 4),
      2,
      new AbortController().signal,
    );

    expect(left.pixels).toEqual(combined.pixels.slice(0, 2 * 4));
    expect(right.pixels).toEqual(combined.pixels.slice(2 * 4));
  });
});
