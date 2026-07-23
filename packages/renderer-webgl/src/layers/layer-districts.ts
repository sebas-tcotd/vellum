/**
 * Districts layer registration: labeled points.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { buildDistrictsGeoJson } from '../geojson-builder';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/** Adds districts source and circle layer with fill + stroke. */
export function addDistrictsLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'districts', {
    type: 'geojson',
    data: buildDistrictsGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'districts-points',
    type: 'circle',
    source: 'districts',
    paint: {
      'circle-color': colors.districtFill,
      'circle-radius': 6,
      'circle-stroke-color': colors.districtLabel,
      'circle-stroke-width': 1,
      'circle-opacity': 1,
      'circle-opacity-transition': { duration: 300 },
    },
  });
}
