import type { LayerName } from '@vellum/core';

/**
 * Maps each logical `LayerName` to the MapLibre layer IDs that implement it.
 * `terrain` is controlled by the background layer paint property.
 */
export const LAYER_ID_MAP: Record<LayerName, string[]> = {
  terrain: ['terrain-fill', 'terrain-lines-layer', 'coastline-layer'],
  water: ['base-water', 'base-land'],
  roads: [
    'roads-casing',
    'roads-fill',
    'roads-tunnel-bridge-casing',
    'roads-tunnel-bridge-fill',
    'roads-ferry',
    'roads-railway-surface-casing',
    'roads-railway-surface-fill',
    'roads-railway-elevated-casing',
    'roads-railway-elevated-fill',
    'roads-railway-underground-casing',
    'roads-railway-underground-fill',
  ],
  transit: [
    'transit-connector',
    'transit-line',
    'transit-stops',
    'transit-stops-outline',
    'transit-stops-dot',
  ],
  buildings: ['buildings-fill', 'buildings-outline', 'service-icons'],
  forests: ['forests-circles'],
  districts: ['districts-points', 'districts-labels'],
};

/** Multiplier applied to each non-transit layer's baseline opacity when the Transit theme is active. */
export const TRANSIT_DIM_FACTOR = 0.15;

/**
 * Baseline opacity (and paint property) for every non-transit layer id, used to
 * compute the dimmed value (`baseline * TRANSIT_DIM_FACTOR`) in `MapLayerManager.setTransitDimming`.
 * `forests-circles` uses a data-driven expression instead of a plain number — its
 * dimmed variant scales the existing expression via `['*', expr, factor]`.
 */
export const NON_TRANSIT_OPACITY: Record<
  string,
  {
    prop:
      | 'fill-opacity'
      | 'line-opacity'
      | 'circle-opacity'
      | 'icon-opacity'
      | 'text-opacity';
    base: unknown;
  }
> = {
  'terrain-lines-layer': { prop: 'line-opacity', base: 0.5 },
  'coastline-layer': { prop: 'line-opacity', base: 0.8 },
  'base-water': { prop: 'fill-opacity', base: 1 },
  'base-land': { prop: 'fill-opacity', base: 1 },
  'roads-casing': { prop: 'line-opacity', base: 1 },
  'roads-fill': { prop: 'line-opacity', base: 1 },
  'roads-tunnel-bridge-casing': { prop: 'line-opacity', base: 1 },
  'roads-tunnel-bridge-fill': { prop: 'line-opacity', base: 1 },
  'roads-ferry': { prop: 'line-opacity', base: 0.65 },
  'roads-railway-surface-casing': { prop: 'line-opacity', base: 1 },
  'roads-railway-surface-fill': { prop: 'line-opacity', base: 1 },
  'roads-railway-elevated-casing': { prop: 'line-opacity', base: 1 },
  'roads-railway-elevated-fill': { prop: 'line-opacity', base: 1 },
  'roads-railway-underground-casing': { prop: 'line-opacity', base: 0.55 },
  'roads-railway-underground-fill': { prop: 'line-opacity', base: 0.55 },
  'buildings-fill': { prop: 'fill-opacity', base: 0.85 },
  'buildings-outline': { prop: 'line-opacity', base: 1 },
  'service-icons': { prop: 'icon-opacity', base: 1 },
  'forests-circles': {
    prop: 'circle-opacity',
    base: [
      'interpolate',
      ['linear'],
      ['get', 'density'],
      0,
      0.3,
      1,
      0.7,
    ] as unknown,
  },
  'districts-points': { prop: 'circle-opacity', base: 1 },
  'districts-labels': { prop: 'text-opacity', base: 1 },
};
