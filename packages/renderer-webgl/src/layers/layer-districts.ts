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
import type { RendererTokens } from '../tokens';

/** Adds districts source and circle layer with fill + stroke. */
export function addDistrictsLayer(
  map: maplibregl.Map,
  cityData: CityData,
  tokens: RendererTokens,
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
      'circle-color': tokens.districtFill,
      'circle-radius': 6,
      'circle-stroke-color': tokens.districtLabel,
      'circle-stroke-width': 1,
    },
  });
}
