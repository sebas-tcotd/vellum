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
    cityData: makeCityData(),
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

    expect(exportRaster).toHaveBeenCalledTimes(18);
    expect(report.cases).toHaveLength(18);
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
  });
});
