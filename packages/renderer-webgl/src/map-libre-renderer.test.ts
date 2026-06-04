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
  fitBounds: vi.fn(),
  remove: vi.fn(),
  once: vi.fn(),
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
    expect(sourceCalls).toContain('water');
    expect(sourceCalls).toContain('roads');
    expect(sourceCalls).toContain('transit');
    expect(sourceCalls).toContain('buildings');
    expect(sourceCalls).toContain('forests');
    expect(sourceCalls).toContain('districts');
    // 6 named sources (background is handled as a style layer, not a geojson source)
    expect(mockMap.addSource).toHaveBeenCalledTimes(6);
  });

  it('calls addLayer for each visible layer on first render', async () => {
    const renderer = makeRenderer();
    const city = makeCityData();
    await renderer.render(city, { activeLayers: ALL_LAYERS_VISIBLE });

    const layerIds = (mockMap.addLayer as Mock).mock.calls.map(
      (call: unknown[]) => (call[0] as { id: string }).id,
    );
    expect(layerIds).toContain('water-fill');
    expect(layerIds).toContain('roads-casing');
    expect(layerIds).toContain('roads-fill');
    expect(layerIds).toContain('transit-line');
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

  it('setLayerVisibility is a no-op for terrain (no layer IDs)', async () => {
    const renderer = makeRenderer();
    await renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    vi.clearAllMocks();
    renderer.setLayerVisibility('terrain', false);
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
});
