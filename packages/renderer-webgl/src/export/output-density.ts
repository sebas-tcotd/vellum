/**
 * Conversion between an export's output density and the MapLibre zoom that
 * renders at that density.
 *
 * @remarks
 * Shared by the tiled raster planner and the SVG export policy. Both need to
 * answer the same question — "at this many world units per output pixel, what
 * zoom is the user effectively looking at?" — and a second copy of this
 * formula would let the two routes disagree about scale for the same map.
 */

import { CS1_EXTENT_DEG, CS1_WORLD_SIZE } from '../coordinate-transform';

/** Tile edge in pixels that MapLibre's zoom scale is defined against. */
const MAPLIBRE_TILE_SIZE_PX = 512;

/**
 * Resolves the MapLibre zoom that renders at a given output density.
 *
 * @param worldUnitsPerPixel - CS1 world units covered by one output pixel.
 * @returns The equivalent, possibly fractional, MapLibre zoom level.
 */
export function zoomForWorldUnitsPerPixel(worldUnitsPerPixel: number): number {
  return Math.log2(
    360 /
      (MAPLIBRE_TILE_SIZE_PX *
        (CS1_EXTENT_DEG / CS1_WORLD_SIZE) *
        worldUnitsPerPixel),
  );
}
