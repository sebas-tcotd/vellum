/**
 * Builds MapLibre data-driven color expressions mapping road tier → color.
 *
 * @remarks
 * The tier is computed at GeoJSON build time by `classifyRoadTier` in
 * `geojson-builder.ts`, which includes fallback logic via `wayType` and width
 * heuristics for unknown itemClass values. This module only maps tier values
 * to design tokens — no itemClass knowledge needed.
 *
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

/** Builds a MapLibre data-driven color expression mapping tier → color. */
export function buildRoadColorExpression(
  tokens: RendererTokens,
  type: 'fill' | 'casing',
): maplibregl.ExpressionSpecification {
  const tierMap = type === 'fill' ? TIER_FILL_TOKEN : TIER_CASING_TOKEN;

  const matchArgs: (string | maplibregl.ExpressionSpecification)[] = [
    ['get', 'tier'] as maplibregl.ExpressionSpecification,
  ];

  const tiers = Object.keys(TIER_FILL_TOKEN) as RoadTier[];
  for (const tier of tiers) {
    matchArgs.push(tier);
    matchArgs.push(tokens[tierMap[tier]]);
  }

  matchArgs.push(type === 'fill' ? tokens.roadLocal : tokens.roadLocalCasing);

  return [
    'match',
    ...matchArgs,
  ] as unknown as maplibregl.ExpressionSpecification;
}
