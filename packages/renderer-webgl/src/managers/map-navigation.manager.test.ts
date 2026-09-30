import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import type { CityData } from '@vellum/core';
import { MapNavigationManager } from './map-navigation.manager';

vi.mock('../helpers', () => ({
  getCityBoundsGeoJSON: () => [
    [0, 0],
    [1, 1],
  ],
}));

const city = {} as CityData;

/**
 * A map whose `fitBounds` lands on zoom 10, synchronously unless `animated`.
 * Like MapLibre, one-time listeners run after the regular ones of the same event,
 * including those added by a regular listener during it.
 */
function makeMap({ animated = false } = {}) {
  let zoom = 9.25;
  let center = { lng: 0.5, lat: 0.5 };
  let minZoom = 0;
  let onMoveEnd = () => {};
  const once: (() => void)[] = [];
  const endMove = () => {
    onMoveEnd();
    once.splice(0).forEach((cb) => cb());
  };
  const map = {
    on: vi.fn((_: string, cb: () => void) => (onMoveEnd = cb)),
    once: vi.fn((_: string, cb: () => void) => once.push(cb)),
    getZoom: vi.fn(() => zoom),
    getMaxZoom: vi.fn(() => 18),
    getCenter: vi.fn(() => center),
    setZoom: vi.fn(),
    setCenter: vi.fn(),
    setMinZoom: vi.fn((z: number | null) => {
      minZoom = z ?? 0;
      zoom = Math.max(zoom, minZoom);
    }),
    setMaxBounds: vi.fn(),
    cameraForBounds: vi.fn(() => ({ zoom: 10 })),
    fitBounds: vi.fn(() => {
      if (!animated) map.endFit();
    }),
    /** Lands the fit (the end of its animation when `animated`). */
    endFit: () => {
      zoom = Math.max(10, minZoom);
      center = { lng: 0.5, lat: 0.5 };
      endMove();
    },
    /** Simulates a pan ending with the center outside the city. */
    panOutside: () => {
      center = { lng: 3, lat: 3 };
      endMove();
    },
    /** Simulates any user zoom (wheel, button, key) ending at `z`. */
    zoomTo: (z: number) => {
      zoom = z;
      endMove();
    },
  };
  return map;
}

describe('MapNavigationManager zoom controls', () => {
  it('reports the live zoom with the fit zoom as the floor', () => {
    const map = makeMap();
    const manager = new MapNavigationManager(map as unknown as maplibregl.Map);
    manager.fitAndConstrain(city);

    expect(manager.getZoomState()).toEqual({ zoom: 10, min: 10, max: 18 });
    expect(map.setMinZoom).toHaveBeenLastCalledWith(9.5);
  });

  it('clamps requested zoom between the fit and the max without changing the center', () => {
    const map = makeMap();
    const manager = new MapNavigationManager(map as unknown as maplibregl.Map);
    manager.fitAndConstrain(city);

    manager.setZoom(24);
    expect(map.setZoom).toHaveBeenCalledWith(18);
    expect(map.setCenter).not.toHaveBeenCalled();

    manager.setZoom(1);
    expect(map.setZoom).toHaveBeenLastCalledWith(10);
  });

  it.each(['soft', 'strict'])(
    'settles back onto the fit after zooming out past it (%s)',
    (mode) => {
      const map = makeMap();
      const manager = new MapNavigationManager(
        map as unknown as maplibregl.Map,
      );
      if (mode === 'strict') manager.toggleMode();
      manager.fitAndConstrain(city);
      map.fitBounds.mockClear();

      map.zoomTo(9.5);
      expect(map.fitBounds).toHaveBeenCalledTimes(1);
      expect(manager.getZoomState()?.zoom).toBe(10);

      map.zoomTo(12);
      expect(map.fitBounds).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the floor at the fit while an animated snap-back is in flight', () => {
    const map = makeMap({ animated: true });
    const manager = new MapNavigationManager(map as unknown as maplibregl.Map);
    manager.fitAndConstrain(city);
    map.endFit();
    map.zoomTo(12);
    map.fitBounds.mockClear();
    map.setMinZoom.mockClear();

    map.panOutside();
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    expect(map.setMinZoom).toHaveBeenCalledWith(null);
    expect(map.setMinZoom).not.toHaveBeenCalledWith(11.5);

    map.endFit();
    expect(manager.getZoomState()).toEqual({ zoom: 10, min: 10, max: 18 });
    expect(map.setMinZoom).toHaveBeenLastCalledWith(9.5);
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it('ignores non-finite zoom requests', () => {
    const map = makeMap();
    const manager = new MapNavigationManager(map as unknown as maplibregl.Map);

    manager.setZoom(Number.NaN);
    expect(map.setZoom).not.toHaveBeenCalled();
  });
});
