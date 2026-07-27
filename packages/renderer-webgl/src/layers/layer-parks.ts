/** Registers DLC park-area markers and labels under the districts layer. */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { buildParkColorExpression } from '../expressions/park-color';
import { buildParkAreasGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/**
 * Adds the park-area source plus its marker and label layers.
 *
 * Park areas are an opt-in districts sublayer, so both MapLibre layers start
 * hidden and `MapLayerManager` applies their effective visibility.
 */
export function addParksLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'parks', {
    type: 'geojson',
    data: buildParkAreasGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'park-areas-points',
    type: 'circle',
    source: 'parks',
    layout: { visibility: 'none' },
    paint: {
      'circle-color': buildParkColorExpression(colors),
      'circle-radius': 3,
      'circle-stroke-color': colors.districtLabel,
      'circle-stroke-width': 1,
      'circle-opacity': 1,
      'circle-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'park-areas-labels',
    type: 'symbol',
    source: 'parks',
    layout: {
      visibility: 'none',
      'text-field': ['get', 'name'],
      'text-font': ['DM Mono'],
      'text-size': 10,
      'text-anchor': 'top',
      'text-offset': [0, 0.75],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
    },
    paint: {
      'text-color': colors.districtLabel,
      'text-halo-color': colors.background,
      'text-halo-width': 1.5,
      'text-opacity': 1,
    },
  });
}
