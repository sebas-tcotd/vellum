/**
 * Zoom-interpolated road width expressions.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 *
 * Width model: `width = fixedWidth + scaledWidth × factor(zoom)`, where
 * `fixedWidth`/`scaledWidth` are per-tier weights baked into each feature by
 * `buildRoadsGeoJson` (see `ROAD_WIDTH_STYLES`). This module owns only the
 * `factor(zoom)` curve — the tier hierarchy is untouched.
 *
 * **Why the curve is shaped this way.** Buildings and blocks are world-locked
 * polygons: their on-screen size doubles every zoom level (geographic /
 * exponential-base-2 scaling). A *linear* road factor (the previous curve,
 * 0.1→1.0→3.0 over z8→z14→z18, then clamped) grows far slower than that, so at
 * detail zoom roads fell behind the buildings and the map read as empty. Modern
 * basemaps (Google, Apple, Mapbox) instead let road width approach real-world
 * width at detail zoom, staying proportional to buildings.
 *
 * So the factor is:
 * - **Below z14** — a cartographic floor matched to the previous values, to
 *   preserve the (good) far-zoom hierarchy.
 * - **z14 and above** — `factor = 2^(z − 14)`, i.e. geographic/world-locked
 *   growth (doubling per zoom), extended to z22 so roads keep gaining presence
 *   as the user zooms into a block instead of freezing at z18.
 *
 * `scaledWidth` therefore doubles as each tier's world-width weight; the ratios
 * between tiers (highway 3.0 : arterial 2.0 : local 0.8 …) are unchanged, so the
 * hierarchy reads identically at every zoom — only the overall growth curve
 * changed.
 */

import type maplibregl from 'maplibre-gl';
import {
  ROAD_CASING_ADD_PX,
  ROAD_WIDTH_FACTOR_STOPS,
  ROAD_WIDTH_INTERPOLATION_BASE,
} from './road-width-curve';

// factor(zoom): cartographic floor below z14, then geographic 2^(z−14) to z22.
// The z11/z13/z14 anchors reproduce the previous linear curve's far-zoom values
// (≈0.55 / 0.85 / 1.0); z18 = 2^4 = 16 and z22 = 2^8 = 256 continue the doubling.
//
// The table itself lives in `road-width-curve.ts` so the SVG exporter — which
// has no MapLibre expression engine — evaluates the same curve rather than a
// second copy of these numbers.
const FACTOR_STOPS = ROAD_WIDTH_FACTOR_STOPS;

// Shared with the SVG exporter — see `road-width-curve.ts`.
const CASING_ADD_PX = ROAD_CASING_ADD_PX;

/** `fixedWidth + scaledWidth × factor` (+ optional casing border) for one stop. */
function widthOutput(
  factor: number,
  addPx = 0,
): maplibregl.ExpressionSpecification {
  const base: unknown[] = [
    '+',
    ['get', 'fixedWidth'],
    ['*', ['get', 'scaledWidth'], factor],
  ];
  if (addPx > 0) base.push(addPx);
  return base as unknown as maplibregl.ExpressionSpecification;
}

/** Builds a top-level `interpolate exp2 zoom` width expression from per-stop outputs. */
function buildWidthExpr(
  outputs: ReadonlyArray<readonly [zoom: number, out: unknown]>,
): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['exponential', ROAD_WIDTH_INTERPOLATION_BASE],
    ['zoom'],
    ...outputs.flatMap(([zoom, out]) => [zoom, out]),
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** Line width for road fill: geographic (world-locked) at detail, floored far. */
export const ROAD_WIDTH_EXPR: maplibregl.ExpressionSpecification =
  buildWidthExpr(
    FACTOR_STOPS.map(([zoom, factor]) => [zoom, widthOutput(factor)] as const),
  );

/** Casing line width: fill width plus a thin, zoom-scaled border. */
export const ROAD_CASING_WIDTH_EXPR: maplibregl.ExpressionSpecification =
  buildWidthExpr(
    FACTOR_STOPS.map(
      ([zoom, factor], i) =>
        [zoom, widthOutput(factor, CASING_ADD_PX[i])] as const,
    ),
  );

// Shadow add-px per stop — roughly 3× casing so the shadow is always wider.
const SHADOW_ADD_PX: readonly number[] = [1.5, 2.7, 3.3, 7.2, 12];

/**
 * Shadow line width for bridge/elevated roads: a wider semi-transparent line
 * beneath the casing that creates a visual depth cue so elevated roads read as
 * raised above the surface network.
 */
export const ROAD_SHADOW_WIDTH_EXPR: maplibregl.ExpressionSpecification =
  buildWidthExpr(
    FACTOR_STOPS.map(
      ([zoom, factor], i) =>
        [zoom, widthOutput(factor, SHADOW_ADD_PX[i])] as const,
    ),
  );
