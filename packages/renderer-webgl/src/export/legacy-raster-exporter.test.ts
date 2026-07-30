import {
  createExportSnapshot,
  type ExportSession,
  type ExportSink,
  type ExportSnapshot,
  type ExportReceipt,
  type RasterTileChunk,
} from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { LegacyRasterExporter } from './legacy-raster-exporter';

function makeSnapshot(surface = { width: 800, height: 600 }): ExportSnapshot {
  return createExportSnapshot({
    snapshotId: 'snapshot-test',
    cityData: makeCityData(),
    style: { terrain: { base: '#000000' } } as never,
    activeLayers: {
      terrain: true,
      basemap: true,
      roads: true,
      transit: true,
      buildings: true,
      forests: true,
      districts: true,
    },
    layerOptions: {
      transit: { visibleModes: ['Bus'] },
      buildings: { visibleCategories: ['residential'], colorByCategory: false },
      districts: { showNameOnMap: false, showParkAreas: false },
      terrain: {
        showContourLines: true,
        showColorRelief: true,
        showHillshade: true,
      },
      basemap: { showGrid: false },
    },
    transitDimming: false,
    watermarkVisible: false,
    camera: { longitude: 0, latitude: 0, zoom: 5, bearing: 0, pitch: 0 },
    extent: { minX: -8640, maxX: 8640, minZ: -8640, maxZ: 8640 },
    surface,
    request: {
      format: 'png-2x',
      area: 'viewport',
      background: 'transparent',
      fileName: 'snapshot',
      presentation: {
        showCityName: false,
        showVellumLogo: false,
        showSourceFile: false,
        showGeneratedAt: false,
        showDistrictNames: false,
        showParkNames: false,
        showLayerLegend: false,
        showRoadLegend: false,
        showTransitLegend: false,
        showElevationLegend: false,
        showScaleBar: false,
        showOrientation: false,
        showSummary: false,
      },
    },
  });
}

function makeSession(): ExportSession {
  return {
    sessionId: 'session-test',
    mode: 'legacy-png',
    maxChunkBytes: 1024,
    maxInFlight: 1,
  };
}

function makeSink(overrides: Partial<ExportSink> = {}): ExportSink {
  return {
    begin: vi.fn().mockResolvedValue(makeSession()),
    append: vi.fn().mockResolvedValue({
      sessionId: 'session-test',
      sequence: 0,
      acceptedBytes: 4,
      completedUnits: 1,
    }),
    finish: vi.fn().mockResolvedValue({
      filePath: '/tmp/export.png',
      folderPath: '/tmp',
    } satisfies ExportReceipt),
    cancel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('LegacyRasterExporter', () => {
  it('captura el snapshot una vez y entrega un único chunk PNG completo', async () => {
    const capture = vi
      .fn()
      .mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
    const sink = makeSink();
    const exporter = new LegacyRasterExporter(capture);

    await exporter.export(makeSnapshot(), sink, new AbortController().signal);

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(
      expect.anything(),
      { scale: 2, area: 'viewport', background: 'transparent' },
      expect.any(AbortSignal),
    );
    expect(sink.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'legacy-png',
        outputWidth: 800,
        outputHeight: 600,
        expectedTiles: 1,
      }),
    );
    const chunk = vi.mocked(sink.append).mock.calls[0]?.[1] as RasterTileChunk;
    expect(chunk).toMatchObject({
      sequence: 0,
      tileX: 0,
      tileY: 0,
      usefulRect: { x: 0, y: 0, width: 800, height: 600 },
      renderRect: { x: 0, y: 0, width: 800, height: 600 },
    });
    expect(chunk.encodedPng).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(sink.finish).toHaveBeenCalledWith(makeSession());
  });

  it('rechaza una superficie por encima de 64M píxeles antes de capturar', async () => {
    const capture = vi.fn();
    const sink = makeSink();
    const exporter = new LegacyRasterExporter(capture);

    await expect(
      exporter.export(
        makeSnapshot({ width: 8_001, height: 8_001 }),
        sink,
        new AbortController().signal,
      ),
    ).rejects.toThrow('pixels');

    expect(capture).not.toHaveBeenCalled();
    expect(sink.begin).not.toHaveBeenCalled();
  });

  it('cancela la sesión si append falla y no intenta finalizarla', async () => {
    const sink = makeSink({
      append: vi.fn().mockRejectedValue(new Error('append failed')),
    });
    const exporter = new LegacyRasterExporter(() =>
      Promise.resolve(new Uint8Array([1])),
    );

    await expect(
      exporter.export(makeSnapshot(), sink, new AbortController().signal),
    ).rejects.toThrow('append failed');

    expect(sink.cancel).toHaveBeenCalledWith(makeSession(), 'sink-failed');
    expect(sink.finish).not.toHaveBeenCalled();
  });

  it('honra abort antes de reservar la superficie temporal', async () => {
    const controller = new AbortController();
    controller.abort();
    const capture = vi.fn();
    const sink = makeSink();
    const exporter = new LegacyRasterExporter(capture);

    await expect(
      exporter.export(makeSnapshot(), sink, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(capture).not.toHaveBeenCalled();
    expect(sink.begin).not.toHaveBeenCalled();
  });
});
