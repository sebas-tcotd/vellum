import {
  MAP_FRAME_SHADOW_BLUR_STOPS,
  MAP_FRAME_SHADOW_OFFSET,
  MAP_FRAME_WIDTH_STOPS,
  type ZoomStop,
} from '@vellum/core';
import type * as maplibregl from 'maplibre-gl';
import { FRAME_LAYER_IDS } from '../constants/layer.constants';
import { buildWorldExtentGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

const SHADOW_LAYER_ID = FRAME_LAYER_IDS[0];
const FRAME_LAYER_ID = FRAME_LAYER_IDS[1];

const SOURCE_ID = 'world-extent-source';

const SHADOW_COLOR = '#4A4035';
const SHADOW_OPACITY = 0.2;

/**
 * Builds the MapLibre paint expression for a zoom ramp declared in the domain.
 *
 * @remarks
 * The stop tables live in `@vellum/core` because the export framing math and
 * the export dialog both need them and cannot import this adapter (ADR-0001).
 * Generating the expression here — instead of writing the numbers twice —
 * keeps this layer the only place that decides *how* the frame is painted
 * while the geometry it is painted with exists exactly once.
 */
function zoomRampExpression(
  stops: readonly ZoomStop[],
): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    ...stops.flatMap((stop) => [stop.zoom, stop.value]),
  ] as maplibregl.ExpressionSpecification;
}

/** Viewport-anchored shadow translation, re-exported from its domain source. */
export const SHADOW_OFFSET: [number, number] = [
  MAP_FRAME_SHADOW_OFFSET[0],
  MAP_FRAME_SHADOW_OFFSET[1],
];

/** Frame stroke width ramp actually painted by {@link addMapFrameLayer}. */
export const FRAME_WIDTH_EXPR: maplibregl.ExpressionSpecification =
  zoomRampExpression(MAP_FRAME_WIDTH_STOPS);

/** Frame shadow blur ramp actually painted by {@link addMapFrameLayer}. */
export const SHADOW_BLUR_EXPR: maplibregl.ExpressionSpecification =
  zoomRampExpression(MAP_FRAME_SHADOW_BLUR_STOPS);

/**
 * Adds a decorative map frame and its drop shadow as the topmost MapLibre layers.
 *
 * @remarks
 * Both layers share a single GeoJSON source built from `buildWorldExtentGeoJson`.
 * The shadow layer uses `line-translate` with viewport anchor and `line-blur` to
 * simulate a CSS `box-shadow` effect as requested: X0, Y4, Blur 12, #4A4035 @ 20%.
 */
export function addMapFrameLayer(
  map: maplibregl.Map,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, SOURCE_ID, {
    type: 'geojson',
    data: buildWorldExtentGeoJson(),
  });

  addLayerIfAbsent(map, {
    id: SHADOW_LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': SHADOW_COLOR,
      'line-opacity': SHADOW_OPACITY,
      'line-width': FRAME_WIDTH_EXPR,
      'line-blur': SHADOW_BLUR_EXPR,
      'line-translate': SHADOW_OFFSET,
      'line-translate-anchor': 'viewport',
    },
  });

  addLayerIfAbsent(map, {
    id: FRAME_LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': colors.mapFrame,
      'line-opacity': 1,
      'line-width': FRAME_WIDTH_EXPR,
    },
  });
}
