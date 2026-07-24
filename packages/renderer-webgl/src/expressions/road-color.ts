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

/** Bridge casings are shaded darker than at-grade casings so elevated roads read as raised. */
export const BRIDGE_CASING_DARKEN_PERCENT = 50;

/** Darkens a `#rrggbb` hex color by subtracting `percent`% of 255 from each channel. */
function darkenHex(hex: string, percent: number): string {
  const n = parseInt(hex.slice(1), 16);
  const delta = Math.round((255 * percent) / 100);
  const r = Math.max(0, (n >> 16) - delta);
  const g = Math.max(0, ((n >> 8) & 0xff) - delta);
  const b = Math.max(0, (n & 0xff) - delta);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Builds a MapLibre data-driven color expression mapping tier → color.
 *
 * @param darkenPercent - Optional darkening (0-100) applied to every color in
 * the table, e.g. for bridge casings — CS1 shades elevated-road outlines
 * darker than at-grade ones so they read as raised above the network.
 */
export function buildRoadColorExpression(
  colors: ResolvedColors,
  type: 'fill' | 'casing',
  darkenPercent = 0,
): maplibregl.ExpressionSpecification {
  const table = type === 'fill' ? colors.roadFill : colors.roadCasing;

  const matchArgs: (string | maplibregl.ExpressionSpecification)[] = [
    ['get', 'tier'] as maplibregl.ExpressionSpecification,
  ];

  for (const tier of Object.keys(table) as RoadTier[]) {
    matchArgs.push(tier);
    matchArgs.push(
      darkenPercent > 0 ? darkenHex(table[tier], darkenPercent) : table[tier],
    );
  }

  matchArgs.push(
    darkenPercent > 0 ? darkenHex(table.local, darkenPercent) : table.local,
  );

  return [
    'match',
    ...matchArgs,
  ] as unknown as maplibregl.ExpressionSpecification;
}
