import type { LayerName } from '@vellum/core';
import { ELEVATION_UNITS_PER_METER } from '../sources/dem-protocol';

/**
 * Vertical exaggeration for the `terrain-hillshade` layer, in "metres" terms: CS1
 * terrain is gentle relative to its 17 km span, so a mild boost is needed for slopes to
 * read at all.
 */
const HILLSHADE_EXAGGERATION_M = 0.35;

/**
 * Baseline `circle-opacity` expression for `forests-circles`, shared with the layer's
 * own paint definition in `layers/layer-forests.ts` so the two never drift apart.
 * Kept low so dense forest doesn't read as a solid block at low zoom.
 */
export const FORESTS_CIRCLE_OPACITY_EXPRESSION = [
  'interpolate',
  ['linear'],
  ['get', 'density'],
  0,
  0.08,
  1,
  0.25,
] as const;

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

/**
 * Deepest zoom at which the three heaviest GeoJSON sources are sliced into tiles.
 *
 * @remarks
 * `buildings` (43k polygons on a large city), `forests` (54.5k points) and
 * `roads` (10.3k lines) are together about two thirds of the tile-slicing cost —
 * around 33 MB of the ~40 MB a city hands to the workers. MapLibre defaults a
 * GeoJSON source's `maxzoom` to 18, so it keeps cutting fresh tiles all the way
 * in, and every pan at detail zoom pays for it. Capping the source makes MapLibre
 * overzoom the deepest sliced level instead: past this zoom, panning re-uses
 * tiles rather than cutting new ones.
 *
 * Measured on `san-rico` at z16.5, tile events per pan burst: ~550 uncapped,
 * ~120 capped here. Below this zoom nothing changes — z13 is still sliced z13.
 *
 * 14 puts geojson-vt's simplification tolerance at roughly 1.8 m in world terms.
 * Building footprints are rectangles with no interior vertices to drop, and road
 * centrelines absorb it, so the overzoomed geometry reads the same at z18 —
 * confirmed by eye before this was adopted. Raise it if a future layer on one of
 * these sources needs finer geometry at detail zoom.
 */
export const HEAVY_SOURCE_MAX_ZOOM = 14;

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
      | 'hillshade-exaggeration'
      | 'background-opacity';
    base: unknown;
  }
> = {
  // Dimmed like every other non-transit layer: it sits beneath everything else,
  // so leaving it undimmed would keep the full-brightness theme color dominant
  // even once terrain/roads/buildings above it faded out.
  background: { prop: 'background-opacity', base: 1 },
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
    base: FORESTS_CIRCLE_OPACITY_EXPRESSION,
  },
  'districts-points': { prop: 'circle-opacity', base: 1 },
  'districts-labels': { prop: 'text-opacity', base: 1 },
  'park-areas-points': { prop: 'circle-opacity', base: 1 },
  'park-areas-labels': { prop: 'text-opacity', base: 1 },
  'grid-layer': { prop: 'line-opacity', base: 0.25 },
};
