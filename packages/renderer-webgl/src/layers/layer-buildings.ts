/**
 * Buildings layer registration: fill and outline.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { HEAVY_SOURCE_MAX_ZOOM } from '../constants/layer.constants';
import { buildBuildingsGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/** Adds buildings source and both fill + outline layers. */
export function addBuildingsLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'buildings', {
    type: 'geojson',
    data: buildBuildingsGeoJson(cityData),
    // Capped so detail-zoom panning re-uses tiles instead of slicing new ones.
    maxzoom: HEAVY_SOURCE_MAX_ZOOM,
  });

  addLayerIfAbsent(map, {
    id: 'buildings-fill',
    type: 'fill',
    source: 'buildings',
    paint: {
      'fill-color': colors.buildingFill,
      'fill-opacity': 0.85,
      'fill-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'buildings-outline',
    type: 'line',
    source: 'buildings',
    paint: {
      'line-color': colors.buildingStroke,
      'line-width': 0.5,
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });
}
