/**
 * Terrain relief: everything derived from altitude.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 *
 * The `terrain` logical layer owns the colour relief, the hillshade and the contour
 * lines — and nothing else. The flat cartography underneath (land fill, sea, lakes,
 * coastline) belongs to `basemap`, so the two can be toggled independently: `basemap`
 * alone is the plain map, `terrain` alone is the bare elevation field.
 *
 * `color-relief` and `hillshade` share one `raster-dem` source, so the DEM is decoded
 * and uploaded once. They are registered between the two `basemap` passes — above the
 * land fill, below the water surface — see `layer-basemap.ts` for why the water has to
 * come back on top.
 */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { HILLSHADE_EXAGGERATION } from '../constants/layer.constants';
import { CS1_HALF_EXTENT_DEG } from '../coordinate-transform';
import {
  buildColorReliefRamp,
  buildContourColorRamp,
} from '../expressions/terrain-relief';
import { buildContourLinesGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import {
  DEM_ENCODING,
  DEM_MAX_ZOOM,
  DEM_MIN_ZOOM,
  DEM_TILE_SIZE,
  DEM_TILE_URL,
} from '../sources/dem-protocol';
import type { ResolvedColors } from '../style-adapter';

/** Default sun azimuth, in degrees clockwise from north — the cartographic convention. */
const HILLSHADE_AZIMUTH = 315;
/** Default sun altitude above the horizon, in degrees. */
const HILLSHADE_ALTITUDE = 45;

/**
 * Adds the DEM source plus the colour-relief and hillshade layers.
 *
 * @param map - The MapLibre map to register sources and layers on.
 * @param cityData - Supplies the DEM payload and its elevation domain.
 * @param colors - Resolved theme colours, including the hypsometric ramp stops.
 */
export function addTerrainReliefLayers(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  const h = CS1_HALF_EXTENT_DEG;

  addSourceIfAbsent(map, 'terrain-dem', {
    type: 'raster-dem',
    tiles: [DEM_TILE_URL],
    bounds: [-h, -h, h, h],
    minzoom: DEM_MIN_ZOOM,
    maxzoom: DEM_MAX_ZOOM,
    tileSize: DEM_TILE_SIZE,
    ...DEM_ENCODING,
  } as unknown as maplibregl.RasterDEMSourceSpecification);

  addLayerIfAbsent(map, {
    id: 'terrain-color-relief',
    type: 'color-relief',
    source: 'terrain-dem',
    paint: {
      'color-relief-color': buildColorReliefRamp(
        colors.terrain,
        cityData.terrainDem,
      ),
      'color-relief-opacity': 1,
      'color-relief-opacity-transition': { duration: 300 },
    },
  } as unknown as maplibregl.LayerSpecification);

  addLayerIfAbsent(map, {
    id: 'terrain-hillshade',
    type: 'hillshade',
    source: 'terrain-dem',
    paint: {
      'hillshade-method': 'igor',
      'hillshade-illumination-direction': HILLSHADE_AZIMUTH,
      'hillshade-illumination-altitude': HILLSHADE_ALTITUDE,
      'hillshade-illumination-anchor': 'map',
      'hillshade-exaggeration': HILLSHADE_EXAGGERATION,
    },
  } as unknown as maplibregl.LayerSpecification);
}

/**
 * Adds the contour lines, registered last so they read on top of the water surface.
 */
export function addTerrainContourLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'terrain-lines-source', {
    type: 'geojson',
    data: buildContourLinesGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'terrain-lines-layer',
    type: 'line',
    source: 'terrain-lines-source',
    paint: {
      // Hypsometric from the start: each isoline follows the relief ramp at
      // its own altitude with theme-directed contrast. `applyTheme` and
      // `setOptions` use the same helper.
      'line-color': buildContourColorRamp(
        colors.terrain,
        colors.contourLine,
        cityData.terrainDem,
        cityData.contourLines.map((contour) => contour.elevation),
      ),
      'line-width': 1,
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });
}
