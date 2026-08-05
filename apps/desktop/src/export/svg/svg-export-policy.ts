/**
 * The SVG exporter's own cartographic policy.
 *
 * @remarks
 * This is deliberately *not* part of the domain, the theme contract, or the
 * interactive renderer: it is what the SVG route decides a printed map should
 * look like, and nothing outside this route may read it. `CityData`,
 * `RenderStyleParams` and MapLibre are all inputs to it and never learn about
 * it.
 *
 * Imports nothing but types: this module is on the SVG worker's import graph,
 * which must never reach `renderer-webgl`, MapLibre, React, Tauri, or the DOM
 * (ARCHITECTURE-SPINE AD-16, `architecture.md` Gotcha 10).
 */

/**
 * Reference width of a local road in the exported document, in pixels.
 *
 * @remarks
 * The one calibration knob of the MVP. Every other tier is then resolved from
 * its *existing* `fixed`/`scaled` pair against the factor this width implies —
 * never by multiplying the local road's width by a hand-picked ratio, which
 * would silently re-invent the tier hierarchy the theme already defines.
 */
export const DEFAULT_LOCAL_ROAD_WIDTH_PX = 6;

/** `ROAD_WIDTH_STYLES.local` — the tier the policy calibrates against. */
const LOCAL_ROAD_FIXED = 0.2;
const LOCAL_ROAD_SCALED = 0.8;

/** Resolved scales an SVG export applies to one scene. */
export interface SvgExportPolicy {
  /** Reference local-road width this policy was calibrated to, in pixels. */
  readonly localRoadWidthPx: number;
  /**
   * Multiplier applied to every tier's `scaledWidth`.
   *
   * @remarks
   * Stylistic, not geometric. It sizes road strokes only and must never be
   * reused as a unit for buildings, terrain, or water — see
   * {@link SvgExportPolicy.pixelsPerWorldUnit} for the geometric scale.
   */
  readonly roadWidthFactor: number;
  /**
   * Output pixels per CS1 world unit, derived from the document surface.
   *
   * @remarks
   * The document's geometric scale: it is what makes a world-locked feature
   * (a transit corridor, a station spacing) the right size. Kept separate
   * from `roadWidthFactor` on purpose — collapsing the two is how a map ends
   * up with roads that are correct and everything else that is not.
   */
  readonly pixelsPerWorldUnit: number;
}

/** Arguments needed to resolve a policy for one document. */
export interface SvgExportPolicyInput {
  /** Output width in pixels. */
  readonly outputWidth: number;
  /** World units spanned by the output along X. */
  readonly worldSpanX: number;
  /** Optional override of the reference local-road width. */
  readonly localRoadWidthPx?: number;
}

/**
 * Resolves the export policy for one document.
 *
 * @param input - Output surface and world span, plus an optional calibration.
 * @returns The resolved stylistic and geometric scales.
 */
export function resolveSvgExportPolicy(
  input: SvgExportPolicyInput,
): SvgExportPolicy {
  const localRoadWidthPx =
    input.localRoadWidthPx ?? DEFAULT_LOCAL_ROAD_WIDTH_PX;
  return {
    localRoadWidthPx,
    roadWidthFactor: (localRoadWidthPx - LOCAL_ROAD_FIXED) / LOCAL_ROAD_SCALED,
    pixelsPerWorldUnit:
      input.worldSpanX > 0 ? input.outputWidth / input.worldSpanX : 0,
  };
}

/**
 * The local tier's `{ fixed, scaled }` pair, for parity assertions.
 *
 * @remarks
 * `svg-export-policy.test.ts` feeds these through `renderer-webgl`'s own
 * `resolveRoadWidthPx` and asserts a 6px request really resolves back to 6px —
 * proving the calibration goes through the shared width model rather than a
 * special case for the tier it was calibrated on.
 */
export const LOCAL_ROAD_WIDTH_STYLE = Object.freeze({
  fixed: LOCAL_ROAD_FIXED,
  scaled: LOCAL_ROAD_SCALED,
});
