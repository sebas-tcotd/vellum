import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createExportSnapshot,
  type ExportSnapshot,
  type RenderStyleParams,
  type RoadCategoryColors,
  type TilePlanTile,
} from '@vellum/core';
import { makeCityData, makeLayerVisibility } from '@vellum/core/testing';
import { RasterTileRenderer } from './raster-tile-renderer';

function roadColors(fill: string, casing: string): RoadCategoryColors {
  return { fill: fill as `#${string}`, casing: casing as `#${string}` };
}

const MOCK_STYLE: RenderStyleParams = {
  mapBackground: '#f7f6f1',
  mapFrame: '#f5f0e6',
  terrain: { base: '#f7f6f1', low: '#95ae79', mid: '#deddbe', high: '#c4a06a' },
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

// ─── Mock maplibre-gl ─────────────────────────────────────────────────────────

const mockMap = vi.hoisted(() => ({
  isStyleLoaded: vi.fn(() => true),
  loaded: vi.fn(() => false),
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
  resize: vi.fn(),
  jumpTo: vi.fn(),
  once: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  triggerRepaint: vi.fn(),
  setMaxBounds: vi.fn(),
  setMinZoom: vi.fn(),
  setMaxZoom: vi.fn(),
  getZoom: vi.fn(() => 12),
  getBearing: vi.fn(() => 0),
  getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
  getPitch: vi.fn(() => 0),
  getBounds: vi.fn(() => ({
    getWest: vi.fn(() => -0.08),
    getEast: vi.fn(() => 0.08),
    getNorth: vi.fn(() => 0.08),
    getSouth: vi.fn(() => -0.08),
  })),
  getCanvas: vi.fn(() => ({
    style: { cursor: '' },
    toBlob: (callback: (blob: Blob | null) => void) =>
      callback(new Blob([new Uint8Array([137, 80, 78, 71])])),
  })),
  getMinZoom: vi.fn(() => 0),
  getMaxZoom: vi.fn(() => 18),
}));

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn().mockImplementation(function () {
      return mockMap;
    }),
    addProtocol: vi.fn(),
    removeProtocol: vi.fn(),
  },
}));

vi.mock('../sources/dem-protocol', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sources/dem-protocol')>()),
  registerDemProtocol: vi.fn(async () => undefined),
  unregisterDemProtocol: vi.fn(),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSnapshot(): ExportSnapshot {
  return createExportSnapshot({
    snapshotId: 'tile-render-test',
    cityData: makeCityData(),
    style: MOCK_STYLE,
    activeLayers: makeLayerVisibility(),
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
    surface: { width: 2048, height: 2048 },
    request: {
      format: 'png-1x',
      area: 'full-map',
      targetLongEdge: 6000,
      background: 'white',
      fileName: 'tiled',
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

function makeTile(overrides: Partial<TilePlanTile> = {}): TilePlanTile {
  return {
    sequence: 0,
    tileX: 0,
    tileY: 0,
    usefulRect: { x: 0, y: 0, width: 2048, height: 2048 },
    renderRect: { x: 0, y: 0, width: 2304, height: 2304 },
    camera: { longitude: 1, latitude: 2, zoom: 10, bearing: 0, pitch: 0 },
    extent: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMap.isStyleLoaded.mockReturnValue(true);
  mockMap.once.mockImplementation((_event: string, callback: () => void) => {
    callback();
  });
});

describe('RasterTileRenderer', () => {
  it('creates a single hidden, preserve-drawing-buffer surface that never touches the interactive map', async () => {
    const maplibregl = (await import('maplibre-gl')).default;
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    await renderer.configure(makeSnapshot(), new AbortController().signal);

    expect(maplibregl.Map).toHaveBeenCalledTimes(1);
    expect(maplibregl.Map).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasContextAttributes: { preserveDrawingBuffer: true },
        pixelRatio: 1,
        maxZoom: 24,
      }),
    );
    const container = [...document.body.children].find(
      (child) => (child as HTMLElement).style.position === 'fixed',
    );
    expect(container).not.toBeUndefined();
    renderer.dispose();
  });

  it('reuses the same surface across multiple sequential tiles and returns exact renderRect PNG bytes', async () => {
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    const signal = new AbortController().signal;
    await renderer.configure(makeSnapshot(), signal);

    const first = await renderer.captureTile(makeTile(), signal);
    const second = await renderer.captureTile(
      makeTile({ sequence: 1, tileX: 1 }),
      signal,
    );

    expect(first).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(second).toEqual(new Uint8Array([137, 80, 78, 71]));
    const maplibregl = (await import('maplibre-gl')).default;
    expect(maplibregl.Map).toHaveBeenCalledTimes(1);
    renderer.dispose();
  });

  it('applies the plan renderRect size, pixelRatio-1 resize, and the exact tile camera before capture', async () => {
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    const signal = new AbortController().signal;
    await renderer.configure(makeSnapshot(), signal);
    // configure() renders, and render() resizes before fitting the camera. This
    // assertion is about the per-tile resize, so only count from here on.
    mockMap.resize.mockClear();

    await renderer.captureTile(
      makeTile({ renderRect: { x: 0, y: 0, width: 640, height: 480 } }),
      signal,
    );

    expect(mockMap.resize).toHaveBeenCalledOnce();
    expect(mockMap.jumpTo).toHaveBeenCalledWith({
      center: { lng: 1, lat: 2 },
      zoom: 10,
      bearing: 0,
      pitch: 0,
    });
    renderer.dispose();
  });

  it('sets the camera after render/configure, once fit/constrain has already run', async () => {
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    const signal = new AbortController().signal;
    await renderer.configure(makeSnapshot(), signal);
    const fitBoundsCallOrder = mockMap.fitBounds.mock.invocationCallOrder[0];

    await renderer.captureTile(makeTile(), signal);

    const jumpToCallOrder = mockMap.jumpTo.mock.invocationCallOrder[0];
    expect(jumpToCallOrder).toBeGreaterThan(fitBoundsCallOrder);
    renderer.dispose();
  });

  it('removes the soft-boundary snap-back and fit-derived zoom/pan clamps during configure', async () => {
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    const signal = new AbortController().signal;
    await renderer.configure(makeSnapshot(), signal);

    expect(mockMap.off).toHaveBeenCalledWith('moveend', expect.any(Function));
    expect(mockMap.setMaxBounds).toHaveBeenCalledWith(undefined);
    expect(mockMap.setMinZoom).toHaveBeenCalledWith(0);
    renderer.dispose();
  });

  it('rejects a tile camera with non-zero bearing or pitch before assigning or rendering', async () => {
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    const signal = new AbortController().signal;
    await renderer.configure(makeSnapshot(), signal);
    mockMap.jumpTo.mockClear();

    await expect(
      renderer.captureTile(
        makeTile({
          camera: { longitude: 0, latitude: 0, zoom: 1, bearing: 5, pitch: 0 },
        }),
        signal,
      ),
    ).rejects.toMatchObject({ name: 'UnsupportedCameraError' });
    expect(mockMap.jumpTo).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it('checks the abort signal before capturing a tile and never touches the surface', async () => {
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    const controller = new AbortController();
    await renderer.configure(makeSnapshot(), controller.signal);
    controller.abort();

    await expect(
      renderer.captureTile(makeTile(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockMap.jumpTo).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it('rejects configure() itself once already aborted', async () => {
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    const controller = new AbortController();
    controller.abort();

    await expect(
      renderer.configure(makeSnapshot(), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    renderer.dispose();
  });

  it('rejects a tile captured before configure()', async () => {
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    await expect(
      renderer.captureTile(makeTile(), new AbortController().signal),
    ).rejects.toThrow('before configure');
    renderer.dispose();
  });

  it('is idempotent on dispose and cleans up the renderer and the hidden container', async () => {
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    const signal = new AbortController().signal;
    await renderer.configure(makeSnapshot(), signal);

    renderer.dispose();
    renderer.dispose();

    expect(mockMap.remove).toHaveBeenCalledOnce();
    expect(
      [...document.body.children].some(
        (child) => (child as HTMLElement).style.position === 'fixed',
      ),
    ).toBe(false);
  });

  it('never releases a DEM protocol it does not own', async () => {
    const renderer = new RasterTileRenderer(MOCK_STYLE);
    const signal = new AbortController().signal;
    await renderer.configure(makeSnapshot(), signal);
    renderer.dispose();

    const { unregisterDemProtocol } = await import('../sources/dem-protocol');
    expect(unregisterDemProtocol).not.toHaveBeenCalled();
  });
});
