import type {
  ExportArea,
  ExportBackground,
  ExportFormat,
  ExportTargetLongEdge,
} from '../ipc-contract';

/**
 * The pending export's composition, as a preview capture must reproduce it.
 *
 * @remarks
 * Deliberately only the two options that change *what is drawn* rather than
 * how the dialog decorates it. Density, filename and presentation toggles
 * never alter the captured image, so asking the renderer to re-render for
 * them would burn a second WebGL surface for an identical result.
 */
export interface ExportPreviewOptions {
  /** Spatial area the preview must frame. */
  readonly area: ExportArea;
  /** Background treatment the preview must actually paint. */
  readonly background: ExportBackground;
}

/** A map annotation projected into preview-relative coordinates. */
export interface ExportPreviewAnnotation {
  /** Stable domain identifier used for rendering keys. */
  id: string;
  /** User-visible district or park-area name. */
  name: string;
  /** Domain collection that owns the annotation. */
  kind: 'district' | 'park';
  /** Horizontal position as a percentage of the captured viewport width. */
  xPercent: number;
  /** Vertical position as a percentage of the captured viewport height. */
  yPercent: number;
}

/** Projection-derived graphic scale rendered over an export preview. */
export interface ExportPreviewScale {
  /** Real-world distance represented by the scale bar, in CS1 metres. */
  distanceMeters: number;
  /** Scale-bar width as a percentage of the captured viewport. */
  widthPercent: number;
}

/** Pixel dimensions of a rendered document. */
export interface ExportPreviewSurface {
  /** Width in logical pixels. */
  width: number;
  /** Height in logical pixels. */
  height: number;
}

/** Immutable snapshot of the current renderer viewport for export configuration. */
export interface ExportPreviewSnapshot {
  /** Captured composition encoded as a PNG data URL. */
  dataUrl: string;
  /** Width of the preview *image*, in logical pixels. */
  width: number;
  /** Height of the preview *image*, in logical pixels. */
  height: number;
  /**
   * Document a `viewport` export of this composition produces at density 1.
   *
   * @remarks
   * Deliberately separate from {@link ExportPreviewSnapshot.width}: the preview
   * image is rendered small on purpose, and the two were the same number only
   * while the preview was a straight read of the live canvas. Conflating them
   * made the dialog announce the preview's own size as the file's — a 1200×800
   * window reported "720 × 480 px" for a file that came out 1200×800.
   *
   * This is the live canvas's CSS size, which is exactly what a viewport export
   * renders at before its density multiplier. A `full-map` document is sized by
   * `targetLongEdge` instead, which the dialog owns and can change without
   * recapturing, so it resolves that one itself.
   */
  viewportSurface: ExportPreviewSurface;
  /**
   * Clockwise bearing of the captured composition, in degrees.
   *
   * @remarks
   * Zero for a `full-map` capture, which is always rendered north-up — this is
   * what the preview's orientation indicator must follow, because it describes
   * the image on screen.
   */
  bearingDegrees: number;
  /**
   * Clockwise bearing of the live interactive camera, in degrees.
   *
   * @remarks
   * What an SVG export is judged against: `createSvgExportSnapshot` captures
   * the live camera verbatim for *both* areas, so a rotated map makes the
   * vector route unavailable even for `full-map`. Reading
   * {@link ExportPreviewSnapshot.bearingDegrees} instead would re-offer SVG the
   * moment the user picked full-map, only for the exporter to reject it.
   */
  liveBearingDegrees: number;
  /** Projection-derived graphic scale at capture time. */
  scale: ExportPreviewScale;
  /** District and park labels projected at capture time. */
  annotations: ExportPreviewAnnotation[];
}

/**
 * Optional cartographic content rendered around an exported map.
 *
 * @remarks
 * This presentation model is intentionally separate from the current IPC
 * payload. Stories 6.2 and 6.3 can serialize it for PNG and SVG together when
 * both the TypeScript and Rust contracts are updated in sync.
 */
export interface ExportPresentationOptions {
  /** Shows the city name in the identity block. */
  showCityName: boolean;
  /** Shows the Vellum brand mark in the identity block. */
  showVellumLogo: boolean;
  /** Shows the source `.cslmap` filename when available. */
  showSourceFile: boolean;
  /** Shows the source generation timestamp when available. */
  showGeneratedAt: boolean;
  /** Shows district-name annotations when districts are available. */
  showDistrictNames: boolean;
  /** Shows park-area-name annotations when park areas are available. */
  showParkNames: boolean;
  /** Shows a legend containing the currently visible map layers. */
  showLayerLegend: boolean;
  /** Shows the road hierarchy legend when road data is available. */
  showRoadLegend: boolean;
  /** Shows transit modes and lines when transit data is available. */
  showTransitLegend: boolean;
  /** Shows an elevation legend when terrain elevation is available. */
  showElevationLegend: boolean;
  /** Shows a projection-derived graphic scale. */
  showScaleBar: boolean;
  /** Shows a north-orientation indicator. */
  showOrientation: boolean;
  /** Shows collection counts derived from the loaded city data. */
  showSummary: boolean;
}

/**
 * Complete UI configuration prepared for the future PNG and SVG exporters.
 *
 * @remarks
 * `presentation` is not part of the Story 6.1 IPC contract. Consumers must not
 * pass this object to `export_png` or `export_svg` until the synchronized
 * TypeScript/Rust contract work in Stories 6.2 and 6.3.
 */
interface ExportDialogOptionsBase {
  /** Output format and raster scale. */
  format: ExportFormat;
  /** Background treatment selected by the user. */
  background: ExportBackground;
  /** Sanitized base filename without an extension. */
  fileName: string;
  /** Shared cartographic presentation configuration. */
  presentation: ExportPresentationOptions;
}

/** Export dialog configuration for the current viewport. */
export interface ViewportExportDialogOptions extends ExportDialogOptionsBase {
  /** Spatial area selected by the user. */
  area: 'viewport';
}

/** Export dialog configuration for the complete city extent. */
export interface FullMapExportDialogOptions extends Omit<
  ExportDialogOptionsBase,
  'format'
> {
  /** Spatial area selected by the user. */
  area: 'full-map';
  /**
   * Full-map raster exports only ever request the base density.
   *
   * @remarks
   * `targetLongEdge` already encodes the exact output resolution, so a `2x`
   * or `4x` density would double-apply it — keeping the literal here makes
   * that combination unrepresentable rather than merely discouraged. `svg` is
   * admitted because a vector document has no density to conflict with;
   * `targetLongEdge` simply sizes its `viewBox`.
   */
  format: 'png-1x' | 'svg';
  /** Long edge of the final raster in logical pixels. */
  targetLongEdge: ExportTargetLongEdge;
}

/** Complete UI configuration prepared for the PNG and SVG exporters. */
export type ExportDialogOptions =
  | ViewportExportDialogOptions
  | FullMapExportDialogOptions;
