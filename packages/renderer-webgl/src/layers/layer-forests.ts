/**
 * Forests layer registration: density-based circles.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import {
  FORESTS_CIRCLE_OPACITY_EXPRESSION,
  HEAVY_SOURCE_MAX_ZOOM,
} from '../constants/layer.constants';
import { buildForestsGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/** Adds forests source and circle layer with density-driven radius/opacity. */
export function addForestsLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'forests', {
    type: 'geojson',
    data: buildForestsGeoJson(cityData),
    // Capped so detail-zoom panning re-uses tiles instead of slicing new ones.
    maxzoom: HEAVY_SOURCE_MAX_ZOOM,
  });

  addLayerIfAbsent(map, {
    id: 'forests-circles',
    type: 'circle',
    source: 'forests',
    paint: {
      'circle-color': colors.forests,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['get', 'density'],
        0,
        1,
        1,
        4,
      ] as unknown as maplibregl.ExpressionSpecification,
      'circle-opacity':
        FORESTS_CIRCLE_OPACITY_EXPRESSION as unknown as maplibregl.ExpressionSpecification,
      'circle-opacity-transition': { duration: 300 },
    },
  });
}
