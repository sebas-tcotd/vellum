/**
 * Builds MapLibre data-driven color expressions mapping road tier → color.
 *
 * @remarks
 * The tier is computed at GeoJSON build time by `classifyRoadTier` in
 * `geojson/index.ts`, which includes fallback logic via `wayType` and width
 * heuristics for unknown itemClass values. This module only maps tier values
 * to resolved theme colors — no itemClass knowledge needed.
 *
 * Internal module — not exported from the package barrel.
 */

import type maplibregl from 'maplibre-gl';
import type { RoadTier } from '../geojson';
import type { ResolvedColors } from '../style-adapter';

/** Builds a MapLibre data-driven color expression mapping tier → color. */
export function buildRoadColorExpression(
  colors: ResolvedColors,
  type: 'fill' | 'casing',
): maplibregl.ExpressionSpecification {
  const table = type === 'fill' ? colors.roadFill : colors.roadCasing;

  const matchArgs: (string | maplibregl.ExpressionSpecification)[] = [
    ['get', 'tier'] as maplibregl.ExpressionSpecification,
  ];

  for (const tier of Object.keys(table) as RoadTier[]) {
    matchArgs.push(tier);
    matchArgs.push(table[tier]);
  }

  matchArgs.push(table.local);

  return [
    'match',
    ...matchArgs,
  ] as unknown as maplibregl.ExpressionSpecification;
}
