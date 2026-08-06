/** Static road tier → width/exclusion lookups used by `roads.builder.ts`. */

import type { RoadTier, RoadWidthStyle } from '../types/roads.types';

export const ROAD_WIDTH_STYLES: Record<RoadTier, RoadWidthStyle> = {
  highway: { fixed: 0.3, scaled: 3.0 },
  train: { fixed: 0.3, scaled: 1.2 },
  metro: { fixed: 0.3, scaled: 1.2 },
  largeArterial: { fixed: 0.3, scaled: 2.0 },
  mediumArterial: { fixed: 0.3, scaled: 1.5 },
  local: { fixed: 0.2, scaled: 0.8 },
  gravel: { fixed: 0.2, scaled: 0.5 },
  pedestrian: { fixed: 0.2, scaled: 0.4 },
  pedestrianWay: { fixed: 0.1, scaled: 0.3 },
};

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
 * entries never match. They are listed anyway because this set is now the
 * single filter point for *both* the interactive map and the SVG export: a
 * partial parse, or a future parser change, must not be able to turn a virtual
 * transit connector or a canal wall into a drawn road on either route.
 */
export const EXCLUDED_ROAD_CLASSES = new Set([
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
