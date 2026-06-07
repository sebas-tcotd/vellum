/**
 * Transit lines and stops layer registration.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
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
      'line-width': 2,
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
