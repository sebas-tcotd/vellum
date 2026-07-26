/**
 * Base cartography: the flat map the relief sits on.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 *
 * The `basemap` logical layer owns everything that is *not* derived from altitude: the
 * land fill, the sea, the inland water bodies and the coastline. It is registered in two
 * passes because the terrain relief has to be sandwiched between them:
 *
 * ```
 * base-land            ← flat land fill, the fallback shown when `terrain` is off
 *   terrain-color-relief / terrain-hillshade
 * base-water           ← sea + lakes, painted back over the relief
 * coastline-layer
 * ```
 *
 * Painting the water *after* the relief is not cosmetic: `color-relief` and `hillshade`
 * cover the whole DEM including the sea floor, and MapLibre cannot clip a raster layer
 * to a polygon. Clipping by elevation is impossible too — land and water elevation
 * ranges overlap in real maps (measured on `altavento`: land 146.8…633.1 m vs. water
 * 25.0…215.7 m, with 31 % of land cells below the highest water cell). The vector
 * coastline the parser already produces is the only exact boundary available.
 */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import {
  buildCoastlineGeoJson,
  buildLandPolygonGeoJson,
  buildWaterSurfaceGeoJson,
} from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/**
 * Adds the flat land fill, which sits *below* the terrain relief.
 *
 * @remarks
 * With `terrain` visible the relief paints over this; with `terrain` hidden it is what
 * the user sees, so it must stay registered either way.
 */
export function addBasemapLandLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'base-land-source', {
    type: 'geojson',
    data: buildLandPolygonGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'base-land',
    type: 'fill',
    source: 'base-land-source',
    paint: {
      'fill-color': colors.land,
      'fill-opacity': 1,
      'fill-opacity-transition': { duration: 300 },
    },
  });
}

/**
 * Adds the water surface and the coastline, which sit *above* the terrain relief.
 *
 * @param map - The MapLibre map to register sources and layers on.
 * @param cityData - Supplies the land rings the sea is cut against, plus the coastline.
 * @param colors - Resolved theme colours.
 */
export function addBasemapWaterLayers(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'base-water-source', {
    type: 'geojson',
    data: buildWaterSurfaceGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'base-water',
    type: 'fill',
    source: 'base-water-source',
    paint: {
      'fill-color': colors.water,
      'fill-opacity': 1,
      'fill-opacity-transition': { duration: 300 },
    },
  });

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
      'line-opacity-transition': { duration: 300 },
    },
  });
}
