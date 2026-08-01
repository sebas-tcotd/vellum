import type { CapabilityReport, ExportSnapshot } from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { RasterBenchmarkRunner } from './raster-benchmark-runner';

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

function snapshot(): ExportSnapshot {
  return {
    snapshotId: 'benchmark',
    cityData: makeCityData({ fileName: 'altavento.cslmap' }),
    style: {} as never,
    activeLayers: {
      terrain: true,
      basemap: true,
      roads: true,
      transit: true,
      buildings: true,
      forests: true,
      districts: true,
    },
    layerOptions: {} as never,
    transitDimming: false,
    watermarkVisible: false,
    camera: { longitude: 0, latitude: 0, zoom: 5, bearing: 0, pitch: 0 },
    extent: { minX: -8640, maxX: 8640, minZ: -8640, maxZ: 8640 },
    surface: { width: 400, height: 300 },
    request: {
      format: 'png-1x',
      area: 'viewport',
      background: 'white',
      fileName: 'benchmark',
      presentation: {} as never,
    },
  };
}

describe('RasterBenchmarkRunner', () => {
  it('recorre la matriz completa y no filtra rutas locales ni bytes de salida', async () => {
    const exportSnapshot = vi.fn(() => snapshot());
    const exportRaster = vi.fn().mockResolvedValue({
      filePath: '/private/output.png',
      folderPath: '/private',
    });
    const runner = new RasterBenchmarkRunner({
      captureSnapshot: exportSnapshot,
      exportRaster,
      getLastRoute: () => 'tiled-png',
      getCapability: () => capability,
      runWithRoute: async (_route, operation) => operation(),
      now: () => 123,
      releaseGpuContext: async () => undefined,
    });

    const report = await runner.run({
      fixture: 'altavento',
      route: 'tiled',
      repeats: 1,
      warmup: false,
      platform: 'macOS/WebKit',
      build: '8d94b1f',
    });

    // 3 formats × 3 backgrounds (viewport) + 4 targetLongEdge presets × 3
    // backgrounds (full-map, always png-1x) = 9 + 12.
    expect(exportRaster).toHaveBeenCalledTimes(21);
    expect(report.cases).toHaveLength(21);
    expect(report.cases.every((entry) => entry.route === 'tiled-png')).toBe(
      true,
    );
    expect(JSON.stringify(report)).not.toContain('/private');
    expect(report.cases[0]).toMatchObject({
      durationMs: 0,
      peakMemoryBytes: 'unknown',
      alpha: 'unknown',
      visual: 'pending-manual',
    });
    expect(report.isCompleteMatrix).toBe(true);
  });

  it('marca isCompleteMatrix en false cuando el reporte es de un caso filtrado', async () => {
    const runner = new RasterBenchmarkRunner({
      captureSnapshot: () => snapshot(),
      exportRaster: vi.fn().mockResolvedValue({
        filePath: '/private/output.png',
        folderPath: '/private',
      }),
      getLastRoute: () => 'tiled-png',
      getCapability: () => capability,
      runWithRoute: async (_route, operation) => operation(),
      releaseGpuContext: async () => undefined,
    });

    const report = await runner.run({
      fixture: 'altavento',
      route: 'tiled',
      repeats: 1,
      warmup: false,
      platform: 'macOS/WebKit',
      build: 'test',
      area: 'full-map',
    });

    expect(report.isCompleteMatrix).toBe(false);
  });

  it('rechaza un filtro de area/format/background que no sea uno de los valores permitidos', async () => {
    const runner = new RasterBenchmarkRunner({
      captureSnapshot: () => snapshot(),
      exportRaster: vi.fn(),
      getLastRoute: () => 'tiled-png',
      getCapability: () => capability,
      runWithRoute: async (_route, operation) => operation(),
      releaseGpuContext: async () => undefined,
    });

    await expect(
      runner.run({
        fixture: 'altavento',
        route: 'tiled',
        repeats: 1,
        warmup: false,
        platform: 'macOS/WebKit',
        build: 'test',
        // A console typo — falsy, but must be rejected, not silently treated
        // as "no filter" (which would run the full matrix unexpectedly).
        area: '' as never,
      }),
    ).rejects.toThrow(/Invalid benchmark area filter/);
  });

  it('restringe la matriz a un solo caso cuando se filtra area/format/background', async () => {
    const exportSnapshot = vi.fn(() => snapshot());
    const exportRaster = vi.fn().mockResolvedValue({
      filePath: '/private/output.png',
      folderPath: '/private',
    });
    const runner = new RasterBenchmarkRunner({
      captureSnapshot: exportSnapshot,
      exportRaster,
      getLastRoute: () => 'tiled-png',
      getCapability: () => capability,
      runWithRoute: async (_route, operation) => operation(),
      now: () => 123,
      releaseGpuContext: async () => undefined,
    });

    const report = await runner.run({
      fixture: 'altavento',
      route: 'tiled',
      repeats: 1,
      warmup: false,
      platform: 'macOS/WebKit',
      build: '8d94b1f',
      area: 'viewport',
      format: 'png-4x',
      background: 'dark',
    });

    expect(exportRaster).toHaveBeenCalledTimes(1);
    expect(report.cases).toEqual([
      expect.objectContaining({
        area: 'viewport',
        format: 'png-4x',
        background: 'dark',
      }),
    ]);
  });

  it('recorre los presets de targetLongEdge para full-map en vez del eje format', async () => {
    const exportSnapshot = vi.fn(() => snapshot());
    const exportRaster = vi.fn().mockResolvedValue({
      filePath: '/private/output.png',
      folderPath: '/private',
    });
    const runner = new RasterBenchmarkRunner({
      captureSnapshot: exportSnapshot,
      exportRaster,
      getLastRoute: () => 'tiled-png',
      getCapability: () => capability,
      runWithRoute: async (_route, operation) => operation(),
      now: () => 123,
      releaseGpuContext: async () => undefined,
    });

    const report = await runner.run({
      fixture: 'altavento',
      route: 'tiled',
      repeats: 1,
      warmup: false,
      platform: 'macOS/WebKit',
      build: '8d94b1f',
      area: 'full-map',
      background: 'dark',
    });

    expect(exportRaster).toHaveBeenCalledTimes(4);
    expect(report.cases.map((entry) => entry.targetLongEdge)).toEqual([
      6000, 12000, 16000, 20000,
    ]);
    expect(report.cases.every((entry) => entry.format === 'png-1x')).toBe(true);
  });

  it('no exporta un snapshot de otra fixture mientras el mapa termina de cargar', async () => {
    const stale = snapshot();
    const current = {
      ...snapshot(),
      cityData: makeCityData({ fileName: 'aurelia-del-delta.cslmap' }),
    };
    const captureSnapshot = vi
      .fn<() => ExportSnapshot | null>()
      .mockReturnValueOnce(stale)
      .mockReturnValue(current);
    const exportRaster = vi.fn().mockResolvedValue({
      filePath: '/private/output.png',
      folderPath: '/private',
    });
    const runner = new RasterBenchmarkRunner({
      captureSnapshot,
      exportRaster,
      getLastRoute: () => 'tiled-png',
      getCapability: () => capability,
      runWithRoute: async (_route, operation) => operation(),
      releaseGpuContext: async () => undefined,
    });

    await runner.run({
      fixture: 'aurelia-del-delta',
      route: 'tiled',
      repeats: 1,
      warmup: false,
      platform: 'macOS/WebKit',
      build: 'test',
    });

    expect(exportRaster).toHaveBeenCalled();
    expect(exportRaster.mock.calls[0]?.[0].cityData.fileName).toBe(
      'aurelia-del-delta.cslmap',
    );
  });
});
