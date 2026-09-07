/**
 * Canonical road classification semantics for Vellum.
 *
 * @remarks
 * ADR-0001 D6 designates this module as the single home for the CS1 road
 * taxonomy: the tier vocabulary, the per-tier width model, the `ItemClass`
 * lookup tables and the decision functions that read them. Every consumer —
 * the GeoJSON builder, the MapLibre layers, the SVG export policy and the
 * minimap — derives from here instead of re-listing item classes.
 *
 * Pure data and pure functions: no MapLibre, no React, no Tauri, no
 * `@vellum/*` imports.
 *
 * This layer is *not* the Rust parser's classification. The parser decides
 * which segments reach `CityData` at all; this module decides how the ones
 * that arrive are drawn.
 */

import type { WayType } from './types/city-data';

/** Render tier a road segment is drawn as: drives both colour and width. */
export type RoadTier =
  | 'highway'
  | 'train'
  | 'metro'
  | 'largeArterial'
  | 'mediumArterial'
  | 'local'
  | 'gravel'
  | 'pedestrian'
  | 'pedestrianWay';

/** Width model for a road tier: `totalWidth = fixed + scaled * zoomFactor`. */
export interface RoadWidthStyle {
  /** Fixed component of the line width model. */
  fixed: number;
  /** Scaled component of the line width model. */
  scaled: number;
}

/**
 * Which network a segment belongs to, and therefore which layer draws it.
 *
 * @remarks
 * Orthogonal to {@link RoadTier}: the category decides *where* a segment is
 * drawn, the tier decides *how thick*. Ferry and airship paths keep whatever
 * tier the width heuristic gives them.
 */
export type RoadCategory =
  | 'road'
  | 'railway'
  | 'ferry'
  | 'airship'
  | 'excluded';

/**
 * The per-tier width model, frozen.
 *
 * @remarks
 * Two packages read this table as their single source of truth for road
 * weight. Exported mutable, any consumer could retune every map in the process
 * with one assignment, so it is frozen at the source rather than trusted.
 */
export const ROAD_WIDTH_STYLES: Readonly<Record<RoadTier, RoadWidthStyle>> =
  Object.freeze({
    highway: { fixed: 0.3, scaled: 3.0 },
    train: { fixed: 0.3, scaled: 1.2 },
    metro: { fixed: 0.3, scaled: 1.2 },
    largeArterial: { fixed: 0.3, scaled: 2.0 },
    mediumArterial: { fixed: 0.3, scaled: 1.5 },
    local: { fixed: 0.2, scaled: 0.8 },
    gravel: { fixed: 0.2, scaled: 0.5 },
    pedestrian: { fixed: 0.2, scaled: 0.4 },
    pedestrianWay: { fixed: 0.1, scaled: 0.3 },
  });

/**
 * `ItemClass` → tier lookup.
 *
 * @remarks
 * Read only through {@link tierOf}, never indexed directly: item classes are
 * arbitrary strings from user-supplied `.cslmap` files and modded assets, and
 * a plain index would resolve `"constructor"` or `"toString"` to an inherited
 * `Object.prototype` member.
 */
export const ITEM_CLASS_TIER: Readonly<Record<string, RoadTier>> = {
  Highway: 'highway',
  'Large Road': 'largeArterial',
  'Medium Road': 'mediumArterial',
  'Small Road': 'local',
  'Gravel Road': 'gravel',
  'Pedestrian Way': 'pedestrianWay',
  'Pedestrian Path': 'pedestrianWay',
  'Train Track': 'train',
  'Train Track Tunnel': 'train',
  'Train Track Elevated': 'train',
  'Metro Track': 'metro',
  'Metro Track Tunnel': 'metro',
  'Metro Track Elevated': 'metro',
  'Monorail Track': 'metro',
  'Monorail Track Elevated': 'metro',
  'Highway Tunnel': 'highway',
  'Highway Elevated': 'highway',
  'Large Road Tunnel': 'largeArterial',
  'Large Road Elevated': 'largeArterial',
  'Medium Road Tunnel': 'mediumArterial',
  'Medium Road Elevated': 'mediumArterial',
  'Small Road Tunnel': 'local',
  'Small Road Elevated': 'local',
  'Pedestrian Tunnel': 'pedestrianWay',
  'Pedestrian Bridge': 'pedestrian',
};

/**
 * Item classes that are never drawn as road geometry.
 *
 * @remarks
 * The Rust parser already drops `Bus Line` and the landscaping tools from
 * `road_segments` (see `parser/tests.rs`), so on a normally-parsed city these
 * entries never match. Airship paths are *not* here: they remain in
 * `road_segments` deliberately because transit route reconstruction needs
 * their geometry, and {@link classifyRoadCategory} routes them to the
 * dedicated dashed Dirigible layer instead of an ordinary road rendering.
 * This set is the single filter point for both the interactive map and the
 * SVG export.
 */
export const EXCLUDED_ROAD_CLASSES: ReadonlySet<string> = new Set([
  'Electricity Wire',
  'Airplane Path',
  'Ship Path',
  'Tram Line',
  'Tram Facility',
  // Virtual connectors used only for transit routing — never real geometry.
  'Bus Line',
  // Terrain-shaping landscaping tools, not part of the road network.
  'Landscaping Canal',
  'Landscaping Flood Wall',
]);

/** Item classes drawn as ferry routes rather than as road geometry. */
const FERRY_CLASSES = new Set(['Ferry Path']);

/** Item classes drawn as airship (dirigible) routes. */
const AIRSHIP_CLASSES = new Set(['Blimp Path', 'Blimp Line']);

/**
 * The tier {@link ITEM_CLASS_TIER} assigns to `itemClass`, or `undefined`.
 *
 * @remarks
 * The `Object.hasOwn` guard is the whole point of this function. Item classes
 * come from user-supplied `.cslmap` files and modded assets, so a bare
 * `ITEM_CLASS_TIER[itemClass]` lets `"constructor"`, `"toString"`,
 * `"valueOf"` and `"__proto__"` resolve truthy to an inherited
 * `Object.prototype` member and be returned typed as a `RoadTier`. Downstream
 * `ROAD_WIDTH_STYLES[tier]` is then `undefined` and the roads GeoJSON build
 * throws while destructuring it — one hostile item class aborting the whole
 * map. Own keys only, so those names fall through like any unknown class.
 */
function tierOf(itemClass: string): RoadTier | undefined {
  return Object.hasOwn(ITEM_CLASS_TIER, itemClass)
    ? ITEM_CLASS_TIER[itemClass]
    : undefined;
}

/**
 * Classifies a segment into its render tier, or `null` when it is excluded.
 *
 * @param itemClass - The CS1 `ItemClass` of the segment.
 * @param wayType - The segment's WayType flags, used for modded assets.
 * @param width - The segment's physical width in CS1 world units.
 * @returns The tier to render at, or `null` when nothing should be drawn.
 *
 * @remarks
 * Known item classes win outright. Anything unknown — a modded asset — falls
 * back to its WayType flags and then to a width heuristic, so a DLC or
 * workshop road still lands somewhere sensible instead of disappearing.
 */
export function classifyRoadTier(
  itemClass: string,
  wayType: readonly WayType[],
  width: number,
): RoadTier | null {
  if (EXCLUDED_ROAD_CLASSES.has(itemClass)) return null;

  const known = tierOf(itemClass);
  if (known) return known;

  if (wayType.includes('Highway')) return 'highway';
  if (wayType.includes('Pedestrian')) return 'pedestrianWay';

  if (width >= 28) return 'largeArterial';
  if (width >= 14) return 'local';

  return 'pedestrianWay';
}

/**
 * Classifies a segment into the network it belongs to.
 *
 * @param itemClass - The CS1 `ItemClass` of the segment.
 * @returns Which network layer should draw the segment.
 *
 * @remarks
 * A projection of the same tables {@link classifyRoadTier} reads — never a
 * parallel enumeration. `railway` is exactly `tier ∈ { train, metro }`, which
 * only the item-class table can produce; the modded-asset heuristics never
 * yield a rail tier, so an unknown class is always `road`.
 */
export function classifyRoadCategory(itemClass: string): RoadCategory {
  if (EXCLUDED_ROAD_CLASSES.has(itemClass)) return 'excluded';
  if (FERRY_CLASSES.has(itemClass)) return 'ferry';
  if (AIRSHIP_CLASSES.has(itemClass)) return 'airship';

  const tier = tierOf(itemClass);
  return tier === 'train' || tier === 'metro' ? 'railway' : 'road';
}
