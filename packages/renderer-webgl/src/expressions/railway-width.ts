/**
 * Zoom-interpolated railway width expressions.
 *
 * @remarks
 * Railways use the same `fixed + scaled × factor(zoom)` model as roads but
 * with narrower base widths and a gentler zoom curve — rail gauges are
 * world-locked but thinner than roads, so the cartographic floor is tighter
 * and the geographic growth starts at z15 instead of z14.
 *
 * Internal module — not exported from the package barrel.
 */

import type maplibregl from 'maplibre-gl';

// factor(zoom): cartographic floor below z15, then geographic 2^(z−15) to z22.
const FACTOR_STOPS: ReadonlyArray<readonly [zoom: number, factor: number]> = [
  [11, 0.4],
  [13, 0.7],
  [14, 0.9],
  [15, 1.0],
  [18, 8],
  [22, 128],
];

// Casing border for railways — thinner than roads since rail casing is subtle.
const CASING_ADD_PX: readonly number[] = [0.4, 0.6, 0.8, 1.0, 1.6, 3];

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
    ['exponential', 2],
    ['zoom'],
    ...outputs.flatMap(([zoom, out]) => [zoom, out]),
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** Line width for railway fill: geographic at detail, floored far. */
export const RAILWAY_WIDTH_EXPR: maplibregl.ExpressionSpecification =
  buildWidthExpr(
    FACTOR_STOPS.map(([zoom, factor]) => [zoom, widthOutput(factor)] as const),
  );

/** Casing line width for railways: fill width plus a thin border. */
export const RAILWAY_CASING_WIDTH_EXPR: maplibregl.ExpressionSpecification =
  buildWidthExpr(
    FACTOR_STOPS.map(
      ([zoom, factor], i) =>
        [zoom, widthOutput(factor, CASING_ADD_PX[i])] as const,
    ),
  );
