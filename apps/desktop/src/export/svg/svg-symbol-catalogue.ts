/**
 * The document's reusable symbol catalogue.
 *
 * @remarks
 * Every entry is plain geometry in a 24×24 box, emitted once inside `<defs>`
 * as a `<symbol>` and instantiated with `<use href="#…">`. No sprite sheet, no
 * raster, no external reference — a `<use>` pointing outside the document
 * would break the offline guarantee and is subject to origin restrictions
 * anyway.
 *
 * Shapes are intentionally schematic rather than pictorial: at the 11px a
 * transit marker occupies, a detailed icon is mud, and a distinguishable
 * silhouette is the whole job.
 */

import type { SceneSymbolId } from '@vellum/core';

/** Side of every symbol's own coordinate box. */
export const SYMBOL_VIEWBOX = 24;

/**
 * Symbol geometry, keyed by catalogue id.
 *
 * @remarks
 * `currentColor` lets one definition serve every transit line: an instance
 * sets `color` on its own group and the shared shape inherits it, so the
 * catalogue stays a single definition without freezing a palette into it.
 */
const SYMBOL_BODY: Readonly<Record<SceneSymbolId, string>> = Object.freeze({
  // Rounded box — the generic road-vehicle silhouette.
  'transit-bus':
    '<rect x="5" y="4" width="14" height="16" rx="3" fill="currentColor"/>' +
    '<rect x="7" y="7" width="10" height="6" rx="1" fill="#ffffff"/>',
  // Boxed body on a rail line.
  'transit-tram':
    '<rect x="6" y="3" width="12" height="15" rx="2" fill="currentColor"/>' +
    '<rect x="4" y="20" width="16" height="2" fill="currentColor"/>',
  // Locomotive block with a wide base.
  'transit-train':
    '<rect x="5" y="3" width="14" height="13" rx="2" fill="currentColor"/>' +
    '<rect x="3" y="18" width="18" height="3" rx="1" fill="currentColor"/>',
  // Circle-in-circle, the near-universal metro mark.
  'transit-metro':
    '<circle cx="12" cy="12" r="9" fill="currentColor"/>' +
    '<circle cx="12" cy="12" r="4" fill="#ffffff"/>',
  // Cabin hanging from a cable.
  'transit-cablecar':
    '<path d="M2 5 L22 9" stroke="currentColor" stroke-width="2" fill="none"/>' +
    '<rect x="8" y="10" width="9" height="9" rx="2" fill="currentColor"/>',
  // Straddling car over a single beam.
  'transit-monorail':
    '<rect x="6" y="3" width="12" height="11" rx="4" fill="currentColor"/>' +
    '<rect x="10" y="15" width="4" height="7" fill="currentColor"/>',
  // Hull with a wave beneath it.
  'transit-ferry':
    '<path d="M4 12 L20 12 L17 18 L7 18 Z" fill="currentColor"/>' +
    '<path d="M3 21 Q7 19 12 21 Q17 23 21 21" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  // Envelope with a gondola.
  'transit-blimp':
    '<ellipse cx="12" cy="10" rx="9" ry="6" fill="currentColor"/>' +
    '<rect x="10" y="16" width="4" height="4" rx="1" fill="currentColor"/>',
  // Bus body with trolley poles.
  'transit-trolleybus':
    '<rect x="5" y="8" width="14" height="12" rx="3" fill="currentColor"/>' +
    '<path d="M9 8 L4 2 M15 8 L20 2" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  // Neutral marker for a mode the catalogue does not cover.
  'transit-unknown':
    '<circle cx="12" cy="12" r="8" fill="currentColor"/>' +
    '<rect x="11" y="7" width="2" height="7" fill="#ffffff"/>' +
    '<rect x="11" y="15" width="2" height="2" fill="#ffffff"/>',
});

/** Every catalogue id, in a stable order. */
export const SYMBOL_IDS: readonly SceneSymbolId[] = Object.freeze(
  Object.keys(SYMBOL_BODY) as SceneSymbolId[],
);

/**
 * Returns the inner geometry for one catalogue entry.
 *
 * @param id - Catalogue entry to look up.
 * @returns The symbol's inner markup, without its `<symbol>` wrapper.
 */
export function symbolBody(id: SceneSymbolId): string {
  return SYMBOL_BODY[id] ?? SYMBOL_BODY['transit-unknown'];
}
