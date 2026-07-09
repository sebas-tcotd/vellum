/**
 * Base water + land polygon layer registration.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { buildLandPolygonGeoJson, buildWaterGeoJson } from '../geojson-builder';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/**
 * Adds a single GeoJSON source holding both the full-world-extent water polygon
 * and the vectorised land polygons. Two fill layers filter by `kind` property
 * so each can be styled independently while sharing one source update path.
 */
export function addBaseLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  const waterFeatures = buildWaterGeoJson().features.map((f) => ({
    ...f,
    properties: { kind: 'water' as const },
  }));
  const landFeatures = buildLandPolygonGeoJson(cityData).features.map((f) => ({
    ...f,
    properties: { kind: 'land' as const },
  }));

  addSourceIfAbsent(map, 'base', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [...waterFeatures, ...landFeatures],
    },
  });

  addLayerIfAbsent(map, {
    id: 'base-water',
    type: 'fill',
    source: 'base',
    filter: [
      '==',
      ['get', 'kind'],
      'water',
    ] as unknown as maplibregl.ExpressionSpecification,
    paint: { 'fill-color': colors.water, 'fill-opacity': 1 },
  });

  addLayerIfAbsent(map, {
    id: 'base-land',
    type: 'fill',
    source: 'base',
    filter: [
      '==',
      ['get', 'kind'],
      'land',
    ] as unknown as maplibregl.ExpressionSpecification,
    paint: { 'fill-color': colors.land, 'fill-opacity': 1 },
  });
}
