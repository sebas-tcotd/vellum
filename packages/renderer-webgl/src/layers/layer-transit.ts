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

/** Adds transit line source + layer and transit stops source + layer. */
export function addTransitLayers(
  map: maplibregl.Map,
  cityData: CityData,
): void {
  addSourceIfAbsent(map, 'transit', {
    type: 'geojson',
    data: buildTransitGeoJson(cityData),
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
      // Stacked-band rendering: each feature's lineWidthMultiplier scales the
      // base width so that N lines on the same segment produce N equal-width
      // visible colour bands (widest feature drawn first, narrowest on top).
      'line-width': [
        '*',
        ['get', 'lineWidthMultiplier'],
        ['interpolate', ['exponential', 1.5], ['zoom'], 10, 1.5, 14, 3, 18, 6],
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
