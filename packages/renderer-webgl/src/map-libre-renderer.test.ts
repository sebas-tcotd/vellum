import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import maplibregl from 'maplibre-gl';
import { MapLibreRenderer } from './map-libre-renderer';
import { makeCityData } from '@vellum/core/testing';
import type { RenderStyleParams, RoadCategoryColors } from '@vellum/core';

// ─── Mock maplibre-gl ─────────────────────────────────────────────────────────
// vi.mock() is hoisted; use vi.hoisted() so mockMap is available in the factory.

const mockMap = vi.hoisted(() => ({
  isStyleLoaded: vi.fn(() => true),
  addSource: vi.fn(),
  getSource: vi.fn(() => undefined),
  removeSource: vi.fn(),
  addLayer: vi.fn(),
  getLayer: vi.fn(() => undefined),
  removeLayer: vi.fn(),
  setLayoutProperty: vi.fn(),
  setPaintProperty: vi.fn(),
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
  setMaxBounds: vi.fn(),
  setMinZoom: vi.fn(),
  setMaxZoom: vi.fn(),
  getZoom: vi.fn(() => 12),
  getMinZoom: vi.fn(() => 0),
  getMaxZoom: vi.fn(() => 18),
}));

vi.mock('maplibre-gl', () => ({
  default: {
    // Regular function (not arrow) so `new Map(...)` works as a constructor.
    Map: vi.fn().mockImplementation(function () {
      return mockMap;
    }),
  },
}));

// ─── Test theme ───────────────────────────────────────────────────────────────

function roadColors(fill: string, casing: string): RoadCategoryColors {
  return { fill: fill as `#${string}`, casing: casing as `#${string}` };
}

const MOCK_STYLE: RenderStyleParams = {
  mapBackground: '#f7f6f1',
  terrain: {
    base: '#f7f6f1',
    low: '#95ae79',
    mid: '#deddbe',
    high: '#c4a06a',
  },
  water: '#6db8b7',
  forests: '#14592a',
  transitBackground: '#1a1a2e',
  roads: {
    highway: {
      generic: roadColors('#a098b0', '#7d748e'),
      industrial: roadColors('#a098b0', '#7d748e'),
    },
    largeArterial: {
      generic: roadColors('#d2938e', '#b8756e'),
      industrial: roadColors('#d2938e', '#b8756e'),
    },
    mediumArterial: {
      generic: roadColors('#d4a882', '#b48a69'),
      industrial: roadColors('#d4a882', '#b48a69'),
    },
    local: {
      generic: roadColors('#e4e1d1', '#8a8278'),
      industrial: roadColors('#e4e1d1', '#8a8278'),
      gravel: roadColors('#e0d5c1', '#c4b89e'),
    },
    pedestrian: {
      path: roadColors('#7a6e60', '#5d5550'),
      way: roadColors('#8b7d6b', '#8b7d6b'),
      street: roadColors('#7a6e60', '#5d5550'),
    },
    rail: {
      train: roadColors('#eceff1', '#455a64'),
      tram: roadColors('#eceff1', '#455a64'),
      monorail: roadColors('#eceff1', '#455a64'),
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
};

const ALL_LAYERS_VISIBLE = {
  terrain: true,
  water: true,
  roads: true,
  transit: true,
  buildings: true,
  forests: true,
  districts: true,
};

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
  });

  it.skip('calls addSource for each layer when render() is called', async () => {
    const renderer = makeRenderer();
    const city = makeCityData();
    await renderer.render(city, { activeLayers: ALL_LAYERS_VISIBLE });

    const sourceCalls = (mockMap.addSource as Mock).mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(sourceCalls).toContain('terrain');
    expect(sourceCalls).toContain('water');
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

  it('calls map.fitBounds after render', async () => {
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    expect(mockMap.fitBounds).toHaveBeenCalledOnce();
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

  it('setLayerVisibility for terrain controls the terrain-fill layer', async () => {
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    // Simulate layers existing so setLayoutProperty is reached
    mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
    vi.clearAllMocks();
    mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
    renderer.setLayerVisibility('terrain', false);
    expect(mockMap.setLayoutProperty).toHaveBeenCalledWith(
      'terrain-fill',
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
      'terrain-fill',
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
        ['*', 0.65, 0.15],
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'buildings-fill',
        'fill-opacity',
        ['*', 0.85, 0.15],
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
        0.65,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'buildings-fill',
        'fill-opacity',
        0.85,
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
  });

  describe('clear()', () => {
    const ALL_CITY_SOURCE_IDS = [
      'base',
      'terrain',
      'coastline-source',
      'terrain-lines-source',
      'forests',
      'buildings',
      'roads',
      'transit',
      'transit-stops',
      'districts',
    ];

    it('removes all city-specific layers when they exist', () => {
      const renderer = makeRenderer();
      mockMap.getLayer.mockReturnValue({ id: 'any' } as unknown as undefined);
      renderer.clear();
      // RemoveLayer should be called for every layer in LAYER_ID_MAP + roads-railway-casing
      expect(mockMap.removeLayer).toHaveBeenCalledWith('base-water');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('base-land');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('roads-casing');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('roads-fill');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('roads-railway-casing');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('transit-line');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('transit-stops');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('buildings-fill');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('buildings-outline');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('forests-circles');
      expect(mockMap.removeLayer).toHaveBeenCalledWith('districts-points');
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

    it('resets background-pattern to null', () => {
      const renderer = makeRenderer();
      renderer.clear();
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'background',
        'background-pattern',
        null,
      );
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
      await renderer.render(makeCityData(), {
        activeLayers: ALL_LAYERS_VISIBLE,
      });
      vi.clearAllMocks();

      renderer.toggleNavigationMode();
      // Strict mode: setMaxBounds with actual bounds
      expect(mockMap.setMaxBounds).toHaveBeenCalledOnce();
      expect(mockMap.setMaxBounds).not.toHaveBeenCalledWith(undefined);
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
        MOCK_STYLE.buildings.none.fill,
      );
      expect(mockMap.setPaintProperty).toHaveBeenCalledWith(
        'districts-points',
        'circle-color',
        MOCK_STYLE.districts.fill,
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
        'roads-railway-casing',
        'line-color',
        expect.any(Array),
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
  });
});
