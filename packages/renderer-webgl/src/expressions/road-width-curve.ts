/**
 * The `factor(zoom)` road-width curve, as plain TypeScript.
 *
 * @remarks
 * `road-width.ts` bakes this same curve into a MapLibre `interpolate` paint
 * expression, which only a GPU style engine can evaluate. A static exporter
 * has no expression engine, so it must resolve `totalWidth = fixedWidth +
 * scaledWidth × factor(zoom)` itself — at one fixed zoom, once per feature.
 *
 * The stops therefore live *here*, and `road-width.ts` imports them: the curve
 * exists in exactly one place, so the exported document and the interactive
 * map can never drift apart. See `road-width.ts` for why the curve is shaped
 * the way it is (cartographic floor below z14, geographic `2^(z−14)` above).
 */

/** `[zoom, factor]` anchors of the width curve, in ascending zoom order. */
export const ROAD_WIDTH_FACTOR_STOPS: ReadonlyArray<
  readonly [zoom: number, factor: number]
> = Object.freeze([
  [11, 0.55],
  [13, 0.85],
  [14, 1.0],
  [18, 16],
  [22, 256],
] as const);

/** Interpolation base MapLibre is told to use between the stops. */
export const ROAD_WIDTH_INTERPOLATION_BASE = 2;

/**
 * Evaluates `factor(zoom)` exactly as MapLibre's
 * `['interpolate', ['exponential', 2], ['zoom'], ...]` would.
 *
 * @remarks
 * MapLibre interpolates the stop *outputs*, not the factor. That is
 * equivalent here: every output is `fixed + scaled × factor`, which is affine
 * in `factor`, so interpolating the factor and then applying the width model
 * yields the identical number. `expressions/road-width.test.ts` pins that
 * equivalence numerically.
 *
 * Zooms outside the stop range clamp to the nearest anchor, matching
 * MapLibre's own behaviour rather than extrapolating off the curve.
 *
 * @param zoom - Zoom level to evaluate the curve at.
 * @returns The multiplier applied to a tier's `scaledWidth`.
 */
export function roadWidthFactorAtZoom(zoom: number): number {
  const stops = ROAD_WIDTH_FACTOR_STOPS;
  const first = stops[0];
  const last = stops[stops.length - 1];
  // Defensive only: the frozen table above always has entries. Without this
  // the non-null assertions below would be the thing standing between a
  // future empty table and a silent NaN width on every road.
  if (!first || !last) return 1;
  if (!Number.isFinite(zoom) || zoom <= first[0]) return first[1];
  if (zoom >= last[0]) return last[1];

  for (let i = 1; i < stops.length; i += 1) {
    const [lowZoom, lowFactor] = stops[i - 1]!;
    const [highZoom, highFactor] = stops[i]!;
    if (zoom > highZoom) continue;
    const t = exponentialProgress(zoom, lowZoom, highZoom);
    return lowFactor + t * (highFactor - lowFactor);
  }
  return last[1];
}

/**
 * Resolves one tier's stroke width in pixels at a given curve factor.
 *
 * @remarks
 * The `fixed` and `scaled` components stay separate right up to this call —
 * nothing upstream is allowed to collapse them into a single pre-multiplied
 * number, which is what keeps the tier hierarchy intact across scales.
 *
 * @param fixed - Tier's zoom-independent width component.
 * @param scaled - Tier's zoom-scaled width component.
 * @param factor - Curve multiplier, from {@link roadWidthFactorAtZoom} or an
 *   exporter's own cartographic policy.
 * @returns Total stroke width in pixels.
 */
export function resolveRoadWidthPx(
  fixed: number,
  scaled: number,
  factor: number,
): number {
  return fixed + scaled * factor;
}

/**
 * Normalized position of `value` between two stops under an exponential base.
 *
 * @remarks
 * `(b^(v−lo) − 1) / (b^(hi−lo) − 1)` — the Mapbox/MapLibre style-spec formula
 * for `['exponential', b]`.
 */
function exponentialProgress(value: number, low: number, high: number): number {
  if (high === low) return 0;
  const base = ROAD_WIDTH_INTERPOLATION_BASE;
  const span = Math.pow(base, high - low) - 1;
  if (span === 0) return (value - low) / (high - low);
  return (Math.pow(base, value - low) - 1) / span;
}
