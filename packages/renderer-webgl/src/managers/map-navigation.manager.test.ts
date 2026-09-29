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

/** A map whose `fitBounds` lands on zoom 10 and ends synchronously. */
function makeMap() {
  let zoom = 9.25;
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
    getCenter: vi.fn(() => ({ lng: 0.5, lat: 0.5 })),
    setZoom: vi.fn(),
    setCenter: vi.fn(),
    setMinZoom: vi.fn(),
    setMaxBounds: vi.fn(),
    fitBounds: vi.fn(() => {
      zoom = 10;
      endMove();
    }),
  };
  return map;
}

describe('MapNavigationManager zoom controls', () => {
  it('reports the live zoom with the fit zoom as the floor', () => {
    const map = makeMap();
    const manager = new MapNavigationManager(map as unknown as maplibregl.Map);
    manager.fitAndConstrain(city);

    expect(manager.getZoomState()).toEqual({ zoom: 10, min: 10, max: 18 });
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

  it('ignores non-finite zoom requests', () => {
    const map = makeMap();
    const manager = new MapNavigationManager(map as unknown as maplibregl.Map);

    manager.setZoom(Number.NaN);
    expect(map.setZoom).not.toHaveBeenCalled();
  });
});
