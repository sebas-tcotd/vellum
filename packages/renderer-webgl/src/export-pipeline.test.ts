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

  it('isolates every captured field, not just the ones read by the map', () => {
    const input = snapshotInput();
    const snapshot = createExportSnapshot(input);

    input.layerOptions.transit.visibleModes = ['Train'];
    (input.extent as { minX: number }).minX = 0;
    (input.surface as { width: number }).width = 1;

    expect(snapshot.style.terrain.base).toBe('#000000');
    expect(snapshot.layerOptions.transit.visibleModes).toEqual(['Bus']);
    expect(snapshot.extent.minX).toBe(-8640);
    expect(snapshot.surface.width).toBe(800);
    expect(snapshot.transitDimming).toBe(true);
    expect(snapshot.watermarkVisible).toBe(false);
    expect(Object.isFrozen(snapshot.layerOptions.transit)).toBe(true);
    expect(Object.isFrozen(snapshot.extent)).toBe(true);
  });

  it('clones non-serializable style values instead of corrupting them', () => {
    const resolve = (): string => 'live';
    const style = {
      terrain: { base: '#000000' },
      resolve,
      lookup: new Map([['water', '#0000ff']]),
      stamp: new Date(0),
      tags: new Set(['a']),
    } as unknown as RenderStyleParams;

    const snapshot = createExportSnapshot({ ...snapshotInput(), style });
    const captured = snapshot.style as unknown as {
      resolve: () => string;
      lookup: Map<string, string>;
      stamp: Date;
      tags: Set<string>;
    };

    expect(captured.lookup.get('water')).toBe('#0000ff');
    expect(captured.stamp.getTime()).toBe(0);
    expect(captured.tags.has('a')).toBe(true);
    expect(captured.resolve()).toBe('live');
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
    expect(
      evaluateTiledCapability(
        { ...capableReport, maxCanvasSize: Number.NaN },
        { width: 1, height: 1 },
      ),
    ).toEqual({ eligible: false, reason: 'gpu' });
  });

  it('rejects a surface beyond the 1e9 logical-pixel budget', () => {
    const roomyReport: CapabilityReport = {
      ...capableReport,
      maxTextureSize: 40_000,
      maxRenderbufferSize: 40_000,
      maxViewportDims: [40_000, 40_000],
      maxCanvasSize: 40_000,
    };

    // Both dimensions fit maxCanvasSize, but 40000 x 40000 = 1.6e9 pixels
    // exceeds the tiled budget from ARCHITECTURE-SPINE AD-10.
    expect(
      evaluateTiledCapability(roomyReport, { width: 40_000, height: 40_000 }),
    ).toEqual({ eligible: false, reason: 'dimensions' });
    expect(
      evaluateTiledCapability(roomyReport, { width: 30_000, height: 30_000 }),
    ).toEqual({ eligible: true });
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

  it('degrades to a typed report when the driver throws while probing', async () => {
    const surface = document.createElement('canvas');
    surface.getContext = () => {
      throw new Error('driver reset');
    };

    const report = await probeCapabilities({ createSurface: () => surface });

    expect(report.contextType).toBe('unknown');
    expect(report.webgl2).toBe(false);
    expect(report.unknownReason).toBe('webgl-probe-failed');
    expect(document.body.contains(surface)).toBe(false);
  });

  it('keeps the probe surface out of layout while it is attached', async () => {
    const surface = document.createElement('canvas');
    surface.getContext = () => null;

    await probeCapabilities({ createSurface: () => surface });

    expect(surface.style.position).toBe('fixed');
    expect(surface.style.visibility).toBe('hidden');
  });

  it('honours a short toBlob timeout and reports why it is unknown', async () => {
    const surface = document.createElement('canvas');
    surface.getContext = () => null;
    // Never invokes the callback: only the timeout can settle this probe.
    surface.toBlob = () => undefined;

    const startedAt = Date.now();
    const report = await probeCapabilities({
      createSurface: () => surface,
      toBlobTimeoutMs: 10,
    });

    expect(report.toBlob).toBe('unknown');
    expect(report.unknownReason).toBeDefined();
    expect(Date.now() - startedAt).toBeLessThan(1000);
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
