import {
  createExportSnapshot,
  NEUTRAL_MARGINALIA_LABELS,
  type ExportSession,
  type ExportSink,
  type ExportSnapshot,
  type ExportReceipt,
  type RasterTileChunk,
} from '@vellum/core';
import {
  makeCityData,
  makeMarginaliaLabels,
  makePresentationOptions,
  makeRenderStyle,
} from '@vellum/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { LegacyRasterExporter } from './legacy-raster-exporter';

function makeSnapshot(surface = { width: 800, height: 600 }): ExportSnapshot {
  return createExportSnapshot({
    snapshotId: 'snapshot-test',
    cityData: makeCityData(),
    style: makeRenderStyle(),
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
      transit: { visibleModes: ['Bus'], showConfirmedTransfers: true },
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
        showRoadLegend: false,
        showTransitLegend: false,
        showElevationLegend: false,
        showScaleBar: false,
        showOrientation: false,
        showSummary: false,
        showSourceNote: false,
        author: '',
        corner: 'bottom-left',
      },
      labels: NEUTRAL_MARGINALIA_LABELS,
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
      {
        scale: 2,
        area: 'viewport',
        background: 'transparent',
        marginalia: null,
      },
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

  it('captures a target-resolution full-map snapshot at density 1', async () => {
    const capture = vi.fn().mockResolvedValue(new Uint8Array([1]));
    const sink = makeSink();
    const exporter = new LegacyRasterExporter(capture);
    const snapshot = {
      ...makeSnapshot({ width: 6000, height: 6000 }),
      request: {
        ...makeSnapshot().request,
        area: 'full-map' as const,
        format: 'png-1x' as const,
        targetLongEdge: 6000 as const,
      },
    };

    await exporter.export(snapshot, sink, new AbortController().signal);

    expect(capture).toHaveBeenCalledWith(
      expect.anything(),
      {
        scale: 1,
        area: 'full-map',
        background: 'transparent',
        marginalia: null,
      },
      expect.any(AbortSignal),
    );
  });

  it('pinta la marginalia del snapshot sobre la captura antes de codificarla, con la fuente ya cargada', async () => {
    const order: string[] = [];
    const loadFont = vi.fn(async () => {
      order.push('font');
      return true;
    });
    const capture = vi.fn(async () => {
      order.push('capture');
      return new Uint8Array([1]);
    });
    const base = makeSnapshot();
    const snapshot = createExportSnapshot({
      ...base,
      request: {
        ...base.request,
        presentation: makePresentationOptions({
          showCityName: true,
          corner: 'top-right',
        }),
        labels: makeMarginaliaLabels(),
      },
    });
    const exporter = new LegacyRasterExporter(capture, loadFont);

    await exporter.export(snapshot, makeSink(), new AbortController().signal);

    expect(order).toEqual(['font', 'capture']);
    const options = capture.mock.calls[0]![1 as never] as {
      marginalia: {
        rect: unknown;
        layout: { bounds: { x: number }; surface: unknown };
      };
    };
    expect(options.marginalia.rect).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    expect(options.marginalia.layout.surface).toEqual({
      width: 800,
      height: 600,
    });
    expect(options.marginalia.layout.bounds.x).toBeGreaterThan(400);
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
