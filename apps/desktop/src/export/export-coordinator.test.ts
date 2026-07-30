import {
  createExportSnapshot,
  type ExportRequest,
  type ExportSink,
  type ExportSnapshot,
} from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';
import { LegacyRasterExporter } from '@vellum/renderer-webgl';
import { describe, expect, it, vi } from 'vitest';
import { ExportCoordinator, ExportCapabilityError } from './export-coordinator';

const request = {
  format: 'png-1x',
  area: 'full-map',
  background: 'white',
  fileName: 'map',
  presentation: {} as ExportRequest['presentation'],
} satisfies ExportRequest;

function snapshot(surface = { width: 400, height: 300 }): ExportSnapshot {
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
    camera: { longitude: 0, latitude: 0, zoom: 5, bearing: 0, pitch: 0 },
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
});
