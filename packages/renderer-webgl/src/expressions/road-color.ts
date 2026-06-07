/**
 * Builds MapLibre data-driven color expressions mapping road itemClass → color.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type maplibregl from 'maplibre-gl';
import type { RendererTokens } from '../tokens';

type RoadTier =
  | 'highway'
  | 'railway'
  | 'largeArterial'
  | 'mediumArterial'
  | 'local'
  | 'gravel'
  | 'pedestrian'
  | 'pedestrianWay';

const ITEM_CLASS_TIER: Readonly<Record<string, RoadTier>> = {
  Highway: 'highway',
  'Large Road': 'largeArterial',
  'Medium Road': 'mediumArterial',
  'Small Road': 'local',
  'Gravel Road': 'gravel',
  'Pedestrian Way': 'pedestrianWay',
  'Pedestrian Path': 'pedestrianWay',
  'Train Track': 'railway',
  'Highway Tunnel': 'highway',
  'Large Road Tunnel': 'largeArterial',
  'Medium Road Tunnel': 'mediumArterial',
  'Small Road Tunnel': 'local',
  'Pedestrian Tunnel': 'pedestrianWay',
  'Pedestrian Bridge': 'pedestrian',
};

const TIER_FILL_TOKEN: Record<RoadTier, keyof RendererTokens> = {
  highway: 'roadHighway',
  railway: 'roadRailway',
  largeArterial: 'roadLargeArterial',
  mediumArterial: 'roadMediumArterial',
  local: 'roadLocal',
  gravel: 'roadGravel',
  pedestrian: 'roadPedestrian',
  pedestrianWay: 'roadPedestrianWay',
};

const TIER_CASING_TOKEN: Record<RoadTier, keyof RendererTokens> = {
  highway: 'roadHighwayCasing',
  railway: 'roadRailwayCasing',
  largeArterial: 'roadLargeArterialCasing',
  mediumArterial: 'roadMediumArterialCasing',
  local: 'roadLocalCasing',
  gravel: 'roadGravelCasing',
  pedestrian: 'roadPedestrianCasing',
  pedestrianWay: 'roadPedestrianWay',
};

/** Builds a MapLibre data-driven color expression mapping itemClass → color. */
export function buildRoadColorExpression(
  tokens: RendererTokens,
  type: 'fill' | 'casing',
): maplibregl.ExpressionSpecification {
  const tierMap = type === 'fill' ? TIER_FILL_TOKEN : TIER_CASING_TOKEN;
  const itemClasses = Object.keys(ITEM_CLASS_TIER);

  const matchArgs: (string | maplibregl.ExpressionSpecification)[] = [
    ['get', 'itemClass'] as maplibregl.ExpressionSpecification,
  ];

  for (const cls of itemClasses) {
    const tier = ITEM_CLASS_TIER[cls]!;
    matchArgs.push(cls);
    matchArgs.push(tokens[tierMap[tier]]);
  }

  matchArgs.push(tokens.roadLocal);

  return [
    'match',
    ...matchArgs,
  ] as unknown as maplibregl.ExpressionSpecification;
}
