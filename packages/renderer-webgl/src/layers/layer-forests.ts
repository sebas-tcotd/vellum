/**
 * Forests layer registration: one shaded canopy raster over the whole map.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import type * as maplibregl from 'maplibre-gl';
import { FORESTS_CANOPY_OPACITY } from '../constants/layer.constants';
import { addSourceIfAbsent } from '../helpers';
import {
  buildCanopyRaster,
  CANOPY_COORDINATES,
  canopyDataUri,
  type CanopyRaster,
} from '../sources/forest-canopy';
import type { ResolvedColors } from '../style-adapter';

// ponytail: one canopy per page, like the DEM protocol's module state; key by map if
// two renderers ever share a page.
let canopy: CanopyRaster | null = null;

/** Adds the forests image source and its raster layer, tinted with the theme colour. */
export function addForestsLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  canopy = buildCanopyRaster(cityData.forestCells);
  const url = canopyDataUri(canopy, colors.forests);
  if (!url) return;

  addSourceIfAbsent(map, 'forests', {
    type: 'image',
    url,
    coordinates: CANOPY_COORDINATES,
  });

  if (map.getLayer('forests-canopy')) return;
  // Under the hillshade (and so under the sea fill), so relief shades the woods
  // instead of the woods hiding the relief — land cover first, light on top.
  map.addLayer(
    {
      id: 'forests-canopy',
      type: 'raster',
      source: 'forests',
      paint: {
        'raster-opacity': FORESTS_CANOPY_OPACITY,
        'raster-opacity-transition': { duration: 300 },
        'raster-resampling': 'linear',
        'raster-fade-duration': 0,
      },
    },
    map.getLayer('terrain-hillshade') ? 'terrain-hillshade' : undefined,
  );
}

/** Repaints the canopy in a new theme colour without rebuilding the grid. */
export function retintForests(map: maplibregl.Map, color: string): void {
  const source = map.getSource('forests') as maplibregl.ImageSource | undefined;
  if (!canopy || !source?.updateImage) return;
  const url = canopyDataUri(canopy, color);
  if (url) source.updateImage({ url });
}
