/**
 * Conversion between an export's output density and the MapLibre zoom that
 * renders at that density.
 *
 * @remarks
 * Shared by the tiled raster planner, the SVG export policy and the full-map
 * framing math. All three need to answer the same question — "at this many
 * world units per output pixel, what zoom is the user effectively looking
 * at?" — and a second copy of this formula would let them disagree about
 * scale for the same map.
 *
 * Pure arithmetic over the CS1 constants, so it lives in the domain layer
 * where `@vellum/core` consumers can reach it without importing the renderer
 * adapter (ADR-0001). `@vellum/renderer-webgl` re-exports it unchanged.
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

/**
 * Inverse of {@link zoomForWorldUnitsPerPixel}: the density a zoom renders at.
 *
 * @param zoom - MapLibre zoom level.
 * @returns CS1 world units covered by one output pixel at that zoom.
 */
export function worldUnitsPerPixelForZoom(zoom: number): number {
  return (
    360 /
    (MAPLIBRE_TILE_SIZE_PX * (CS1_EXTENT_DEG / CS1_WORLD_SIZE) * 2 ** zoom)
  );
}

/**
 * Rounds a raw distance to a human-readable 1/2/5 × 10^n length, never above it.
 *
 * @remarks
 * Moved here from the renderer's preview module so the marginalia layout can
 * size its scale bar without importing the adapter (ADR-0001).
 *
 * @param distance - Raw world distance the bar may cover.
 * @returns The rounded distance in CS1 metres.
 */
export function niceScaleDistance(distance: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(distance));
  const normalized = distance / magnitude;
  const multiplier = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return multiplier * magnitude;
}
