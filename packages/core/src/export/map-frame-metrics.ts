/**
 * Numeric contract of the decorative map frame and its drop shadow.
 *
 * @remarks
 * **Single source of truth for the frame's geometry.** These tables are the
 * *only* place the stroke width and shadow blur are written down.
 * `@vellum/renderer-webgl`'s `layers/layer-map-frame.ts` builds its MapLibre
 * `interpolate` paint expressions from them, so the layer still owns *how* the
 * frame is painted while the numbers exist once. It also exports the generated
 * `FRAME_WIDTH_EXPR` / `SHADOW_BLUR_EXPR` / `SHADOW_OFFSET` — previously
 * private to that module — so a test can hold the generated expressions against
 * the literal arrays they replaced.
 *
 * They live in `@vellum/core` rather than in the adapter because two
 * consumers outside the adapter need them and cannot import it (ADR-0001):
 * the full-map framing math in {@link ../export/output-surface}, and the
 * export dialog's textual dimensions readout in `@vellum/ui`. A copy on
 * either side would be exactly the second source of truth this module exists
 * to prevent.
 */

/** One stop of a MapLibre `['interpolate', ['linear'], ['zoom'], …]` ramp. */
export interface ZoomStop {
  /** Zoom level at which {@link ZoomStop.value} applies exactly. */
  readonly zoom: number;
  /** Value in screen pixels at that zoom. */
  readonly value: number;
}

/** Frame stroke width in screen pixels, by zoom. */
export const MAP_FRAME_WIDTH_STOPS: readonly ZoomStop[] = Object.freeze([
  { zoom: 6, value: 6 },
  { zoom: 10, value: 12 },
  { zoom: 12, value: 20 },
  { zoom: 14, value: 38 },
  { zoom: 16, value: 72 },
  { zoom: 18, value: 130 },
]);

/** Frame shadow blur radius in screen pixels, by zoom. */
export const MAP_FRAME_SHADOW_BLUR_STOPS: readonly ZoomStop[] = Object.freeze([
  { zoom: 6, value: 3.6 },
  { zoom: 10, value: 7.2 },
  { zoom: 12, value: 12 },
  { zoom: 14, value: 22.8 },
  { zoom: 16, value: 43.2 },
  { zoom: 18, value: 78 },
]);

/** Viewport-anchored shadow translation `[x, y]` in screen pixels. */
export const MAP_FRAME_SHADOW_OFFSET: readonly [number, number] = Object.freeze(
  [0, 4],
) as readonly [number, number];

/**
 * Evaluates a linear zoom ramp the way MapLibre's `interpolate` does.
 *
 * @remarks
 * Clamped at both ends — MapLibre holds the first and last stop's value
 * outside the declared range, and an export zoom is routinely outside it.
 *
 * @param stops - Ramp stops, ascending by zoom.
 * @param zoom - Zoom level to evaluate at; a non-finite zoom yields the first stop.
 * @returns The interpolated value in screen pixels.
 */
export function interpolateZoomStops(
  stops: readonly ZoomStop[],
  zoom: number,
): number {
  if (stops.length === 0) return 0;
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  if (!Number.isFinite(zoom) || zoom <= first.zoom) return first.value;
  if (zoom >= last.zoom) return last.value;
  for (let index = 1; index < stops.length; index += 1) {
    const upper = stops[index]!;
    if (zoom > upper.zoom) continue;
    const lower = stops[index - 1]!;
    const span = upper.zoom - lower.zoom;
    if (span <= 0) return upper.value;
    const t = (zoom - lower.zoom) / span;
    return lower.value + (upper.value - lower.value) * t;
  }
  return last.value;
}

/**
 * Screen-pixel margin the frame and its shadow occupy outside the world extent.
 *
 * @remarks
 * The frame is a line stroked *on* the extent boundary, so only half its width
 * falls outside it. The shadow is that same stroke — same width — translated
 * and blurred, so it reaches half a width plus the translation plus the blur
 * radius. The shadow therefore always bounds the frame, and its reach is the
 * margin. The translation is taken as the larger absolute component so the
 * single, symmetric margin covers whichever edge the offset pushes towards.
 *
 * @param zoom - MapLibre zoom the export is rendered at.
 * @returns Margin in screen pixels to reserve on every side.
 */
export function mapFrameMarginPixels(zoom: number): number {
  const halfFrame = interpolateZoomStops(MAP_FRAME_WIDTH_STOPS, zoom) / 2;
  const shadowReach =
    Math.max(
      Math.abs(MAP_FRAME_SHADOW_OFFSET[0]),
      Math.abs(MAP_FRAME_SHADOW_OFFSET[1]),
    ) + interpolateZoomStops(MAP_FRAME_SHADOW_BLUR_STOPS, zoom);
  return halfFrame + shadowReach;
}
