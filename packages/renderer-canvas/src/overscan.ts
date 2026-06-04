/**
 * Factor by which the render buffer exceeds the viewport on each axis.
 *
 * @remarks
 * The worker paints a margin of map content **around** the visible viewport (an
 * "overscan" buffer) so that panning reveals already-painted pixels instantly —
 * no white edges and no wait for a re-render. A re-render only fires when the pan
 * approaches the buffer's edge, or on zoom.
 *
 * Tradeoff: a higher factor pans more smoothly but costs quadratically more canvas
 * memory (`(viewport·factor)² · dpr² · 7 layers`). `1.5` ≈ 25% margin per side
 * (~2.25× the un-buffered area). Tune here.
 */
export const OVERSCAN_FACTOR = 1.5;

/**
 * Physical buffer size and per-side margin derived from a fit dimension.
 */
export interface OverscanLayout {
  /** Physical buffer size in pixels: `round(fit · OVERSCAN_FACTOR)`. */
  buffer: number;
  /**
   * Per-side margin in physical pixels: `(buffer − buffer / OVERSCAN_FACTOR) / 2`.
   * @remarks
   * Derived from `buffer` (not `fit`) so it matches **exactly** what the worker
   * paints — the worker only knows `buffer` (the offscreen size) and recovers the
   * fit as `buffer / OVERSCAN_FACTOR`. Computing the margin the same way on both
   * sides keeps the painted content and the container's `-margin` offset pixel-aligned.
   */
  margin: number;
}

/**
 * Derives the overscan buffer size and per-side margin from a fit (viewport-aligned)
 * dimension.
 *
 * @param fit - The fit size in physical pixels (the viewport size · dpr).
 * @returns The buffer size and per-side margin, both in physical pixels.
 */
export function overscanLayout(fit: number): OverscanLayout {
  const buffer = Math.round(fit * OVERSCAN_FACTOR);
  const margin = (buffer - buffer / OVERSCAN_FACTOR) / 2;
  return { buffer, margin };
}
