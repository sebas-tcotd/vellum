import type { CapabilityReport, ExportSnapshot } from '@vellum/core';
import { describe, expect, it } from 'vitest';
import {
  CS1_EXTENT_DEG,
  CS1_WORLD_SIZE,
  csToGeo,
} from '../coordinate-transform';
import { planTiles } from './tile-planner';

const capability: CapabilityReport = {
  contextType: 'webgl2',
  webgl2: true,
  maxTextureSize: 8192,
  maxRenderbufferSize: 8192,
  maxViewportDims: [8192, 8192],
  maxCanvasSize: 8192,
  toBlob: true,
  memoryAvailableBytes: 'unknown',
};

function snapshot(width: number, height: number): ExportSnapshot {
  return {
    snapshotId: 'tile-test',
    cityData: {} as ExportSnapshot['cityData'],
    style: {} as ExportSnapshot['style'],
    activeLayers: {} as ExportSnapshot['activeLayers'],
    layerOptions: {} as ExportSnapshot['layerOptions'],
    transitDimming: false,
    watermarkVisible: false,
    camera: { longitude: 0, latitude: 0, zoom: 12, bearing: 0, pitch: 0 },
    extent: { minX: -1000, maxX: 1000, minZ: -500, maxZ: 500 },
    surface: { width, height },
    request: {
      format: 'png-1x',
      area: 'viewport',
      background: 'white',
      fileName: 'test',
      presentation: {} as ExportSnapshot['request']['presentation'],
    },
  };
}

describe('planTiles', () => {
  it('covers a partial grid exactly in deterministic row-major order', () => {
    const result = planTiles(snapshot(4100, 2200), capability);
    expect('rejected' in result).toBe(false);
    if ('rejected' in result) return;
    expect(result.expectedTiles).toBe(6);
    expect(
      result.tiles.map(({ sequence, tileX, tileY }) => [
        sequence,
        tileX,
        tileY,
      ]),
    ).toEqual([
      [0, 0, 0],
      [1, 1, 0],
      [2, 2, 0],
      [3, 0, 1],
      [4, 1, 1],
      [5, 2, 1],
    ]);
    expect(result.tiles.map((tile) => tile.usefulRect)).toEqual([
      { x: 0, y: 0, width: 2048, height: 2048 },
      { x: 2048, y: 0, width: 2048, height: 2048 },
      { x: 4096, y: 0, width: 4, height: 2048 },
      { x: 0, y: 2048, width: 2048, height: 152 },
      { x: 2048, y: 2048, width: 2048, height: 152 },
      { x: 4096, y: 2048, width: 4, height: 152 },
    ]);
    const coveredPixels = result.tiles.reduce(
      (total, tile) => total + tile.usefulRect.width * tile.usefulRect.height,
      0,
    );
    expect(coveredPixels).toBe(4100 * 2200);
    expect(planTiles(snapshot(4100, 2200), capability)).toEqual(result);
  });

  it('keeps overscan separate, clipped, and within the RGBA budget', () => {
    const result = planTiles(snapshot(4096, 4096), capability);
    if ('rejected' in result) throw new Error('expected plan');
    expect(result.tiles[0].renderRect).toEqual({
      x: 0,
      y: 0,
      width: 2304,
      height: 2304,
    });
    expect(result.tiles[3].renderRect).toEqual({
      x: 1792,
      y: 1792,
      width: 2304,
      height: 2304,
    });
    for (const tile of result.tiles) {
      expect(
        tile.renderRect.width * tile.renderRect.height * 4,
      ).toBeLessThanOrEqual(32 * 1024 * 1024);
    }
  });

  it('maps output rows from maxZ toward minZ to match MapLibre orientation', () => {
    const result = planTiles(snapshot(1000, 3000), capability);
    if ('rejected' in result) throw new Error('expected plan');

    const firstRow = result.tiles.find((tile) => tile.tileY === 0);
    const lastRow = result.tiles.find((tile) => tile.tileY === 1);
    expect(firstRow?.extent.maxZ).toBeCloseTo(result.renderExtent.maxZ);
    expect(lastRow?.extent.minZ).toBeCloseTo(result.renderExtent.minZ);
  });

  it('adapts to small outputs and rejects unsupported camera or dimensions', () => {
    expect(planTiles(snapshot(100, 100), capability)).toMatchObject({
      expectedTiles: 1,
      pixelRatio: 1,
      tiles: [{ usefulRect: { x: 0, y: 0, width: 100, height: 100 } }],
    });
    const small = planTiles(snapshot(100, 1000), capability);
    if ('rejected' in small) throw new Error('expected small plan');
    expect(small.tiles.every((tile) => tile.usefulRect.width === 100)).toBe(
      true,
    );
    expect(small.pixelRatio).toBe(1);
    expect(
      planTiles(
        {
          ...snapshot(100, 100),
          camera: { longitude: 0, latitude: 0, zoom: 1, bearing: 1, pitch: 0 },
        },
        capability,
      ),
    ).toMatchObject({ rejected: true, reason: 'dimensions' });
    expect(planTiles(snapshot(40_000, 40_000), capability)).toMatchObject({
      rejected: true,
      reason: 'dimensions',
    });
  });

  it('derives density from the frozen extent instead of the interactive zoom', () => {
    const oneX = planTiles(snapshot(2000, 1000), capability);
    const fourX = planTiles(snapshot(8000, 4000), capability);
    if ('rejected' in oneX || 'rejected' in fourX)
      throw new Error('expected plans');
    expect(oneX.zoom).not.toBe(12);
    expect(fourX.worldUnitsPerPixel).toBeCloseTo(oneX.worldUnitsPerPixel / 4);
    expect(fourX.zoom - oneX.zoom).toBeCloseTo(2);
  });

  it('fits full-map to the snapshot extent, not a hardcoded world square', () => {
    // The snapshot's extent for `full-map` is the city's real bounds (set by
    // `createExportSnapshot`), not the theoretical CS1 world square — a map
    // whose real terrain doesn't span the full ±8640 world must not be
    // zoomed out to show mostly-empty world, which is what a hardcoded
    // world extent here used to do (diverging from the legacy route).
    const fullMap = planTiles(
      {
        ...snapshot(1000, 1000),
        request: {
          ...snapshot(1000, 1000).request,
          area: 'full-map',
          targetLongEdge: 6000,
        },
      },
      capability,
    );
    if ('rejected' in fullMap) throw new Error('expected a plan');
    // Base extent is -1000..1000 (X) x -500..500 (Z), aspect 2; a 1000x1000
    // (aspect 1) surface must pad Z to match, not substitute the world extent.
    expect(fullMap.renderExtent).toEqual({
      minX: -1000,
      maxX: 1000,
      minZ: -1000,
      maxZ: 1000,
    });
  });

  it('lowers the useful side for constrained GPUs', () => {
    const constrained = planTiles(snapshot(3000, 3000), {
      ...capability,
      maxTextureSize: 1000,
      maxRenderbufferSize: 1000,
      maxViewportDims: [1000, 1000],
      maxCanvasSize: 1000,
    });
    if ('rejected' in constrained) throw new Error('expected a plan');
    expect(
      Math.max(...constrained.tiles.map((tile) => tile.usefulRect.width)),
    ).toBeLessThanOrEqual(512);
  });

  it('rejects unknown GPU limits before emitting tiles', () => {
    expect(
      planTiles(snapshot(100, 100), {
        ...capability,
        maxViewportDims: 'unknown',
      }),
    ).toEqual({ rejected: true, reason: 'gpu' });
  });

  it('uses the MapLibre 512-pixel zoom formula and ignores device DPR', () => {
    const source = snapshot(2000, 1000);
    const first = planTiles(source, capability);
    if ('rejected' in first) throw new Error('expected plan');
    const a = csToGeo({ x: 0, z: 0 });
    const b = csToGeo({ x: first.worldUnitsPerPixel, z: 0 });
    const pixels = ((b.lng - a.lng) / 360) * 512 * 2 ** first.zoom;
    expect(pixels).toBeCloseTo(1, 10);
    expect(CS1_EXTENT_DEG / CS1_WORLD_SIZE).toBeCloseTo(b.lng - a.lng, 12);
    const originalDpr = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    });
    expect(planTiles(source, capability)).toEqual(first);
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: originalDpr,
    });
  });

  it('stops planning immediately when its signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();

    expect(() =>
      planTiles(snapshot(100, 100), capability, controller.signal),
    ).toThrow('Export aborted');
  });
});
