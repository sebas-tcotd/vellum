import type { LayerName } from '@vellum/core';
import { ELEVATION_UNITS_PER_METER } from '../sources/dem-protocol';

/**
 * Vertical exaggeration for the `terrain-hillshade` layer, in "metres" terms: CS1
 * terrain is gentle relative to its 17 km span, so a mild boost is needed for slopes to
 * read at all.
 */
const HILLSHADE_EXAGGERATION_M = 0.35;

/**
 * Exaggeration actually handed to MapLibre.
 *
 * @remarks
 * The DEM carries **raw game units**, which are 64x metres, and MapLibre derives slope
 * from DEM values against real-world tile spacing — so the terrain reads 64x steeper
 * than it is. Observed on `altavento` at the uncorrected value: the hillshade saturated
 * to solid black and white and swamped the hypsometric tint entirely. Dividing by the
 * unit scale restores metre-equivalent slopes.
 */
export const HILLSHADE_EXAGGERATION =
  HILLSHADE_EXAGGERATION_M / ELEVATION_UNITS_PER_METER;

/**
 * Maps each logical `LayerName` to the MapLibre layer IDs that implement it.
 *
 * `terrain` holds only altitude-derived layers; the flat cartography they sit on lives
 * in `basemap`. The two interleave in z-order (`base-land` → relief → `base-water`), so
 * this map is deliberately not in registration order.
 */
export const LAYER_ID_MAP: Record<LayerName, string[]> = {
  terrain: ['terrain-color-relief', 'terrain-hillshade', 'terrain-lines-layer'],
  basemap: ['base-land', 'base-water', 'coastline-layer', 'grid-layer'],
  roads: [
    'roads-tunnel-casing',
    'roads-tunnel-fill',
    'roads-casing',
    'roads-fill',
    'roads-bridge-shadow',
    'roads-bridge-casing',
    'roads-bridge-fill',
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
  districts: [
    'districts-points',
    'districts-labels',
    'park-areas-points',
    'park-areas-labels',
  ],
};

/** Layer ID for the Vellum watermark logo shown when all data layers are disabled. */
export const WATERMARK_LAYER_ID = 'vellum-watermark';

/**
 * Layer IDs for the decorative map frame and its shadow.
 *
 * @remarks
 * These are always rendered above all city-data layers and are NOT user-toggleable.
 * They are cleaned up by {@link MapSourceManager.clearAll}.
 */
export const FRAME_LAYER_IDS = ['map-frame-shadow', 'map-frame'] as const;

/** Multiplier applied to each non-transit layer's baseline opacity when the Transit theme is active. */
export const TRANSIT_DIM_FACTOR = 0.15;

/**
 * Baseline opacity (and paint property) for every non-transit layer id, used to
 * compute the dimmed value (`baseline * TRANSIT_DIM_FACTOR`) in `MapLayerManager.setTransitDimming`.
 * `forests-circles` uses a data-driven expression instead of a plain number — its
 * dimmed variant scales the existing expression via `['*', expr, factor]`.
 *
 * `terrain-hillshade` is the one entry that does not scale an opacity: MapLibre's
 * `HillshadePaintProps` has no `hillshade-opacity`, so the layer is dimmed by scaling
 * its exaggeration towards zero instead, which flattens the shading. The generic
 * `['*', base, factor]` mechanism applies unchanged.
 */
export const NON_TRANSIT_OPACITY: Record<
  string,
  {
    prop:
      | 'fill-opacity'
      | 'line-opacity'
      | 'circle-opacity'
      | 'icon-opacity'
      | 'text-opacity'
      | 'color-relief-opacity'
      | 'hillshade-exaggeration';
    base: unknown;
  }
> = {
  'terrain-color-relief': { prop: 'color-relief-opacity', base: 1 },
  'terrain-hillshade': {
    prop: 'hillshade-exaggeration',
    base: HILLSHADE_EXAGGERATION,
  },
  'terrain-lines-layer': { prop: 'line-opacity', base: 0.5 },
  'coastline-layer': { prop: 'line-opacity', base: 0.8 },
  'base-water': { prop: 'fill-opacity', base: 1 },
  'base-land': { prop: 'fill-opacity', base: 1 },
  'roads-casing': { prop: 'line-opacity', base: 1 },
  'roads-fill': { prop: 'line-opacity', base: 1 },
  'roads-tunnel-casing': { prop: 'line-opacity', base: 0.55 },
  'roads-tunnel-fill': { prop: 'line-opacity', base: 0.55 },
  'roads-bridge-casing': { prop: 'line-opacity', base: 1 },
  'roads-bridge-shadow': { prop: 'line-opacity', base: 0.3 },
  'roads-bridge-fill': { prop: 'line-opacity', base: 1 },
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
  'park-areas-points': { prop: 'circle-opacity', base: 1 },
  'park-areas-labels': { prop: 'text-opacity', base: 1 },
  'grid-layer': { prop: 'line-opacity', base: 0.25 },
};
