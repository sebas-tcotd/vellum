import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import maplibregl from 'maplibre-gl';
import { MapLibreRenderer } from './map-libre-renderer';
import { makeCityData } from '@vellum/core/testing';
import type {
  ExportRequest,
  RenderStyleParams,
  RoadCategoryColors,
} from '@vellum/core';
import {
  HEAVY_SOURCE_MAX_ZOOM,
  TRANSIT_DIM_FACTOR,
} from './constants/layer.constants';
import { buildBuildingColorExpression } from './expressions/building-color';
import { buildParkColorExpression } from './expressions/park-color';
import { resolveAirshipColor } from './expressions/transit-color';
import { resolveColors } from './style-adapter';

// ─── Mock maplibre-gl ─────────────────────────────────────────────────────────
// vi.mock() is hoisted; use vi.hoisted() so mockMap is available in the factory.

const mockMap = vi.hoisted(() => ({
  isStyleLoaded: vi.fn(() => true),
  // Second gate in `whenStyleReady`: false here keeps `once('load')` the only
  // path once `isStyleLoaded` is stubbed false.
  loaded: vi.fn(() => false),
  resize: vi.fn(),
  addSource: vi.fn(),
  getSource: vi.fn(() => undefined),
  removeSource: vi.fn(),
  addLayer: vi.fn(),
  getLayer: vi.fn(() => undefined),
  removeLayer: vi.fn(),
  setLayoutProperty: vi.fn(),
  setPaintProperty: vi.fn(),
  setFilter: vi.fn(),
  fitBounds: vi.fn(),
  remove: vi.fn(),
  once: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  flyTo: vi.fn(),
  queryRenderedFeatures: vi.fn(() => []),
  getBounds: vi.fn(() => ({
    getWest: vi.fn(() => -0.08),
    getEast: vi.fn(() => 0.08),
    getNorth: vi.fn(() => 0.08),
    getSouth: vi.fn(() => -0.08),
  })),
  getCanvas: vi.fn(() => ({ style: { cursor: '' } })),
  triggerRepaint: vi.fn(),
  setMaxBounds: vi.fn(),
  setMinZoom: vi.fn(),
  setMaxZoom: vi.fn(),
  getZoom: vi.fn(() => 12),
  getBearing: vi.fn(() => 25),
  getCenter: vi.fn(() => ({ lng: 1, lat: 2 })),
  getPitch: vi.fn(() => 3),
  project: vi.fn((coordinate: [number, number] | { lng: number }) => ({
    x:
      ((Array.isArray(coordinate) ? coordinate[0] : coordinate.lng) + 0.08) *
      3200,
    y: 500,
  })),
  unproject: vi.fn((point: [number, number] | { x: number }) => ({
    lng: (Array.isArray(point) ? point[0] : point.x) / 3200 - 0.08,
    lat: 0,
  })),
  getMinZoom: vi.fn(() => 0),
  getMaxZoom: vi.fn(() => 18),
}));

vi.mock('maplibre-gl', () => ({
  default: {
    // Regular function (not arrow) so `new Map(...)` works as a constructor.
    Map: vi.fn().mockImplementation(function () {
      return mockMap;
    }),
    // The DEM tile protocol registers itself on the module default export.
    addProtocol: vi.fn(),
    removeProtocol: vi.fn(),
    // Read at module scope to raise the default worker count off MapLibre's 1.
    setWorkerCount: vi.fn(),
    getWorkerCount: vi.fn(() => 4),
  },
}));

// jsdom has neither OffscreenCanvas nor createImageBitmap; the DEM protocol is
// exercised by its own unit test instead of through the renderer.
vi.mock('./sources/dem-protocol', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sources/dem-protocol')>()),
  registerDemProtocol: vi.fn(async () => undefined),
  unregisterDemProtocol: vi.fn(),
}));

// ─── Test theme ───────────────────────────────────────────────────────────────

function roadColors(fill: string, casing: string): RoadCategoryColors {
  return { fill: fill as `#${string}`, casing: casing as `#${string}` };
}

const MOCK_STYLE: RenderStyleParams = {
  mapBackground: '#f7f6f1',
  mapFrame: '#f5f0e6',
  terrain: {
    base: '#f7f6f1',
    low: '#95ae79',
    mid: '#deddbe',
    high: '#c4a06a',
  },
  water: '#6db8b7',
  contourLine: '#000000',
  forests: '#14592a',
  transitBackground: '#1a1a2e',
  roads: {
    highway: { generic: roadColors('#a098b0', '#7d748e') },
    largeArterial: { generic: roadColors('#d2938e', '#b8756e') },
    mediumArterial: { generic: roadColors('#d4a882', '#b48a69') },
    local: {
      generic: roadColors('#e4e1d1', '#8a8278'),
      gravel: roadColors('#e0d5c1', '#c4b89e'),
    },
    pedestrian: {
      path: roadColors('#7a6e60', '#5d5550'),
      way: roadColors('#8b7d6b', '#8b7d6b'),
      street: roadColors('#7a6e60', '#5d5550'),
    },
    rail: {
      train: roadColors('#eceff1', '#455a64'),
      metro: roadColors('#eceff1', '#455a64'),
    },
    ferry: roadColors('#1A5276', '#1A5276'),
  },
  buildings: {
    residential: {
      low: { fill: '#c8bfb5', stroke: '#a09585' },
      high: { fill: '#c8bfb5', stroke: '#a09585' },
      selfSufficient: { fill: '#c8bfb5', stroke: '#a09585' },
    },
    commercial: {
      low: { fill: '#c8bfb5', stroke: '#a09585' },
      high: { fill: '#c8bfb5', stroke: '#a09585' },
      leisure: { fill: '#c8bfb5', stroke: '#a09585' },
      tourism: { fill: '#c8bfb5', stroke: '#a09585' },
      organic: { fill: '#c8bfb5', stroke: '#a09585' },
    },
    office: {
      generic: { fill: '#c8bfb5', stroke: '#a09585' },
      tech: { fill: '#c8bfb5', stroke: '#a09585' },
      financial: { fill: '#c8bfb5', stroke: '#a09585' },
    },
    industry: {
      generic: { fill: '#c8bfb5', stroke: '#a09585' },
      forestry: { fill: '#c8bfb5', stroke: '#a09585' },
      ore: { fill: '#c8bfb5', stroke: '#a09585' },
      oil: { fill: '#c8bfb5', stroke: '#a09585' },
      farming: { fill: '#c8bfb5', stroke: '#a09585' },
    },
    civic: {
      publicTransport: { fill: '#c8bfb5', stroke: '#a09585' },
      education: { fill: '#c8bfb5', stroke: '#a09585' },
      services: { fill: '#c8bfb5', stroke: '#a09585' },
    },
    none: { fill: '#c8bfb5', stroke: '#a09585' },
  },
  districts: { fill: '#b4a08c', label: '#ffffff' },
  grid: { color: '#555555', opacity: 0.25, width: 1, dasharray: [4, 4] },
  parkAreas: {
    generic: '#95ae79',
    university: '#c4a06a',
    tradeSchool: '#d2938e',
    industry: '#a098b0',
    forestry: '#14592a',
  },
};

const ALL_LAYERS_VISIBLE = {
  terrain: true,
  basemap: true,
  roads: true,
  transit: true,
  buildings: true,
  forests: true,
  districts: true,
};

const baseSnapshotRequest = {
  format: 'png-1x',
  area: 'viewport',
  background: 'white',
  fileName: 'baseline',
  presentation: {
    showCityName: true,
    showVellumLogo: false,
    showSourceFile: false,
    showGeneratedAt: false,
    showDistrictNames: true,
    showParkNames: false,
    showLayerLegend: true,
    showRoadLegend: true,
    showTransitLegend: true,
    showElevationLegend: true,
    showScaleBar: true,
    showOrientation: true,
    showSummary: false,
  },
} as const satisfies ExportRequest;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRenderer(): MapLibreRenderer {
  const container = document.createElement('div');
  return new MapLibreRenderer(container, MOCK_STYLE);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MapLibreRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset getLayer to return undefined (layer not yet added) by default
    mockMap.getLayer.mockReturnValue(undefined);
    mockMap.getSource.mockReturnValue(undefined);
    mockMap.isStyleLoaded.mockReturnValue(true);
    mockMap.getZoom.mockReturnValue(12);
    // `clearAllMocks` wipes call records but keeps implementations, so a canvas
    // or bounds installed by one test would silently leak into the next ones.
    mockMap.getCanvas.mockReturnValue({ style: { cursor: '' } } as never);
    mockMap.getBounds.mockReturnValue({
      getWest: () => -0.08,
      getEast: () => 0.08,
      getNorth: () => 0.08,
      getSouth: () => -0.08,
    } as never);
  });

  it.skip('calls addSource for each layer when render() is called', async () => {
    const renderer = makeRenderer();
    const city = makeCityData();
    await renderer.render(city, { activeLayers: ALL_LAYERS_VISIBLE });

    const sourceCalls = (mockMap.addSource as Mock).mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(sourceCalls).toContain('terrain');
    expect(sourceCalls).toContain('base-water-source');
    expect(sourceCalls).toContain('roads');
    expect(sourceCalls).toContain('transit');
    expect(sourceCalls).toContain('transit-stops');
    expect(sourceCalls).toContain('buildings');
    expect(sourceCalls).toContain('forests');
    expect(sourceCalls).toContain('districts');
    // 8 named sources (background is handled as a style layer, not a geojson source)
    expect(mockMap.addSource).toHaveBeenCalledTimes(8);
  });

  it.skip('calls addLayer for each visible layer on first render', async () => {
    const renderer = makeRenderer();
    const city = makeCityData();
    await renderer.render(city, { activeLayers: ALL_LAYERS_VISIBLE });

    const layerIds = (mockMap.addLayer as Mock).mock.calls.map(
      (call: unknown[]) => (call[0] as { id: string }).id,
    );
    expect(layerIds).toContain('terrain-fill');
    expect(layerIds).toContain('water-fill');
    expect(layerIds).toContain('roads-casing');
    expect(layerIds).toContain('roads-fill');
    expect(layerIds).toContain('transit-line');
    expect(layerIds).toContain('transit-stops');
    expect(layerIds).toContain('buildings-fill');
    expect(layerIds).toContain('buildings-outline');
    expect(layerIds).toContain('forests-circles');
    expect(layerIds).toContain('districts-points');
  });

  // Regression: MapLibre sets `workerCount` to 1 on anything it does not
  // recognise as Safari, and Tauri's WKWebView fails that check — so every
  // GeoJSON source was sliced through a single worker.
  it('raises the worker pool above MapLibre default of one, before the map exists', async () => {
    const maplibregl = (await import('maplibre-gl')).default;
    makeRenderer();

    expect(maplibregl.setWorkerCount).toHaveBeenCalledOnce();
    const [count] = (maplibregl.setWorkerCount as Mock).mock.calls[0] as [
      number,
    ];
    expect(count).toBeGreaterThan(1);
    // The pool is built on first acquire, which is inside the Map constructor.
    expect(
      (maplibregl.setWorkerCount as Mock).mock.invocationCallOrder[0],
    ).toBeLessThan((maplibregl.Map as Mock).mock.invocationCallOrder[0]!);
  });

  // Regression: a GeoJSON source defaults to `maxzoom` 18, so MapLibre keeps
  // slicing fresh tiles at every detail zoom. These three carry ~2/3 of the
  // slicing cost; capping them lets panning re-use overzoomed tiles instead.
  it('caps the heaviest GeoJSON sources so detail-zoom panning stops re-slicing', async () => {
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    const byId = new Map(
      (mockMap.addSource as Mock).mock.calls.map(
        (call) => [call[0] as string, call[1] as { maxzoom?: number }] as const,
      ),
    );
    for (const id of ['buildings', 'roads', 'forests']) {
      expect(byId.get(id)?.maxzoom).toBe(HEAVY_SOURCE_MAX_ZOOM);
    }
  });

  it('calls map.fitBounds after render', async () => {
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    expect(mockMap.fitBounds).toHaveBeenCalledOnce();
  });

  // Regression: layer registration order is z-order, so a single unguarded throw
  // used to drop every later layer *and* skip the camera fit — the map opened
  // zoomed all the way out with no roads, no frame and no console output.
  it('keeps registering later layers and still fits the camera when one layer step throws', async () => {
    mockMap.addLayer.mockImplementation((layer: { id: string }) => {
      if (layer.id === 'roads-fill') throw new Error('boom');
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    const addedIds = mockMap.addLayer.mock.calls.map(
      (call) => (call[0] as { id: string }).id,
    );
    // `map-frame` is registered five steps after roads: reaching it proves the
    // stack was not truncated at the failure.
    expect(addedIds).toContain('map-frame');
    expect(mockMap.fitBounds).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('never sets a background-pattern, which would silently discard background-color', async () => {
    // Regression: MapLibre/Mapbox background layers render `background-pattern`
    // instead of `background-color` once a pattern is set, not composited on
    // top of it. A decorative grid texture used to be attached here and made
    // every theme color and every export background (white/dark/transparent)
    // render as the pattern's own mostly-transparent pixels instead.
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    renderer.clear();

    const patternCalls = (mockMap.setPaintProperty as Mock).mock.calls.filter(
      (call: unknown[]) =>
        call[0] === 'background' && call[1] === 'background-pattern',
    );
    expect(patternCalls).toHaveLength(0);
  });

  it('mantiene el drawing buffer sólo en el renderer temporal de exportación', async () => {
    const canvas = {
      style: { cursor: '' },
      clientWidth: 640,
      clientHeight: 480,
      width: 640,
      height: 480,
      toBlob: (callback: (blob: Blob | null) => void) =>
        callback(new Blob([new Uint8Array([137, 80, 78, 71])])),
    };
    mockMap.getCanvas.mockReturnValue(canvas as never);
    mockMap.once.mockImplementation((_event: string, callback: () => void) => {
      callback();
    });
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    const snapshot = renderer.createExportSnapshot(baseSnapshotRequest);
    if (!snapshot) throw new Error('expected a snapshot');

    await expect(
      MapLibreRenderer.captureSnapshotPng(
        snapshot,
        { scale: 1, area: 'full-map', background: 'white' },
        new AbortController().signal,
      ),
    ).resolves.toEqual(new Uint8Array([137, 80, 78, 71]));

    expect(maplibregl.Map).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        canvasContextAttributes: { preserveDrawingBuffer: false },
      }),
    );
    expect(maplibregl.Map).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        canvasContextAttributes: { preserveDrawingBuffer: true },
      }),
    );
    expect(mockMap.once).toHaveBeenCalledWith('idle', expect.any(Function));
  });

  it('rechaza exportaciones que exceden el límite de memoria antes de crear una superficie temporal', async () => {
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 5_000,
      clientHeight: 5_000,
      width: 5_000,
      height: 5_000,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    const snapshot = renderer.createExportSnapshot({
      ...baseSnapshotRequest,
      format: 'png-4x',
    });
    if (!snapshot) throw new Error('expected a snapshot');

    await expect(
      MapLibreRenderer.captureSnapshotPng(
        snapshot,
        { scale: 4, area: 'full-map', background: 'transparent' },
        new AbortController().signal,
      ),
    ).rejects.toThrow('safe limit');
    expect(maplibregl.Map).toHaveBeenCalledTimes(1);
  });

  it('captures an isolated export snapshot from the renderer state', async () => {
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 640,
      clientHeight: 480,
      width: 640,
      height: 480,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    const snapshot = renderer.createExportSnapshot({
      format: 'png-1x',
      area: 'viewport',
      background: 'white',
      fileName: 'baseline',
      presentation: {
        showCityName: true,
        showVellumLogo: false,
        showSourceFile: false,
        showGeneratedAt: false,
        showDistrictNames: true,
        showParkNames: false,
        showLayerLegend: true,
        showRoadLegend: true,
        showTransitLegend: true,
        showElevationLegend: true,
        showScaleBar: true,
        showOrientation: true,
        showSummary: false,
      },
    });

    expect(snapshot).toMatchObject({
      cityData: expect.any(Object),
      camera: { longitude: 1, latitude: 2, zoom: 12, bearing: 25, pitch: 3 },
      surface: { width: 640, height: 480 },
    });
    expect(snapshot).not.toHaveProperty('map');
  });

  it('scales the export surface by the requested density', async () => {
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 640,
      clientHeight: 480,
      width: 640,
      height: 480,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    const snapshot = renderer.createExportSnapshot({
      ...baseSnapshotRequest,
      format: 'png-4x',
      area: 'viewport',
    });

    expect(snapshot?.surface).toEqual({ width: 2560, height: 1920 });
  });

  it('derives the viewport extent from the camera, not the whole map', async () => {
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 640,
      clientHeight: 480,
      width: 640,
      height: 480,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    // A genuinely zoomed-in window. The default mock covers +/-0.08 deg, which
    // is wider than the whole CS1 extent, so it cannot show a viewport crop.
    mockMap.getBounds.mockReturnValueOnce({
      getWest: () => -0.01,
      getEast: () => 0.01,
      getNorth: () => 0.01,
      getSouth: () => -0.01,
    } as never);

    const viewport = renderer.createExportSnapshot({
      ...baseSnapshotRequest,
      area: 'viewport',
    });
    const fullMap = renderer.createExportSnapshot({
      ...baseSnapshotRequest,
      area: 'full-map',
      targetLongEdge: 6000,
    });

    expect(viewport?.extent.minX).toBeGreaterThan(-8640);
    expect(viewport?.extent.maxX).toBeLessThan(8640);
    expect(viewport?.extent).not.toEqual(fullMap?.extent);
    expect(fullMap?.extent).toEqual({
      minX: -8640,
      maxX: 8640,
      minZ: -8640,
      maxZ: 8640,
    });
  });

  it('sizes a full-map surface to the square world extent, not a wide canvas', async () => {
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 1024,
      clientHeight: 655,
      width: 1024,
      height: 655,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    const fullMap = renderer.createExportSnapshot({
      ...baseSnapshotRequest,
      format: 'png-1x',
      area: 'full-map',
      targetLongEdge: 6000,
    });

    // The CS1 world extent is square, so the surface must be square too — a
    // 1024x655 canvas must never letterbox the square world into its shape.
    expect(fullMap?.surface).toEqual({ width: 6000, height: 6000 });
  });

  it('neutralizes bearing and pitch for full-map exports', async () => {
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 1024,
      clientHeight: 655,
      width: 1024,
      height: 655,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    const fullMap = renderer.createExportSnapshot({
      ...baseSnapshotRequest,
      format: 'png-1x',
      area: 'full-map',
      targetLongEdge: 12000,
    });

    expect(fullMap?.camera).toMatchObject({ bearing: 0, pitch: 0 });
    expect(fullMap?.camera).toMatchObject({ longitude: 1, latitude: 2 });
  });

  it('uses targetLongEdge for full-map output instead of the canvas size', async () => {
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 1024,
      clientHeight: 655,
      width: 1024,
      height: 655,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    const fullMap = renderer.createExportSnapshot({
      ...baseSnapshotRequest,
      area: 'full-map',
      targetLongEdge: 12000,
    });

    expect(fullMap?.surface).toEqual({ width: 12000, height: 12000 });
  });

  it('rounds targetLongEdge output for non-square city bounds', async () => {
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 1024,
      clientHeight: 655,
      width: 1024,
      height: 655,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(
      makeCityData({
        bounds: {
          minX: -9000,
          maxX: 9000,
          minZ: -8000,
          maxZ: 8000,
          seaLevel: 40,
        },
      }),
      { activeLayers: ALL_LAYERS_VISIBLE },
    );

    const fullMap = renderer.createExportSnapshot({
      ...baseSnapshotRequest,
      area: 'full-map',
      targetLongEdge: 12000,
    });

    expect(fullMap?.surface).toEqual({ width: 12000, height: 10667 });
    expect(Number.isSafeInteger(fullMap?.surface.width)).toBe(true);
    expect(Number.isSafeInteger(fullMap?.surface.height)).toBe(true);
  });

  it('rounds a full-map surface to safe integers for a non-exactly-square city', async () => {
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 1512,
      clientHeight: 982,
      width: 1512,
      height: 982,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(
      makeCityData({
        bounds: {
          minX: -8639.98,
          maxX: 8640.02,
          minZ: -8640,
          maxZ: 8640,
          seaLevel: 40,
        },
      }),
      { activeLayers: ALL_LAYERS_VISIBLE },
    );

    const fullMap = renderer.createExportSnapshot({
      ...baseSnapshotRequest,
      format: 'png-1x',
      area: 'full-map',
      targetLongEdge: 6000,
    });

    expect(fullMap?.surface).not.toBeNull();
    expect(Number.isSafeInteger(fullMap?.surface.width)).toBe(true);
    expect(Number.isSafeInteger(fullMap?.surface.height)).toBe(true);
  });

  it('rejects a canvas whose logical size cannot be observed', async () => {
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 0,
      clientHeight: 0,
      width: 1280,
      height: 960,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    // Falling back to the backing store would silently report device pixels
    // (1280x960 for a 640 CSS-px canvas on a DPR-2 display).
    expect(renderer.createExportSnapshot(baseSnapshotRequest)).toBeNull();
  });

  it('registers nonempty park areas with distinct marker and label layers', async () => {
    const renderer = makeRenderer();
    await renderer.render(
      makeCityData({
        parkAreas: [
          {
            id: 'campus',
            name: 'Campus Central',
            position: { x: 100, y: 30, z: 200 },
            parkType: 'University',
          },
        ],
      }),
      { activeLayers: ALL_LAYERS_VISIBLE },
    );

    expect(mockMap.addSource).toHaveBeenCalledWith(
      'parks',
      expect.objectContaining({
        data: expect.objectContaining({
          features: [
            expect.objectContaining({
              properties: {
                id: 'campus',
                name: 'Campus Central',
                parkType: 'University',
              },
            }),
          ],
        }),
      }),
    );
    const addedLayers = (mockMap.addLayer as Mock).mock.calls.map(
      (call: unknown[]) => call[0] as { id: string; layout?: object },
    );
    expect(addedLayers).toContainEqual(
      expect.objectContaining({ id: 'park-areas-points' }),
    );
    expect(addedLayers).toContainEqual(
      expect.objectContaining({
        id: 'park-areas-labels',
        layout: expect.objectContaining({
          'text-anchor': 'top',
          'text-offset': [0, 0.75],
        }),
      }),
    );
  });

  it('defers rendering until load event when style is not loaded', async () => {
    mockMap.isStyleLoaded.mockReturnValue(false);
    // Capture the callback registered via once('load', cb)
    let loadCallback: (() => void) | null = null;
    mockMap.once.mockImplementation((_event: string, cb: () => void) => {
      loadCallback = cb;
    });

    const renderer = makeRenderer();
    const renderPromise = renderer.render(makeCityData(), {
      activeLayers: ALL_LAYERS_VISIBLE,
    });

    // addSource should not have been called yet
    expect(mockMap.addSource).not.toHaveBeenCalled();

    // Trigger the load event
    expect(loadCallback).not.toBeNull();
    loadCallback!();

    await renderPromise;
    expect(mockMap.addSource).toHaveBeenCalled();
  });

  it('dispose() calls map.remove()', () => {
    const renderer = makeRenderer();
    renderer.dispose();
    expect(mockMap.remove).toHaveBeenCalledOnce();
  });

  it('captures the current viewport during an on-demand render frame', async () => {
    const renderer = makeRenderer();
    await renderer.render(
      makeCityData({
        districts: [
          {
            id: 'district-1',
            name: 'Centro',
            position: { x: 0, y: 0, z: 0 },
          },
        ],
      }),
      { activeLayers: ALL_LAYERS_VISIBLE },
    );
    const toDataURL = vi.fn(() => 'data:image/png;base64,viewport');
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      toDataURL,
      clientWidth: 1_000,
      clientHeight: 1_000,
      width: 1_000,
      height: 1_000,
    } as unknown as { style: { cursor: string } });
    mockMap.once.mockImplementation((_event: string, callback: () => void) => {
      callback();
    });

    await expect(renderer.capturePreview()).resolves.toEqual({
      dataUrl: 'data:image/png;base64,viewport',
      width: 1000,
      height: 1000,
      bearingDegrees: 25,
      scale: expect.objectContaining({
        distanceMeters: expect.any(Number),
        widthPercent: expect.any(Number),
      }),
      annotations: [
        expect.objectContaining({
          id: 'district-1',
          name: 'Centro',
          kind: 'district',
        }),
      ],
    });
    expect(mockMap.once).toHaveBeenCalledWith('render', expect.any(Function));
    expect(mockMap.triggerRepaint).toHaveBeenCalledOnce();
    expect(toDataURL).toHaveBeenCalledWith('image/png');
  });

  it('returns null when preview capture is requested before city render', async () => {
    const renderer = makeRenderer();

    await expect(renderer.capturePreview()).resolves.toBeNull();
    expect(mockMap.triggerRepaint).not.toHaveBeenCalled();
  });

  it('resolves an in-flight preview capture when the renderer is disposed', async () => {
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    mockMap.once.mockImplementation(() => undefined);

    const capture = renderer.capturePreview();
    renderer.dispose();

    await expect(capture).resolves.toBeNull();
  });

  it('returns null when requesting the capture frame throws', async () => {
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    mockMap.once.mockImplementation(() => undefined);
    mockMap.triggerRepaint.mockImplementationOnce(() => {
      throw new Error('map removed');
    });

    await expect(renderer.capturePreview()).resolves.toBeNull();
  });

  it('setLayerVisibility calls setLayoutProperty for each matching layer ID', async () => {
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    // Simulate layers existing (cast to unknown to satisfy strict mock typing)
    mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
    vi.clearAllMocks();
    mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

    renderer.setLayerVisibility('roads', false);
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      'roads-casing',
      'visibility',
      'none',
    );
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      'roads-fill',
      'visibility',
      'none',
    );
  });

  it('reflects setLayerVisibility toggles in exported snapshots and PNGs', async () => {
    // Regression: setLayerVisibility only told the layer manager, never updated
    // this.activeLayers — so capturePng/createExportSnapshot kept using
    // whatever layers were active at the last full render(), silently ignoring
    // every toggle made afterwards through the layer panel.
    mockMap.getCanvas.mockReturnValue({
      style: { cursor: '' },
      clientWidth: 640,
      clientHeight: 480,
      width: 640,
      height: 480,
    } as never);
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });

    renderer.setLayerVisibility('forests', false);

    const snapshot = renderer.createExportSnapshot(baseSnapshotRequest);
    expect(snapshot?.activeLayers.forests).toBe(false);
  });

  it('setLayerVisibility for terrain controls the color-relief layer', async () => {
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    // Simulate layers existing so setLayoutProperty is reached
    mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
    vi.clearAllMocks();
    mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
    renderer.setLayerVisibility('terrain', false);
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      'terrain-color-relief',
      'visibility',
      'none',
    );
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      'terrain-hillshade',
      'visibility',
      'none',
    );
  });

  it('render() applies activeLayers immediately, without a second toggle', async () => {
    const renderer = makeRenderer();
    mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

    await renderer.render(makeCityData(), {
      activeLayers: { ...ALL_LAYERS_VISIBLE, roads: false },
    });

    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      'roads-casing',
      'visibility',
      'none',
    );
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      'roads-fill',
      'visibility',
      'none',
    );
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      'terrain-color-relief',
      'visibility',
      'visible',
    );
  });

  it('setLayerVisibility is a safe no-op when layers do not exist yet', () => {
    const renderer = makeRenderer();
    // No render() call — layers never added, getLayer returns undefined
    mockMap.getLayer.mockReturnValue(undefined);
    // Should not throw
    expect(() => renderer.setLayerVisibility('roads', false)).not.toThrow();
    expect(mockMap.setLayoutProperty).not.toHaveBeenCalled();
  });

  describe('districts points/labels display mode', () => {
    it('shows districts-points and hides districts-labels by default', async () => {
      const renderer = makeRenderer();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });

      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'districts-points',
        'visibility',
        'visible',
      );
      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'districts-labels',
        'visibility',
        'none',
      );
      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'park-areas-points',
        'visibility',
        'none',
      );
      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'park-areas-labels',
        'visibility',
        'none',
      );
    });

    it('setLayerOptions with showNameOnMap swaps to labels and hides points', async () => {
      const renderer = makeRenderer();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      vi.clearAllMocks();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

      renderer.setLayerOptions({
        transit: { visibleModes: [] },
        buildings: { visibleCategories: [], colorByCategory: false },
        districts: { showNameOnMap: true, showParkAreas: false },
        terrain: {
          showContourLines: true,
          showColorRelief: true,
          showHillshade: true,
        },
        basemap: { showGrid: false },
      });

      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'districts-labels',
        'visibility',
        'visible',
      );
      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'districts-points',
        'visibility',
        'none',
      );
    });

    it('shows park markers and labels when their districts sub-option is enabled', async () => {
      const renderer = makeRenderer();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      vi.clearAllMocks();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

      renderer.setLayerOptions({
        transit: { visibleModes: [] },
        buildings: { visibleCategories: [], colorByCategory: false },
        districts: { showNameOnMap: false, showParkAreas: true },
        terrain: {
          showContourLines: true,
          showColorRelief: true,
          showHillshade: true,
        },
        basemap: { showGrid: false },
      });

      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'park-areas-points',
        'visibility',
        'visible',
      );
      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'park-areas-labels',
        'visibility',
        'visible',
      );
    });

    it('hiding the districts layer hides both points and labels regardless of mode', async () => {
      const renderer = makeRenderer();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      renderer.setLayerOptions({
        transit: { visibleModes: [] },
        buildings: { visibleCategories: [], colorByCategory: false },
        districts: { showNameOnMap: true, showParkAreas: true },
        terrain: {
          showContourLines: true,
          showColorRelief: true,
          showHillshade: true,
        },
        basemap: { showGrid: false },
      });
      vi.clearAllMocks();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

      renderer.setLayerVisibility('districts', false);

      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'districts-points',
        'visibility',
        'none',
      );
      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'districts-labels',
        'visibility',
        'none',
      );
      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'park-areas-points',
        'visibility',
        'none',
      );
      expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
        'park-areas-labels',
        'visibility',
        'none',
      );
    });
  });

  describe('setTransitDimming — Story 5.3 (AC #1, #4)', () => {
    it('dims non-transit layers to ~0.15x their baseline opacity when enabled', async () => {
      const renderer = makeRenderer();
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
      vi.clearAllMocks();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

      renderer.setTransitDimming(true);

      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-fill',
        'line-opacity',
        ['*', 1, 0.15],
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'buildings-fill',
        'fill-opacity',
        ['*', 0.85, 0.15],
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'background',
        'background-opacity',
        ['*', 1, 0.15],
      );
    });

    it('restores baseline opacity when disabled', async () => {
      const renderer = makeRenderer();
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
      vi.clearAllMocks();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

      renderer.setTransitDimming(false);

      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-fill',
        'line-opacity',
        1,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'buildings-fill',
        'fill-opacity',
        0.85,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'background',
        'background-opacity',
        1,
      );
    });

    it('never touches any of the 5 transit layer ids', async () => {
      const renderer = makeRenderer();
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
      vi.clearAllMocks();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

      renderer.setTransitDimming(true);

      const transitIds = [
        'transit-connector',
        'transit-line',
        'transit-stops',
        'transit-stops-outline',
        'transit-stops-dot',
      ];
      for (const call of mockMap.setPaintProperty.mock.calls) {
        expect(transitIds).not.toContain(call[0]);
      }
    });

    it('is a safe no-op when layers do not exist yet', () => {
      const renderer = makeRenderer();
      mockMap.getLayer.mockReturnValue(undefined);
      expect(() => renderer.setTransitDimming(true)).not.toThrow();
      expect(mockMap.setPaintProperty).not.toHaveBeenCalled();
    });

    it('keeps the hypsometric relief dimmed across a later setLayerOptions call', async () => {
      const renderer = makeRenderer();
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
      renderer.setTransitDimming(true);
      vi.clearAllMocks();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

      // Toggling any option (here: contour lines) re-runs setOptions, which
      // must not reset the relief back to full opacity while dimming holds.
      renderer.setLayerOptions({
        transit: { visibleModes: [] },
        buildings: { visibleCategories: [], colorByCategory: false },
        districts: { showNameOnMap: false, showParkAreas: false },
        terrain: {
          showContourLines: false,
          showColorRelief: true,
          showHillshade: true,
        },
        basemap: { showGrid: false },
      });

      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'terrain-color-relief',
        'color-relief-opacity',
        TRANSIT_DIM_FACTOR,
      );
    });
  });

  describe('clear()', () => {
    const ALL_CITY_SOURCE_IDS = [
      'base-land-source',
      'base-water-source',
      'terrain-dem',
      'coastline-source',
      'terrain-lines-source',
      'forests',
      'buildings',
      'roads',
      'transit',
      'transit-stops',
      'districts',
      'parks',
    ];

    it('removes all city-specific layers when they exist', () => {
      const renderer = makeRenderer();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
      renderer.clear();
      // RemoveLayer should be called for every layer in LAYER_ID_MAP
      expect(mockMap.removeLayer).toHaveBeenCalledWith('base-water');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('base-land');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('roads-casing');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('roads-fill');
      expect(mockMap.removeLayer).toHaveBeenCalledWith(
        'roads-railway-surface-casing',
      );
      expect(mockMap.removeLayer).toHaveBeenCalledWith(
        'roads-railway-surface-fill',
      );
      expect(mockMap.removeLayer).toHaveBeenCalledWith(
        'roads-railway-elevated-casing',
      );
      expect(mockMap.removeLayer).toHaveBeenCalledWith(
        'roads-railway-elevated-fill',
      );
      expect(mockMap.removeLayer).toHaveBeenCalledWith(
        'roads-railway-underground-casing',
      );
      expect(mockMap.removeLayer).toHaveBeenCalledWith(
        'roads-railway-underground-fill',
      );
      expect(mockMap.removeLayer).toHaveBeenCalledWith('transit-line');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('transit-stops');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('buildings-fill');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('buildings-outline');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('forests-circles');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('districts-points');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('districts-labels');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('park-areas-points');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('park-areas-labels');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('coastline-layer');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('terrain-lines-layer');
    });

    it('removes all city-specific sources when they exist', () => {
      const renderer = makeRenderer();
      mockMap.getSource.mockReturnValue({} as unknown as undefined);
      renderer.clear();
      for (const id of ALL_CITY_SOURCE_IDS) {
        expect(mockMap.removeSource).toHaveBeenCalledWith(id);
      }
    });

    it('is safe to call when no layers or sources exist (idempotent)', () => {
      mockMap.getLayer.mockReturnValue(undefined);
      mockMap.getSource.mockReturnValue(undefined);
      const renderer = makeRenderer();
      expect(() => renderer.clear()).not.toThrow();
      expect(mockMap.removeLayer).not.toHaveBeenCalled();
      expect(mockMap.removeSource).not.toHaveBeenCalled();
    });

    it('sets cityData to null', () => {
      const renderer = makeRenderer();
      void renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      renderer.clear();
      expect(renderer).toBeDefined();
    });
  });

  it('updateViewport() is a no-op and does not throw', () => {
    const renderer = makeRenderer();
    expect(() => renderer.updateViewport(2, 100, 200)).not.toThrow();
  });

  it('resize() is a no-op and does not throw', () => {
    const renderer = makeRenderer();
    expect(() => renderer.resize(800, 600)).not.toThrow();
  });

  describe('subscribeViewport', () => {
    it('registers move, moveend and idle handlers on the map', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeViewport(cb);
      expect(mockMap.on).toHaveBeenCalledWith('move', expect.any(Function));
      expect(mockMap.on).toHaveBeenCalledWith('moveend', expect.any(Function));
      expect(mockMap.on).toHaveBeenCalledWith('idle', expect.any(Function));
    });

    it('cleanup function calls map.off for move, moveend and idle', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      const unsub = renderer.subscribeViewport(cb);
      unsub();
      expect(mockMap.off).toHaveBeenCalledWith('move', expect.any(Function));
      expect(mockMap.off).toHaveBeenCalledWith('moveend', expect.any(Function));
      expect(mockMap.off).toHaveBeenCalledWith('idle', expect.any(Function));
    });

    it('calls the callback with correct ViewportBounds when move handler fires', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeViewport(cb);
      const handler = (mockMap.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === 'move',
      )?.[1] as () => void;
      handler();
      expect(cb).toHaveBeenCalledWith({
        westLng: -0.08,
        eastLng: 0.08,
        northLat: 0.08,
        southLat: -0.08,
      });
    });

    it('idle handler fires callback once and ignores subsequent idle events', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeViewport(cb);
      const idleHandler = (
        mockMap.on as ReturnType<typeof vi.fn>
      ).mock.calls.find((c: unknown[]) => c[0] === 'idle')?.[1] as () => void;
      idleHandler();
      idleHandler(); // second call should be a no-op
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('getInitialViewportBounds', () => {
    it('returns current bounds when map is ready', () => {
      const renderer = makeRenderer();
      const bounds = renderer.getInitialViewportBounds();
      expect(bounds).toEqual({
        westLng: -0.08,
        eastLng: 0.08,
        northLat: 0.08,
        southLat: -0.08,
      });
    });

    it('returns null when getBounds throws', () => {
      mockMap.getBounds.mockImplementationOnce(() => {
        throw new Error('not ready');
      });
      const renderer = makeRenderer();
      expect(renderer.getInitialViewportBounds()).toBeNull();
    });
  });

  describe('navigateTo', () => {
    it('calls map.flyTo with center and animate:false', () => {
      const renderer = makeRenderer();
      renderer.navigateTo(1.5, -0.5);
      expect(mockMap.flyTo).toHaveBeenCalledWith({
        center: [1.5, -0.5],
        animate: false,
      });
    });
  });

  describe('subscribeHover', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockMap.getLayer.mockReturnValue(undefined);
      mockMap.getSource.mockReturnValue(undefined);
      mockMap.isStyleLoaded.mockReturnValue(true);
      mockMap.getCanvas.mockReturnValue({ style: { cursor: '' } });
    });

    it('registers mousemove and mouseleave handlers on transit-stops layer', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeHover(cb);
      expect(mockMap.on).toHaveBeenCalledWith(
        'mousemove',
        'transit-stops',
        expect.any(Function),
      );
      expect(mockMap.on).toHaveBeenCalledWith(
        'mouseleave',
        'transit-stops',
        expect.any(Function),
      );
    });

    it('cleanup function calls map.off for mousemove and mouseleave', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      const unsub = renderer.subscribeHover(cb);
      unsub();
      expect(mockMap.off).toHaveBeenCalledWith(
        'mousemove',
        'transit-stops',
        expect.any(Function),
      );
      expect(mockMap.off).toHaveBeenCalledWith(
        'mouseleave',
        'transit-stops',
        expect.any(Function),
      );
    });

    it('mousemove handler calls callback with TooltipInfo when queryRenderedFeatures returns a feature', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeHover(cb);

      const mockFeature = {
        properties: {
          id: 'stop-1',
          mode: 'Bus',
          color: '#FF0000',
          lines: JSON.stringify([
            { name: 'Line 1', color: '#FF0000', mode: 'Bus' },
          ]),
        },
      };
      mockMap.queryRenderedFeatures.mockReturnValueOnce([
        mockFeature,
      ] as unknown as never[]);

      const moveHandler = (
        mockMap.on as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        (c: unknown[]) => c[0] === 'mousemove' && c[1] === 'transit-stops',
      )?.[2] as (e: { point: { x: number; y: number } }) => void;

      moveHandler({ point: { x: 100, y: 200 } });

      expect(cb).toHaveBeenCalledWith({
        kind: 'transit',
        screenX: 100,
        screenY: 200,
        lines: [{ name: 'Line 1', color: '#FF0000', mode: 'Bus' }],
      });
    });

    it('mousemove handler deduplicates lines across multiple nearby features', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeHover(cb);

      const features = [
        {
          properties: {
            id: 'stop-1',
            mode: 'Bus',
            color: '#FF0000',
            lines: JSON.stringify([
              { name: 'Line 1', color: '#FF0000', mode: 'Bus' },
            ]),
          },
        },
        {
          properties: {
            id: 'stop-2',
            mode: 'Bus',
            color: '#0000FF',
            lines: JSON.stringify([
              { name: 'Line 1', color: '#FF0000', mode: 'Bus' }, // duplicate
              { name: 'Line 2', color: '#0000FF', mode: 'Bus' },
            ]),
          },
        },
      ];
      mockMap.queryRenderedFeatures.mockReturnValueOnce(
        features as unknown as never[],
      );

      const moveHandler = (
        mockMap.on as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        (c: unknown[]) => c[0] === 'mousemove' && c[1] === 'transit-stops',
      )?.[2] as (e: { point: { x: number; y: number } }) => void;

      moveHandler({ point: { x: 50, y: 50 } });

      const result = cb.mock.calls[0][0] as {
        lines: Array<{ name: string; color: string; mode: string }>;
      };
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]).toEqual({
        name: 'Line 1',
        color: '#FF0000',
        mode: 'Bus',
      });
      expect(result.lines[1]).toEqual({
        name: 'Line 2',
        color: '#0000FF',
        mode: 'Bus',
      });
    });

    it('mousemove handler does not call callback when all parsed lines are empty', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeHover(cb);

      const mockFeature = {
        properties: {
          id: 'stop-1',
          mode: 'Bus',
          color: '#FF0000',
          lines: JSON.stringify([]),
        },
      };
      mockMap.queryRenderedFeatures.mockReturnValueOnce([
        mockFeature,
      ] as unknown as never[]);

      const moveHandler = (
        mockMap.on as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        (c: unknown[]) => c[0] === 'mousemove' && c[1] === 'transit-stops',
      )?.[2] as (e: { point: { x: number; y: number } }) => void;

      moveHandler({ point: { x: 100, y: 200 } });

      expect(cb).not.toHaveBeenCalled();
    });

    it('mouseleave handler calls callback with null and resets cursor', () => {
      const canvasStyle = { cursor: 'pointer' };
      mockMap.getCanvas.mockReturnValue({ style: canvasStyle });

      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeHover(cb);

      const leaveHandler = (
        mockMap.on as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        (c: unknown[]) => c[0] === 'mouseleave' && c[1] === 'transit-stops',
      )?.[2] as () => void;

      leaveHandler();

      expect(cb).toHaveBeenCalledWith(null);
      expect(canvasStyle.cursor).toBe('');
    });

    it('mousemove handler does not call callback when queryRenderedFeatures returns empty', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeHover(cb);

      mockMap.queryRenderedFeatures.mockReturnValueOnce([]);

      const moveHandler = (
        mockMap.on as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        (c: unknown[]) => c[0] === 'mousemove' && c[1] === 'transit-stops',
      )?.[2] as (e: { point: { x: number; y: number } }) => void;

      moveHandler({ point: { x: 100, y: 200 } });

      expect(cb).not.toHaveBeenCalled();
    });

    it('registers mousemove and mouseleave handlers on districts-points layer', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeHover(cb);
      expect(mockMap.on).toHaveBeenCalledWith(
        'mousemove',
        'districts-points',
        expect.any(Function),
      );
      expect(mockMap.on).toHaveBeenCalledWith(
        'mouseleave',
        'districts-points',
        expect.any(Function),
      );
    });

    it('district mousemove handler calls callback with a district TooltipInfo', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeHover(cb);

      mockMap.queryRenderedFeatures.mockReturnValueOnce([
        { properties: { id: 'd1', name: 'Puerto Viejo' } },
      ] as unknown as never[]);

      const moveHandler = (
        mockMap.on as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        (c: unknown[]) => c[0] === 'mousemove' && c[1] === 'districts-points',
      )?.[2] as (e: { point: { x: number; y: number } }) => void;

      moveHandler({ point: { x: 30, y: 40 } });

      expect(cb).toHaveBeenCalledWith({
        kind: 'district',
        screenX: 30,
        screenY: 40,
        name: 'Puerto Viejo',
      });
    });

    it('district mousemove handler does not call callback when no district is nearby', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeHover(cb);

      mockMap.queryRenderedFeatures.mockReturnValueOnce([]);

      const moveHandler = (
        mockMap.on as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        (c: unknown[]) => c[0] === 'mousemove' && c[1] === 'districts-points',
      )?.[2] as (e: { point: { x: number; y: number } }) => void;

      moveHandler({ point: { x: 30, y: 40 } });

      expect(cb).not.toHaveBeenCalled();
    });

    it('district mouseleave handler calls callback with null and resets cursor', () => {
      const canvasStyle = { cursor: 'pointer' };
      mockMap.getCanvas.mockReturnValue({ style: canvasStyle });

      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeHover(cb);

      const leaveHandler = (
        mockMap.on as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        (c: unknown[]) => c[0] === 'mouseleave' && c[1] === 'districts-points',
      )?.[2] as () => void;

      leaveHandler();

      expect(cb).toHaveBeenCalledWith(null);
      expect(canvasStyle.cursor).toBe('');
    });
  });

  describe('subscribeServiceIconLegend', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockMap.getLayer.mockReturnValue({
        id: 'service-icons',
      } as unknown as undefined);
      mockMap.getZoom.mockReturnValue(15);
      mockMap.queryRenderedFeatures.mockReturnValue([]);
    });

    // .at(-1) — MapNavigationManager also registers its own 'move'/'moveend'
    // listeners during construction; subscribeServiceIconLegend's handlers
    // are always registered last, after makeRenderer() + the subscribe call.
    const findHandler = (event: string) =>
      (mockMap.on as ReturnType<typeof vi.fn>).mock.calls
        .filter((c: unknown[]) => c[0] === event)
        .at(-1)?.[1] as () => void;

    it('registers move, moveend and idle handlers on the map', () => {
      const renderer = makeRenderer();
      renderer.subscribeServiceIconLegend(vi.fn());
      expect(mockMap.on).toHaveBeenCalledWith('move', expect.any(Function));
      expect(mockMap.on).toHaveBeenCalledWith('moveend', expect.any(Function));
      expect(mockMap.on).toHaveBeenCalledWith('idle', expect.any(Function));
    });

    it('cleanup function calls map.off for move, moveend and idle', () => {
      const renderer = makeRenderer();
      const unsub = renderer.subscribeServiceIconLegend(vi.fn());
      unsub();
      expect(mockMap.off).toHaveBeenCalledWith('move', expect.any(Function));
      expect(mockMap.off).toHaveBeenCalledWith('moveend', expect.any(Function));
      expect(mockMap.off).toHaveBeenCalledWith('idle', expect.any(Function));
    });

    it('move handler reports visible=false once zoom drops below 14, without querying features', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeServiceIconLegend(cb);
      mockMap.getZoom.mockReturnValue(13.5);

      findHandler('move')();

      expect(cb).toHaveBeenCalledWith({ visible: false, groups: [] });
      expect(mockMap.queryRenderedFeatures).not.toHaveBeenCalled();
    });

    it('move handler does not call the callback while zoom stays at/above 14', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeServiceIconLegend(cb);

      findHandler('move')();

      expect(cb).not.toHaveBeenCalled();
      expect(mockMap.queryRenderedFeatures).not.toHaveBeenCalled();
    });

    it('moveend handler queries service-icons and reports visible groups, deduplicated and canonically ordered', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeServiceIconLegend(cb);

      mockMap.queryRenderedFeatures.mockReturnValueOnce([
        { properties: { serviceGroup: 'education' } },
        { properties: { serviceGroup: 'water' } },
        { properties: { serviceGroup: 'water' } }, // duplicate
      ] as unknown as never[]);

      findHandler('moveend')();

      expect(mockMap.queryRenderedFeatures).toHaveBeenCalledWith({
        layers: ['service-icons'],
      });
      expect(cb).toHaveBeenCalledWith({
        visible: true,
        groups: ['water', 'education'], // SERVICE_GROUPS canonical order, not insertion order
      });
    });

    it('moveend handler drops feature properties with an unrecognized serviceGroup value', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeServiceIconLegend(cb);

      mockMap.queryRenderedFeatures.mockReturnValueOnce([
        { properties: { serviceGroup: 'not-a-real-group' } },
      ] as unknown as never[]);

      findHandler('moveend')();

      expect(cb).toHaveBeenCalledWith({ visible: true, groups: [] });
    });

    it('moveend handler skips the query and reports empty groups when the service-icons layer is absent', () => {
      mockMap.getLayer.mockReturnValue(undefined);
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeServiceIconLegend(cb);

      findHandler('moveend')();

      expect(mockMap.queryRenderedFeatures).not.toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ visible: true, groups: [] });
    });

    it('moveend handler reports visible=false without querying when zoom is below 14', () => {
      mockMap.getZoom.mockReturnValue(10);
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeServiceIconLegend(cb);

      findHandler('moveend')();

      expect(mockMap.queryRenderedFeatures).not.toHaveBeenCalled();
      expect(cb).toHaveBeenCalledWith({ visible: false, groups: [] });
    });

    it('idle handler fires the full check once and ignores subsequent idle events', () => {
      const renderer = makeRenderer();
      const cb = vi.fn();
      renderer.subscribeServiceIconLegend(cb);

      const idleHandler = findHandler('idle');
      idleHandler();
      idleHandler(); // second call should be a no-op

      expect(mockMap.queryRenderedFeatures).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('Navigation Constraints', () => {
    it('sets renderWorldCopies to false in constructor', () => {
      const container = document.createElement('div');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const MapMock = (maplibregl as any).Map as ReturnType<typeof vi.fn>;
      MapMock.mockClear();
      new MapLibreRenderer(container, MOCK_STYLE);
      expect(MapMock).toHaveBeenCalledWith(
        expect.objectContaining({ renderWorldCopies: false }),
      );
    });

    it('sets maxZoom to 18 in constructor', () => {
      const container = document.createElement('div');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const MapMock = (maplibregl as any).Map as ReturnType<typeof vi.fn>;
      MapMock.mockClear();
      new MapLibreRenderer(container, MOCK_STYLE);
      expect(MapMock).toHaveBeenCalledWith(
        expect.objectContaining({ maxZoom: 18 }),
      );
    });

    it('calls setMaxBounds after render()', async () => {
      const renderer = makeRenderer();
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      // Soft mode (default): setMaxBounds(undefined) to clear bounds
      expect(mockMap.setMaxBounds).toHaveBeenCalledOnce();
      expect(mockMap.setMaxBounds).toHaveBeenCalledWith(undefined);
    });

    it('calls setMinZoom after render()', async () => {
      const renderer = makeRenderer();
      mockMap.getZoom.mockReturnValue(12);
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      // Soft mode: minZoom = fitToScreenZoom * 0.25 = 12 * 0.25 = 3
      expect(mockMap.setMinZoom).toHaveBeenCalledOnce();
      expect(mockMap.setMinZoom).toHaveBeenCalledWith(3);
    });

    it('updates constraints when rendering a new city', async () => {
      const renderer = makeRenderer();
      mockMap.getZoom.mockReturnValue(12);
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      expect(mockMap.setMaxBounds).toHaveBeenCalledTimes(1);

      mockMap.getZoom.mockReturnValue(14);
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      expect(mockMap.setMaxBounds).toHaveBeenCalledTimes(2);
      // Soft mode: minZoom = 14 * 0.25 = 3.5
      expect(mockMap.setMinZoom).toHaveBeenLastCalledWith(3.5);
    });

    it('re-applies constraints on fitToScreen()', async () => {
      const renderer = makeRenderer();
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      vi.clearAllMocks();

      renderer.fitToScreen();
      expect(mockMap.fitBounds).toHaveBeenCalledOnce();
      // Soft mode (default): setMaxBounds(undefined) + setMinZoom
      expect(mockMap.setMaxBounds).toHaveBeenCalledOnce();
      expect(mockMap.setMinZoom).toHaveBeenCalledOnce();
    });
  });

  describe('Navigation Mode Toggle', () => {
    it('defaults to soft boundary mode', async () => {
      const renderer = makeRenderer();
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      // Soft mode: setMaxBounds(undefined) to clear bounds
      expect(mockMap.setMaxBounds).toHaveBeenCalledWith(undefined);
    });

    it('toggleNavigationMode switches to strict mode', async () => {
      const renderer = makeRenderer();
      mockMap.getZoom.mockReturnValue(12);
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      vi.clearAllMocks();
      mockMap.project.mockImplementation(
        (coordinate: [number, number] | { lng: number }) =>
          ({
            x:
              ((Array.isArray(coordinate) ? coordinate[0] : coordinate.lng) +
                0.08) *
              3200,
            y: 500,
          }) as { x: number; y: number },
      );
      mockMap.unproject.mockImplementation(
        (point: [number, number] | { x: number }) =>
          ({
            lng: (Array.isArray(point) ? point[0] : point.x) / 3200 - 0.08,
            lat: 0,
          }) as { lng: number; lat: number },
      );

      renderer.toggleNavigationMode();
      expect(mockMap.setMaxBounds).toHaveBeenCalledOnce();
      expect(mockMap.project).toHaveBeenCalled();
      expect(mockMap.unproject).toHaveBeenCalled();
      // minZoom derived from fitToScreenZoom (12), not current camera zoom
      expect(mockMap.setMinZoom).toHaveBeenCalledWith(3);
    });

    it('toggleNavigationMode switches back to soft mode', async () => {
      const renderer = makeRenderer();
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });

      renderer.toggleNavigationMode(); // → strict
      vi.clearAllMocks();
      renderer.toggleNavigationMode(); // → soft

      expect(mockMap.setMaxBounds).toHaveBeenCalledWith(undefined);
    });

    it('soft mode sets minZoom to 25% of fit-to-screen zoom', async () => {
      const renderer = makeRenderer();
      mockMap.getZoom.mockReturnValue(12);
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      // fitToScreenZoom = 12, minZoom = 12 * 0.25 = 3
      expect(mockMap.setMinZoom).toHaveBeenCalledWith(3);
    });

    it('registers moveend listener on render', async () => {
      const renderer = makeRenderer();
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      expect(mockMap.on).toHaveBeenCalledWith('moveend', expect.any(Function));
    });
  });

  describe('applyTheme', () => {
    it('is a safe no-op when no layers exist yet (theme applied before a city loads)', async () => {
      const renderer = makeRenderer();
      await expect(renderer.applyTheme(MOCK_STYLE)).resolves.toBeUndefined();
      expect(mockMap.setPaintProperty).not.toHaveBeenCalled();
    });

    it('calls setPaintProperty for every themed layer that currently exists', async () => {
      const renderer = makeRenderer();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

      await renderer.applyTheme(MOCK_STYLE);

      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'background',
        'background-color',
        MOCK_STYLE.mapBackground,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'base-water',
        'fill-color',
        MOCK_STYLE.water,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'base-land',
        'fill-color',
        MOCK_STYLE.terrain.base,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'forests-circles',
        'circle-color',
        MOCK_STYLE.forests,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'buildings-fill',
        'fill-color',
        buildBuildingColorExpression(resolveColors(MOCK_STYLE), 'fill', false),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'districts-points',
        'circle-color',
        MOCK_STYLE.districts.fill,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'park-areas-points',
        'circle-color',
        buildParkColorExpression(resolveColors(MOCK_STYLE)),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-fill',
        'line-color',
        expect.any(Array),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-casing',
        'line-color',
        expect.any(Array),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-railway-surface-casing',
        'line-color',
        expect.any(Array),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-railway-surface-fill',
        'line-color',
        expect.any(Array),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-railway-elevated-casing',
        'line-color',
        expect.any(Array),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-railway-elevated-fill',
        'line-color',
        expect.any(Array),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-railway-underground-casing',
        'line-color',
        expect.any(Array),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-railway-underground-fill',
        'line-color',
        expect.any(Array),
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'roads-blimp',
        'line-color',
        resolveAirshipColor(MOCK_STYLE.roads.ferry.fill),
      );
    });

    it('completes in well under one frame (~16ms)', async () => {
      const renderer = makeRenderer();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

      const start = performance.now();
      await renderer.applyTheme(MOCK_STYLE);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(16);
    });

    it('does not undo setTransitDimming: MapLibreRoot calls setTransitDimming then applyTheme in the same effect', async () => {
      const renderer = makeRenderer();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);

      renderer.setTransitDimming(true);
      await renderer.applyTheme(MOCK_STYLE);

      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'terrain-color-relief',
        'color-relief-opacity',
        TRANSIT_DIM_FACTOR,
      );
    });
  });
});
