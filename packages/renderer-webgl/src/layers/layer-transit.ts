/**
 * Transit layer group: offset corridor lines, inner connections, stations.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 *
 * Implements the paper's rendering model (SIGSPATIAL 2018 §5) on MapLibre:
 * each line feature carries `offsetIdx` (its slot in the corridor bundle) and
 * is displaced by `line-offset`. The offset expression is calibrated so that
 * one index unit equals exactly `SLOT_M` world meters at every zoom
 * (`px = m × 512·2^zoom / 40075016.686` at the equator, where all Vellum
 * geometry lives — see coordinate-transform.ts). This keeps the GPU-offset
 * line ends congruent with the precomputed world-space inner-connection
 * Béziers and station polygons.
 *
 * `line-width` follows the same geographic scaling at detail zooms but is
 * clamped at low zooms for legibility (documented deviation: at overview
 * zooms the offsets collapse below a pixel and the bundle visually merges
 * into a single stroke, which matches how geographic maps degrade).
 */

import type { CityData } from '@vellum/core';
import maplibregl from 'maplibre-gl';
import { buildTransitRenderData } from '../geojson-builder';
import { LINE_WIDTH_M, SLOT_M } from '../transit/render-geometry';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';

// Pixels per world meter at the equator for zoom 13 (512px tiles):
// 512 × 2^13 / 40075016.686
const PX_PER_M_Z13 = (512 * 8192) / 40075016.686;
const Z_LO = 13;
const Z_HI = 18;
const SCALE_HI = 2 ** (Z_HI - Z_LO);

// Station marker style (paper §5.4 / Fig. 10: solid white body, visible black
// stroke). Kept as named constants here — consistent with how this layer
// already carried its marker colors — rather than added to the theme system,
// since the black-on-white station convention is fixed, not theme-dependent.
const STATION_FILL = '#ffffff';
const STATION_STROKE = '#111111';
/** Black outline width in world meters (drawn as a scaled line on the ring). */
const STATION_STROKE_M = LINE_WIDTH_M * 0.5;
/** Minimum on-screen stroke width in px, so the outline stays visible when zoomed out. */
const STATION_STROKE_MIN_PX = 1.6;

/** Geographic exponential width expression scaled by `factor`, clamped at low zoom. */
function scaledWidthExpression(
  worldMeters: number,
  minPx: number,
): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    Z_LO,
    Math.max(minPx, worldMeters * PX_PER_M_Z13),
    16,
    worldMeters * PX_PER_M_Z13 * 2 ** (16 - Z_LO),
    Z_HI,
    worldMeters * PX_PER_M_Z13 * SCALE_HI,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** Geographic exponential width expression, clamped at low zoom. */
function widthExpression(): maplibregl.ExpressionSpecification {
  return scaledWidthExpression(LINE_WIDTH_M, 0.9);
}

/** Adds transit corridor lines, inner connections, and station polygons. */
export function addTransitLayers(
  map: maplibregl.Map,
  cityData: CityData,
): void {
  const data = buildTransitRenderData(cityData);

  addSourceIfAbsent(map, 'transit', { type: 'geojson', data: data.lines });
  addSourceIfAbsent(map, 'transit-connectors', {
    type: 'geojson',
    data: data.connectors,
  });
  addSourceIfAbsent(map, 'transit-stops', {
    type: 'geojson',
    data: data.stations,
  });

  // Inner connections first (under the corridor lines): their geometry is
  // pre-displaced, so they render without line-offset.
  addLayerIfAbsent(map, {
    id: 'transit-connector',
    type: 'line',
    source: 'transit-connectors',
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': [
        'get',
        'color',
      ] as unknown as maplibregl.ExpressionSpecification,
      'line-width': widthExpression(),
    },
  });

  addLayerIfAbsent(map, {
    id: 'transit-line',
    type: 'line',
    source: 'transit',
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': [
        'get',
        'color',
      ] as unknown as maplibregl.ExpressionSpecification,
      // Exact geographic offset: offsetIdx × SLOT_M meters at every zoom, so
      // GPU-offset line ends meet the precomputed connector endpoints.
      'line-offset': [
        'interpolate',
        ['exponential', 2],
        ['zoom'],
        Z_LO,
        ['*', ['get', 'offsetIdx'], SLOT_M * PX_PER_M_Z13],
        Z_HI,
        ['*', ['get', 'offsetIdx'], SLOT_M * PX_PER_M_Z13 * SCALE_HI],
      ] as unknown as maplibregl.ExpressionSpecification,
      'line-width': widthExpression(),
    },
  });

  // Station markers on top (paper §5 step 4): solid white body…
  addLayerIfAbsent(map, {
    id: 'transit-stops',
    type: 'fill',
    source: 'transit-stops',
    paint: {
      'fill-color': STATION_FILL,
      'fill-opacity': 1,
    },
  });

  // …with a clearly visible black stroke. A `line` layer on the same polygon
  // source renders the ring at a real, zoom-scaled width (the fill layer's
  // `fill-outline-color` is only a hairline 1px and reads as barely visible).
  addLayerIfAbsent(map, {
    id: 'transit-stops-outline',
    type: 'line',
    source: 'transit-stops',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': STATION_STROKE,
      'line-width': scaledWidthExpression(
        STATION_STROKE_M,
        STATION_STROKE_MIN_PX,
      ),
    },
  });
}
