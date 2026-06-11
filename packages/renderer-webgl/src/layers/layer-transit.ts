/**
 * Transit lines and stops layer registration.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import maplibregl from 'maplibre-gl';
import {
  buildTransitGeoJson,
  buildTransitStopsGeoJson,
} from '../geojson-builder';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';

// ─── Line-width interpolation stops (must stay in sync with the paint below) ─

const LINE_WIDTH_STOPS: [number, number][] = [
  [10, 1.5],
  [14, 3],
  [18, 6],
];

/**
 * Returns the transit `line-width` in pixels at a given MapLibre zoom level,
 * matching the exponential (base 1.5) interpolation used in the layer paint.
 * Used to compute proportional world-space parallel offsets in `buildTransitGeoJson`.
 */
function lineWidthAtZoom(zoom: number): number {
  const z = Math.max(
    LINE_WIDTH_STOPS[0][0],
    Math.min(LINE_WIDTH_STOPS[LINE_WIDTH_STOPS.length - 1][0], zoom),
  );
  for (let k = 0; k < LINE_WIDTH_STOPS.length - 1; k++) {
    const [z0, v0] = LINE_WIDTH_STOPS[k];
    const [z1, v1] = LINE_WIDTH_STOPS[k + 1];
    if (z >= z0 && z <= z1) {
      const BASE = 1.5;
      const t = (Math.pow(BASE, z - z0) - 1) / (Math.pow(BASE, z1 - z0) - 1);
      return v0 + (v1 - v0) * t;
    }
  }
  return LINE_WIDTH_STOPS[LINE_WIDTH_STOPS.length - 1][1];
}

/**
 * Converts pixels to equatorial WGS-84 degrees at a given MapLibre zoom level.
 * At latitude ≈ 0 the Mercator scale factor is 1 so no cosine correction is needed.
 */
function pxToDeg(zoom: number): number {
  return 360 / (Math.pow(2, zoom) * 256);
}

/**
 * Spacing between adjacent parallel transit lines in WGS-84 degrees at `zoom`.
 * Equals `line-width` (in px) × px-per-degree so that lines touch edge-to-edge,
 * mirroring the pixel-space behaviour that `line-offset` would produce.
 */
export function transitSpacingDeg(zoom: number): number {
  return lineWidthAtZoom(zoom) * pxToDeg(zoom);
}

/** Adds transit line source + layer and transit stops source + layer. */
export function addTransitLayers(
  map: maplibregl.Map,
  cityData: CityData,
  initialZoom: number,
): void {
  addSourceIfAbsent(map, 'transit', {
    type: 'geojson',
    data: buildTransitGeoJson(cityData, transitSpacingDeg(initialZoom)),
  });

  addLayerIfAbsent(map, {
    id: 'transit-line',
    type: 'line',
    source: 'transit',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': [
        'get',
        'color',
      ] as unknown as maplibregl.ExpressionSpecification,
      // Parallel separation is baked into the GeoJSON coordinates (world-space
      // displacement) and recomputed on zoom change, so no line-offset needed.
      'line-width': [
        'interpolate',
        ['exponential', 1.5],
        ['zoom'],
        10,
        1.5,
        14,
        3,
        18,
        6,
      ] as unknown as maplibregl.ExpressionSpecification,
      'line-opacity': 0.85,
    },
  });

  addSourceIfAbsent(map, 'transit-stops', {
    type: 'geojson',
    data: buildTransitStopsGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'transit-stops',
    type: 'circle',
    source: 'transit-stops',
    paint: {
      'circle-color': [
        'get',
        'color',
      ] as unknown as maplibregl.ExpressionSpecification,
      'circle-radius': 4,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
}

/**
 * Replaces the transit source data with freshly displaced coordinates for the
 * given zoom level.  Call on `zoomend` so parallel offsets stay proportional
 * to `line-width` across the full zoom range.
 */
export function updateTransitSource(
  map: maplibregl.Map,
  cityData: CityData,
  zoom: number,
): void {
  const source = map.getSource('transit');
  if (source && source.type === 'geojson') {
    (source as maplibregl.GeoJSONSource).setData(
      buildTransitGeoJson(cityData, transitSpacingDeg(zoom)),
    );
  }
}
