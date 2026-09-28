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
  DISTRICT_FILL_OPACITY,
  DISTRICT_SELECTED_OPACITY,
  DISTRICT_SELECTED_OUTLINE_COLOR,
  PARK_BOUNDARY_OPACITY,
} from '../constants/layer.constants';
import { buildParkColorExpression } from '../expressions/park-color';
import {
  buildAreaBoundariesGeoJson,
  buildDistrictAreasGeoJson,
} from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/**
 * Filter of the `district-selected` layer for a given selection.
 *
 * @param id - Selected district id, or `null` to match nothing.
 */
export function selectedDistrictFilter(
  id: string | null,
): maplibregl.FilterSpecification {
  // `null` matches nothing: no id value can be used as a sentinel, since any
  // string could be a real district id.
  return (
    id === null ? ['boolean', false] : ['==', ['get', 'id'], id]
  ) as maplibregl.FilterSpecification;
}

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

  // The optional light tint, under the dashed outline. Hidden until
  // `districts.showFill` is on; `.cslmap` has no areas, so it stays empty.
  addSourceIfAbsent(map, 'district-areas', {
    type: 'geojson',
    data: buildDistrictAreasGeoJson(cityData),
  });
  addLayerIfAbsent(map, {
    id: 'district-fill',
    type: 'fill',
    source: 'district-areas',
    layout: { visibility: 'none' },
    paint: {
      'fill-color': colors.districtFill,
      'fill-opacity': DISTRICT_FILL_OPACITY,
      'fill-opacity-transition': { duration: 300 },
    },
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

/**
 * Adds the selected-district tint and its accent outline on the
 * `district-areas` source that {@link addAreaBoundariesLayer} registered.
 *
 * @remarks
 * Registered over buildings, roads and transit (and under the district names)
 * so the selection reads on top of the map, unlike the optional fill and the
 * boundaries, which stay under the street network. Independent of `showFill`:
 * `MapLayerManager.setSelectedDistrict` drives filter and visibility. Both
 * match nothing until a district is selected.
 */
export function addDistrictSelectionLayers(
  map: maplibregl.Map,
  colors: ResolvedColors,
): void {
  if (!map.getSource('district-areas')) return;
  addLayerIfAbsent(map, {
    id: 'district-selected',
    type: 'fill',
    source: 'district-areas',
    filter: selectedDistrictFilter(null),
    layout: { visibility: 'none' },
    paint: {
      'fill-color': colors.districtFill,
      'fill-opacity': DISTRICT_SELECTED_OPACITY,
    },
  });
  addLayerIfAbsent(map, {
    id: 'district-selected-outline',
    type: 'line',
    source: 'district-areas',
    filter: selectedDistrictFilter(null),
    layout: { visibility: 'none', 'line-join': 'round' },
    paint: {
      'line-color': DISTRICT_SELECTED_OUTLINE_COLOR,
      'line-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        1.5,
        16,
        3,
      ] as unknown as maplibregl.ExpressionSpecification,
      'line-dasharray': [3, 2],
      'line-opacity': 1,
    },
  });
}
