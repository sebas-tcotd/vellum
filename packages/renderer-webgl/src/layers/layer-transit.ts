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

/** Geographic exponential width expression, clamped at low zoom. */
function widthExpression(): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    Z_LO,
    Math.max(0.9, LINE_WIDTH_M * PX_PER_M_Z13),
    16,
    LINE_WIDTH_M * PX_PER_M_Z13 * 2 ** (16 - Z_LO),
    Z_HI,
    LINE_WIDTH_M * PX_PER_M_Z13 * SCALE_HI,
  ] as unknown as maplibregl.ExpressionSpecification;
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

  // Station polygons on top (paper §5 step 4).
  addLayerIfAbsent(map, {
    id: 'transit-stops',
    type: 'fill',
    source: 'transit-stops',
    paint: {
      'fill-color': '#ffffff',
      'fill-opacity': 0.95,
      'fill-outline-color': '#4a4a4a',
    },
  });
}
