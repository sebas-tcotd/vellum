import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { buildGridGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { GridResolved } from '../style-adapter';

export function addGridLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: GridResolved,
): void {
  addSourceIfAbsent(map, 'grid-source', {
    type: 'geojson',
    data: buildGridGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'grid-layer',
    type: 'line',
    source: 'grid-source',
    paint: {
      'line-color': colors.line,
      'line-opacity': colors.opacity,
      'line-width': colors.width,
      'line-dasharray': colors.dasharray,
    },
  });
}
