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
 * Main-thread only. It is not on the SVG worker's import graph (worker →
 * `svg-serialization-driver` → `svg-serializer`), which is what lets it reach
 * `renderer-webgl` for the shared scale conversions without violating AD-16.
 */

import {
  roadCasingAddPxAtZoom,
  roadWidthFactorAtZoom,
  zoomForWorldUnitsPerPixel,
} from '@vellum/renderer-webgl';

/**
 * Local-road width, in pixels, used when a caller pins the weight explicitly.
 *
 * @remarks
 * Story 6.3A specified this as *the* MVP calibration. Measured against the
 * real fixtures it turned out to be the wrong model, not the wrong number: a
 * width fixed in output pixels is only correct at one document size. The same
 * city exported to a 1000px viewport and to a 20000px full map got the same
 * 6px roads, which read as motorway-thick on the small one and as hairlines
 * on the large one — while the interactive map, whose weight is what the user
 * is comparing against, scales road width with zoom.
 *
 * So the default is now derived from the document's own density (see
 * {@link resolveSvgExportPolicy}) and this constant survives as the explicit
 * override for a caller that genuinely wants a constant weight.
 */
export const DEFAULT_LOCAL_ROAD_WIDTH_PX = 6;

/** `ROAD_WIDTH_STYLES.local` — the tier a pinned width calibrates against. */
const LOCAL_ROAD_FIXED = 0.2;
const LOCAL_ROAD_SCALED = 0.8;

/** Resolved scales an SVG export applies to one scene. */
export interface SvgExportPolicy {
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
   * Casing border added to every road's fill width, in output pixels.
   *
   * @remarks
   * Read off the same zoom curve MapLibre uses, so the outline keeps the
   * proportion it has on screen instead of being guessed from the fill width.
   */
  readonly roadCasingAddPx: number;
  /**
   * MapLibre zoom this document's density corresponds to.
   *
   * @remarks
   * The bridge between a static document and a zoom-driven style: it is what
   * lets the export ask the interactive width curve "what would you paint at
   * this scale?" instead of inventing an answer.
   */
  readonly equivalentZoom: number;
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
  /** Width a local road resolves to under this policy, in pixels. */
  readonly localRoadWidthPx: number;
}

/** Arguments needed to resolve a policy for one document. */
export interface SvgExportPolicyInput {
  /** Output width in pixels. */
  readonly outputWidth: number;
  /** World units spanned by the output along X. */
  readonly worldSpanX: number;
  /**
   * Pins the local-road width instead of deriving it from the density.
   *
   * @remarks
   * Escape hatch, not the normal path — see
   * {@link DEFAULT_LOCAL_ROAD_WIDTH_PX}.
   */
  readonly localRoadWidthPx?: number;
}

/**
 * Resolves the export policy for one document.
 *
 * @remarks
 * By default the road-width factor comes from the document's own density: the
 * density gives an equivalent MapLibre zoom, and that zoom is fed to the very
 * same `factor(zoom)` curve the GPU evaluates. An exported map therefore
 * carries the road weight the user was already looking at, at whatever scale
 * they asked for — a viewport export of a whole island gets hairlines, a
 * viewport export of three blocks gets full-width streets, exactly as on
 * screen.
 *
 * @param input - Output surface and world span, plus an optional pinned width.
 * @returns The resolved stylistic and geometric scales.
 */
export function resolveSvgExportPolicy(
  input: SvgExportPolicyInput,
): SvgExportPolicy {
  const pixelsPerWorldUnit =
    Number.isFinite(input.outputWidth) &&
    Number.isFinite(input.worldSpanX) &&
    input.worldSpanX > 0 &&
    input.outputWidth > 0
      ? input.outputWidth / input.worldSpanX
      : 0;
  const equivalentZoom =
    pixelsPerWorldUnit > 0
      ? zoomForWorldUnitsPerPixel(1 / pixelsPerWorldUnit)
      : 0;
  const pinned = input.localRoadWidthPx;
  // A pinned width has to be a usable stroke. Left unchecked, a negative or
  // non-finite override propagates into every road's `stroke-width` and Rust
  // publishes a document full of invalid attributes — reject it here, where
  // the caller's mistake is still local.
  if (pinned !== undefined && (!Number.isFinite(pinned) || pinned <= 0)) {
    throw new SvgExportPolicyError(
      `localRoadWidthPx must be a positive finite number, received ${pinned}`,
    );
  }
  const roadWidthFactor =
    pinned !== undefined
      ? (pinned - LOCAL_ROAD_FIXED) / LOCAL_ROAD_SCALED
      : roadWidthFactorAtZoom(equivalentZoom);

  return {
    roadWidthFactor,
    roadCasingAddPx: roadCasingAddPxAtZoom(equivalentZoom),
    equivalentZoom,
    pixelsPerWorldUnit,
    localRoadWidthPx: LOCAL_ROAD_FIXED + LOCAL_ROAD_SCALED * roadWidthFactor,
  };
}

/** Raised when an export policy is asked for something it cannot resolve. */
export class SvgExportPolicyError extends Error {
  /** Creates a typed policy failure. */
  constructor(message: string) {
    super(message);
    this.name = 'SvgExportPolicyError';
  }
}

/**
 * The local tier's `{ fixed, scaled }` pair, for parity assertions.
 *
 * @remarks
 * `svg-export-policy.test.ts` feeds these through `renderer-webgl`'s own
 * `resolveRoadWidthPx` and asserts a pinned 6px request really resolves back
 * to 6px — proving the calibration goes through the shared width model rather
 * than a special case for the tier it was calibrated on.
 */
export const LOCAL_ROAD_WIDTH_STYLE = Object.freeze({
  fixed: LOCAL_ROAD_FIXED,
  scaled: LOCAL_ROAD_SCALED,
});
