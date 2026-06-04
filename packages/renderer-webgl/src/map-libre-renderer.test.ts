import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { MapLibreRenderer } from './map-libre-renderer';
import { makeCityData } from '@vellum/core/testing';
import type { RendererTokens } from './tokens';

// ─── Mock maplibre-gl ─────────────────────────────────────────────────────────
// vi.mock() is hoisted; use vi.hoisted() so mockMap is available in the factory.

const mockMap = vi.hoisted(() => ({
  isStyleLoaded: vi.fn(() => true),
  addSource: vi.fn(),
  getSource: vi.fn(() => undefined),
  addLayer: vi.fn(),
  getLayer: vi.fn(() => undefined),
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
}));

vi.mock('maplibre-gl', () => ({
  default: {
    // Regular function (not arrow) so `new Map(...)` works as a constructor.
    Map: vi.fn().mockImplementation(function () {
      return mockMap;
    }),
  },
}));

// ─── Test tokens ──────────────────────────────────────────────────────────────

const MOCK_TOKENS: RendererTokens = {
  terrain: '#f7f6f1',
  terrainLow: '#95ae79',
  terrainMid: '#deddbe',
  terrainHigh: '#c4a06a',
  water: '#6db8b7',
  green: '#95ae79',
  text: '#333333',
  transitBg: '#1a1a2e',
  roadHighway: '#a098b0',
  roadHighwayCasing: '#7d748e',
  roadLargeArterial: '#d2938e',
  roadLargeArterialCasing: '#b8756e',
  roadMediumArterial: '#d4a882',
  roadMediumArterialCasing: '#b48a69',
  roadLocal: '#e4e1d1',
  roadLocalCasing: '#8a8278',
  roadGravel: '#e0d5c1',
  roadGravelCasing: '#c4b89e',
  roadPedestrian: '#7a6e60',
  roadPedestrianCasing: '#5d5550',
  roadPedestrianWay: '#8b7d6b',
  roadRailway: '#eceff1',
  roadRailwayCasing: '#455a64',
  buildingFill: '#c8bfb5',
  buildingStroke: '#a09585',
  districtFill: '#b4a08c',
  districtLabel: '#ffffff',
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
  return new MapLibreRenderer(container, MOCK_TOKENS);
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

  it('calls addSource for each layer when render() is called', async () => {
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

  it('calls addLayer for each visible layer on first render', async () => {
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

  it('setLayerVisibility is a safe no-op when layers do not exist yet', () => {
    const renderer = makeRenderer();
    // No render() call — layers never added, getLayer returns undefined
    mockMap.getLayer.mockReturnValue(undefined);
    // Should not throw
    expect(() => renderer.setLayerVisibility('roads', false)).not.toThrow();
    expect(mockMap.setLayoutProperty).not.toHaveBeenCalled();
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
});
