import {
  createExportSnapshot,
  type CapabilityReport,
  type ExportRequest,
  type ExportSink,
  type ExportSnapshot,
  type RasterExportPort,
} from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';
import { LegacyRasterExporter } from '@vellum/renderer-webgl';
import { describe, expect, it, vi } from 'vitest';
import { ExportCoordinator, ExportCapabilityError } from './export-coordinator';

const eligibleCapability: CapabilityReport = {
  contextType: 'webgl2',
  webgl2: true,
  maxTextureSize: 8192,
  maxRenderbufferSize: 8192,
  maxViewportDims: [8192, 8192],
  maxCanvasSize: 8192,
  toBlob: true,
  memoryAvailableBytes: 'unknown',
};

const request = {
  format: 'png-1x',
  area: 'full-map',
  background: 'white',
  fileName: 'map',
  presentation: {} as ExportRequest['presentation'],
} satisfies ExportRequest;

function snapshot(
  surface = { width: 400, height: 300 },
  camera = { longitude: 0, latitude: 0, zoom: 5, bearing: 0, pitch: 0 },
): ExportSnapshot {
  return createExportSnapshot({
    snapshotId: 'snapshot-coordinator',
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
    camera,
    extent: { minX: -8640, maxX: 8640, minZ: -8640, maxZ: 8640 },
    surface,
    request,
  });
}

describe('ExportCoordinator', () => {
  it('selecciona legacy de forma determinística y devuelve el receipt del sink', async () => {
    const receipt = { filePath: '/tmp/map.png', folderPath: '/tmp' };
    const sink: ExportSink = {
      begin: vi.fn().mockResolvedValue({
        sessionId: 'session-test',
        mode: 'legacy-png',
        maxChunkBytes: 1024,
        maxInFlight: 1,
      }),
      append: vi.fn().mockResolvedValue({
        sessionId: 'session-test',
        sequence: 0,
        acceptedBytes: 1,
        completedUnits: 1,
      }),
      finish: vi.fn().mockResolvedValue(receipt),
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const exporter = new LegacyRasterExporter(async () => new Uint8Array([1]));
    const coordinator = new ExportCoordinator(exporter, sink);

    await expect(coordinator.capabilities(request)).resolves.toEqual({
      legacy: { eligible: true },
      tiled: { eligible: false, reason: 'flag' },
    });
    await expect(coordinator.export(snapshot())).resolves.toEqual(receipt);
    expect(sink.begin).toHaveBeenCalledOnce();
    expect(sink.finish).toHaveBeenCalledOnce();
  });

  it('rechaza límites legacy sin reducir escala ni área', async () => {
    const capture = vi.fn(async () => new Uint8Array([1]));
    const exporter = new LegacyRasterExporter(capture);
    const sink: ExportSink = {
      begin: vi.fn(),
      append: vi.fn(),
      finish: vi.fn(),
      cancel: vi.fn(),
    };
    const coordinator = new ExportCoordinator(exporter, sink);

    await expect(
      coordinator.export(snapshot({ width: 8_001, height: 8_001 })),
    ).rejects.toBeInstanceOf(ExportCapabilityError);
    expect(capture).not.toHaveBeenCalled();
  });

  it('keeps tiled ineligible (reason "flag") when no tiled route is paired', async () => {
    const coordinator = new ExportCoordinator(
      new LegacyRasterExporter(async () => new Uint8Array([1])),
      {
        begin: vi.fn(),
        append: vi.fn(),
        finish: vi.fn(),
        cancel: vi.fn(),
      },
    );

    await expect(coordinator.capabilities(request)).resolves.toEqual({
      legacy: { eligible: true },
      tiled: { eligible: false, reason: 'flag' },
    });
  });

  it('keeps tiled ineligible (reason "flag") when a tiled route is paired but not enabled', async () => {
    const tiledExporter: RasterExportPort = {
      mode: 'tiled-png',
      export: vi.fn(),
    };
    const receipt = { filePath: '/tmp/legacy.png', folderPath: '/tmp' };
    const legacySink: ExportSink = {
      begin: vi.fn().mockResolvedValue({
        sessionId: 'legacy-session',
        mode: 'legacy-png',
        maxChunkBytes: 1024,
        maxInFlight: 1,
      }),
      append: vi.fn().mockResolvedValue({
        sessionId: 'legacy-session',
        sequence: 0,
        acceptedBytes: 1,
        completedUnits: 1,
      }),
      finish: vi.fn().mockResolvedValue(receipt),
      cancel: vi.fn(),
    };
    const coordinator = new ExportCoordinator(
      new LegacyRasterExporter(async () => new Uint8Array([1])),
      legacySink,
      {
        exporter: tiledExporter,
        sink: {
          begin: vi.fn(),
          append: vi.fn(),
          finish: vi.fn(),
          cancel: vi.fn(),
        },
        capability: eligibleCapability,
        enabled: false,
      },
    );

    await expect(coordinator.capabilities(request)).resolves.toEqual({
      legacy: { eligible: true },
      tiled: { eligible: false, reason: 'flag' },
    });
    await expect(coordinator.export(snapshot())).resolves.toEqual(receipt);
    expect(tiledExporter.export).not.toHaveBeenCalled();
  });

  it('selects the tiled route, threading signal and onProgress, when explicitly enabled and eligible', async () => {
    const receipt = { filePath: '/tmp/tiled.png', folderPath: '/tmp' };
    const tiledSink: ExportSink = {
      begin: vi.fn().mockResolvedValue({
        sessionId: 'tiled-session',
        mode: 'tiled-png',
        maxChunkBytes: 1024,
        maxInFlight: 1,
      }),
      append: vi.fn(),
      finish: vi.fn().mockResolvedValue(receipt),
      cancel: vi.fn(),
    };
    const tiledExporter: RasterExportPort = {
      mode: 'tiled-png',
      export: vi.fn(async (snap, sink, _signal, onProgress) => {
        const session = await sink.begin({
          mode: 'tiled-png',
          snapshotId: snap.snapshotId,
          request: snap.request,
          outputWidth: snap.surface.width,
          outputHeight: snap.surface.height,
          expectedTiles: 1,
        });
        onProgress?.({
          snapshotId: snap.snapshotId,
          sessionId: session.sessionId,
          mode: 'tiled-png',
          phase: 'finishing',
          completedUnits: 1,
          totalUnits: 1,
          percent: 100,
        });
        await sink.finish(session);
      }),
    };
    const legacyExporter = new LegacyRasterExporter(async () => {
      throw new Error('legacy must not be invoked when tiled is selected');
    });
    const coordinator = new ExportCoordinator(
      legacyExporter,
      { begin: vi.fn(), append: vi.fn(), finish: vi.fn(), cancel: vi.fn() },
      {
        exporter: tiledExporter,
        sink: tiledSink,
        capability: eligibleCapability,
        enabled: true,
      },
    );

    await expect(coordinator.capabilities(request)).resolves.toEqual({
      legacy: { eligible: true },
      tiled: { eligible: true },
    });

    const onProgress = vi.fn();
    const controller = new AbortController();
    await expect(
      coordinator.export(snapshot(), controller.signal, onProgress),
    ).resolves.toEqual(receipt);
    expect(tiledExporter.export).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      controller.signal,
      onProgress,
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'finishing', completedUnits: 1 }),
    );
  });

  it('falls back to legacy at export() time when the real snapshot has a bearing/pitch the tiled plan rejects, even though the device is generically eligible', async () => {
    const receipt = { filePath: '/tmp/legacy.png', folderPath: '/tmp' };
    const legacySink: ExportSink = {
      begin: vi.fn().mockResolvedValue({
        sessionId: 'legacy-session',
        mode: 'legacy-png',
        maxChunkBytes: 1024,
        maxInFlight: 1,
      }),
      append: vi.fn().mockResolvedValue({
        sessionId: 'legacy-session',
        sequence: 0,
        acceptedBytes: 1,
        completedUnits: 1,
      }),
      finish: vi.fn().mockResolvedValue(receipt),
      cancel: vi.fn(),
    };
    const tiledExporter: RasterExportPort = {
      mode: 'tiled-png',
      export: vi.fn(),
    };
    const coordinator = new ExportCoordinator(
      new LegacyRasterExporter(async () => new Uint8Array([1])),
      legacySink,
      {
        exporter: tiledExporter,
        sink: {
          begin: vi.fn(),
          append: vi.fn(),
          finish: vi.fn(),
          cancel: vi.fn(),
        },
        capability: eligibleCapability,
        enabled: true,
      },
    );

    // Device-level capabilities() still says tiled is eligible — it has no
    // way to know this specific operation's camera yet.
    await expect(coordinator.capabilities(request)).resolves.toEqual({
      legacy: { eligible: true },
      tiled: { eligible: true },
    });

    const tiltedSnapshot = snapshot(
      { width: 400, height: 300 },
      { longitude: 0, latitude: 0, zoom: 5, bearing: 45, pitch: 0 },
    );
    await expect(coordinator.export(tiltedSnapshot)).resolves.toEqual(receipt);
    expect(tiledExporter.export).not.toHaveBeenCalled();
  });
});
