/**
 * Terrain layer registration: raster image, coastline, and contour lines.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { CS1_HALF_EXTENT_DEG } from '../coordinate-transform';
import {
  buildCoastlineGeoJson,
  buildContourLinesGeoJson,
} from '../geojson-builder';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/**
 * Adds terrain image source, coastline layer, and contour lines layer.
 *
 * @remarks
 * The terrain texture is a 1081×1081 RGBA PNG covering the full CS1 world
 * extent (±8640 units = ±CS1_HALF_EXTENT_DEG degrees at the equator). Water
 * pixels are transparent so the water-fill layer underneath shows through.
 */
export function addTerrainLayers(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addTerrainImageSource(map, cityData);
  addCoastlineLayer(map, cityData, colors);
  addContourLinesLayer(map, cityData);
}

function addTerrainImageSource(map: maplibregl.Map, cityData: CityData): void {
  const h = CS1_HALF_EXTENT_DEG;
  const imageCoordinates: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ] = [
    [-h, h],
    [h, h],
    [h, -h],
    [-h, -h],
  ];

  if (!map.getSource('terrain')) {
    map.addSource('terrain', {
      type: 'image',
      url: cityData.terrainTexture,
      coordinates: imageCoordinates,
    });
  } else {
    (map.getSource('terrain') as maplibregl.ImageSource).updateImage({
      url: cityData.terrainTexture,
      coordinates: imageCoordinates,
    });
  }

  // TODO(epic-5): Reactivate raster layer for terrain texture rendering.
  // if (!map.getLayer('terrain-fill')) {
  //   map.addLayer({
  //     id: 'terrain-fill',
  //     type: 'raster',
  //     source: 'terrain',
  //     paint: {
  //       'raster-opacity': 1,
  //       'raster-fade-duration': 0,
  //       'raster-resampling': 'nearest',
  //     },
  //   });
  // }
}

function addCoastlineLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'coastline-source', {
    type: 'geojson',
    data: buildCoastlineGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'coastline-layer',
    type: 'line',
    source: 'coastline-source',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': colors.coastlineStroke,
      'line-width': 4,
      'line-opacity': 0.8,
    },
  });
}

function addContourLinesLayer(map: maplibregl.Map, cityData: CityData): void {
  addSourceIfAbsent(map, 'terrain-lines-source', {
    type: 'geojson',
    data: buildContourLinesGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'terrain-lines-layer',
    type: 'line',
    source: 'terrain-lines-source',
    paint: {
      'line-color': '#000000',
      'line-width': 0.5,
      'line-opacity': 0.5,
    },
  });
}
