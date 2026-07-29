/**
 * Base background layer: a single solid-color layer, no pattern.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 *
 * MapLibre/Mapbox background layers render `background-pattern` *instead of*
 * `background-color` once a pattern is set — the two do not composite. An
 * earlier version of this file attached a mostly-transparent grid-texture
 * pattern here as a decorative touch, which silently discarded every
 * `background-color` set afterwards (theme colors, and the export dialog's
 * white/dark/transparent choice). The reference-grid overlay (`showGrid`)
 * already exists correctly as its own vector line layer, see `layer-grid.ts`
 * — this file only needs to stay a plain color layer.
 */

import type maplibregl from 'maplibre-gl';
import type { ResolvedColors } from '../style-adapter';

/** Returns the minimal MapLibre style containing only the solid background. */
export function createBaseStyle(
  colors: ResolvedColors,
): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: 'glyphs/{fontstack}/{range}.pbf',
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': colors.background },
      },
    ],
  };
}
