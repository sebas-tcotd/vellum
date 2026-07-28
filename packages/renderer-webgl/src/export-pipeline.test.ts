import {
  createExportSnapshot,
  evaluateTiledCapability,
  type CapabilityReport,
  type ExportSnapshotInput,
  type RenderStyleParams,
} from '@vellum/core';
import { makeCityData } from '@vellum/core/testing';
import { describe, expect, it } from 'vitest';
import { probeCapabilities } from './capability-probe';

function snapshotInput(): ExportSnapshotInput {
  const style = {
    terrain: { base: '#000000' },
  } as unknown as RenderStyleParams;
  return {
    snapshotId: 'snapshot-test',
    cityData: makeCityData(),
    style,
    activeLayers: {
      terrain: true,
      basemap: true,
      roads: true,
      transit: false,
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
    transitDimming: true,
    watermarkVisible: false,
    camera: { longitude: 0, latitude: 0, zoom: 5, bearing: 0, pitch: 0 },
    extent: { minX: -8640, maxX: 8640, minZ: -8640, maxZ: 8640 },
    surface: { width: 800, height: 600 },
    request: {
      format: 'png-2x',
      area: 'viewport',
      background: 'transparent',
      fileName: 'baseline',
      presentation: {
        showCityName: true,
        showVellumLogo: true,
        showSourceFile: false,
        showGeneratedAt: false,
        showDistrictNames: true,
        showParkNames: false,
        showLayerLegend: true,
        showRoadLegend: true,
        showTransitLegend: false,
        showElevationLegend: true,
        showScaleBar: true,
        showOrientation: true,
        showSummary: false,
      },
    },
  };
}

const capableReport: CapabilityReport = {
  contextType: 'webgl2',
  webgl2: true,
  maxTextureSize: 8192,
  maxRenderbufferSize: 8192,
  maxViewportDims: [8192, 8192],
  maxCanvasSize: 8192,
  toBlob: true,
  memoryAvailableBytes: 'unknown',
};

describe('export pipeline baseline contracts', () => {
  it('retains CityData by reference and isolates subsequent input mutations', () => {
    const input = snapshotInput();
    const snapshot = createExportSnapshot(input);

    input.activeLayers.roads = false;
    (input.camera as { zoom: number }).zoom = 12;
    input.style.terrain.base = '#ffffff';
    (input.request.presentation as { showSummary: boolean }).showSummary = true;

    expect(snapshot.cityData).toBe(input.cityData);
    expect(snapshot.activeLayers.roads).toBe(true);
    expect(snapshot.camera.zoom).toBe(5);
    expect(snapshot.style.terrain.base).not.toBe('#ffffff');
    expect(snapshot.request.presentation.showSummary).toBe(false);
    expect(Object.isFrozen(snapshot.style.terrain)).toBe(true);
    expect(Object.isFrozen(snapshot.cityData)).toBe(false);
  });

  it('generates a non-empty id when the caller supplies an empty id', () => {
    const input: ExportSnapshotInput = {
      ...snapshotInput(),
      snapshotId: '   ',
    };

    const snapshot = createExportSnapshot(input);

    expect(snapshot.snapshotId).not.toBe('');
    expect(snapshot.snapshotId).not.toMatch(/^\s+$/);
  });

  it('returns a typed technical decision without selecting a fallback', () => {
    expect(
      evaluateTiledCapability(capableReport, { width: 4096, height: 4096 }),
    ).toEqual({ eligible: true });
    expect(
      evaluateTiledCapability(capableReport, { width: 9000, height: 1 }),
    ).toEqual({ eligible: false, reason: 'dimensions' });
    expect(
      evaluateTiledCapability(capableReport, { width: 1, height: 1 }, false),
    ).toEqual({ eligible: false, reason: 'flag' });
  });

  it('reports unavailable WebGL without reading user-agent or leaking app data', async () => {
    const surface = document.createElement('canvas');
    surface.getContext = () => null;
    const report = await probeCapabilities({
      createSurface: () => surface,
      readMemory: () => 'unknown',
    });

    expect(report.contextType).toBe('unknown');
    expect(report.webgl2).toBe(false);
    expect(report.unknownReason).toBe('webgl-context-unavailable');
    expect(report).not.toHaveProperty('userAgent');
    expect(report).not.toHaveProperty('cityData');
    expect(document.body.contains(surface)).toBe(false);
  });

  it('still completes cleanup when the temporary surface rejects removal', async () => {
    const surface = document.createElement('canvas');
    surface.getContext = () => null;
    surface.remove = () => {
      throw new Error('already detached');
    };

    await expect(
      probeCapabilities({ createSurface: () => surface }),
    ).resolves.toMatchObject({ unknownReason: 'webgl-context-unavailable' });
  });
});
