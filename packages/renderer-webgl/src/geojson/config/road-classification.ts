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
  'Large Road Tunnel': 'largeArterial',
  'Medium Road Tunnel': 'mediumArterial',
  'Small Road Tunnel': 'local',
  'Pedestrian Tunnel': 'pedestrianWay',
  'Pedestrian Bridge': 'pedestrian',
};

export const EXCLUDED_ROAD_CLASSES = new Set([
  'Electricity Wire',
  'Airplane Path',
  'Ship Path',
  'Tram Line',
  'Tram Facility',
]);
