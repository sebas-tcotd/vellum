/**
 * Base background layer: solid color + grid pattern via `background-pattern`.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 *
 * MapLibre supports `background-pattern` on background layers (see
 * https://maplibre.org/maplibre-style-spec/layers/#background-pattern).
 * The approach:
 *   1. `createBaseStyle()` returns the initial style with `background-color`.
 *   2. `addGridPattern()` loads the SVG tile image and applies it as
 *      `background-pattern` on the existing background layer.
 */

import type maplibregl from 'maplibre-gl';
import type { ResolvedColors } from '../style-adapter';

const GRID_IMAGE_ID = 'grid-pattern';

const GRID_SVG = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <path 
    d="M 40 0 L 0 0 0 40" 
    fill="none" 
    stroke="#aaa" 
    stroke-width="1" 
    opacity="0.25"/>
</svg>`;

/**
 * SDF glyph PBFs for the district-name text layer, pre-generated from DM Mono
 * (`apps/desktop/scripts/generate-district-glyphs.sh`) and served as static
 * assets — no external glyph CDN at runtime, matching the offline-first
 * desktop app.
 */
const GLYPHS_URL = 'glyphs/{fontstack}/{range}.pbf';

/** Returns the minimal MapLibre style containing only the solid background. */
export function createBaseStyle(
  colors: ResolvedColors,
): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
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

/**
 * Loads the grid SVG image and applies `background-pattern` to the background layer.
 *
 * @remarks
 * Must be called **after** the map style has loaded. Fails silently if the SVG
 * cannot be loaded (e.g. in test environments).
 */
export async function addGridPattern(map: maplibregl.Map): Promise<void> {
  try {
    await loadGridImage(map);
    map.setPaintProperty('background', 'background-pattern', GRID_IMAGE_ID);
  } catch {
    // Graceful degradation: grid pattern is cosmetic, not critical.
  }
}

async function loadGridImage(map: maplibregl.Map): Promise<void> {
  if (map.hasImage(GRID_IMAGE_ID)) return;

  const encodedSvg = encodeURIComponent(GRID_SVG)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');

  const img = new Image();
  img.src = `data:image/svg+xml,${encodedSvg}`;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Grid image load timeout')),
      2000,
    );
    img.onload = () => {
      clearTimeout(timeout);
      map.addImage(GRID_IMAGE_ID, img, { pixelRatio: 2 });
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load grid pattern SVG'));
    };
  });
}
