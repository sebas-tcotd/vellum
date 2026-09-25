/**
 * District and park boundary outlines (native `.vellummap` documents only).
 *
 * @remarks
 * Internal module — not exported from the package barrel. Registered below
 * buildings and roads, not with the district markers: an outline drawn over
 * the street network would cross every road and transit line it meets.
 */

import type { CityData } from '@vellum/core';
import type * as maplibregl from 'maplibre-gl';
import {
  DISTRICT_BOUNDARY_OPACITY,
  PARK_BOUNDARY_OPACITY,
} from '../constants/layer.constants';
import { buildParkColorExpression } from '../expressions/park-color';
import { buildAreaBoundariesGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/**
 * Adds the boundary source plus one line layer per area kind. Both start
 * hidden; `MapLayerManager` gives districts the `districts` layer visibility
 * and parks the park-area sublayer's, exactly like their markers.
 */
export function addAreaBoundariesLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'area-boundaries', {
    type: 'geojson',
    data: buildAreaBoundariesGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'district-boundaries',
    type: 'line',
    source: 'area-boundaries',
    filter: ['==', ['get', 'kind'], 'district'],
    layout: { visibility: 'none', 'line-join': 'round' },
    paint: {
      'line-color': colors.districtLabel,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        1,
        16,
        2.5,
      ] as unknown as maplibregl.ExpressionSpecification,
      'line-dasharray': [4, 2],
      'line-opacity': DISTRICT_BOUNDARY_OPACITY,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'park-boundaries',
    type: 'line',
    source: 'area-boundaries',
    filter: ['==', ['get', 'kind'], 'park'],
    layout: { visibility: 'none', 'line-join': 'round' },
    paint: {
      'line-color': buildParkColorExpression(colors),
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        0.8,
        16,
        2,
      ] as unknown as maplibregl.ExpressionSpecification,
      'line-opacity': PARK_BOUNDARY_OPACITY,
      'line-opacity-transition': { duration: 300 },
    },
  });
}
