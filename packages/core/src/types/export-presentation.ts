import type {
  ExportArea,
  ExportBackground,
  ExportFormat,
  ExportTargetLongEdge,
} from '../ipc-contract';
import type { RoadTier } from '../road-classification';
import type { TransitMode } from './city-data';
import type { LayerOptions, LayerVisibility } from './layer';
import type { RenderStyleParams } from './theme';

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
  /**
   * Pitch of the live interactive camera, in degrees.
   *
   * @remarks
   * A `viewport` export renders the live camera verbatim, so a tilted view has
   * no constant ground scale and the marginalia must not offer a scale bar.
   */
  livePitchDegrees: number;
  /**
   * CS1 world units covered by one CSS pixel of the live camera.
   *
   * @remarks
   * What a `viewport` export renders at density 1. The dialog divides it by
   * the chosen density to lay out the marginalia on the final surface, never
   * on the preview image, so the scale bar and the frame inset it derives are
   * the file's own.
   */
  viewportWorldUnitsPerPixel: number;
  /** Theme captured with the preview; the marginalia draws with its colours. */
  style: Readonly<RenderStyleParams>;
  /** Layer visibility captured with the preview. */
  activeLayers: Readonly<LayerVisibility>;
  /** Per-layer options captured with the preview. */
  layerOptions: Readonly<LayerOptions>;
}

/** Corner of the output surface the marginalia panel is anchored to. */
export type MarginaliaCorner =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/** Every corner, in the order the dialog offers them. */
export const MARGINALIA_CORNERS: readonly MarginaliaCorner[] = Object.freeze([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

/** Longest author credit, in characters, after trimming. */
export const MARGINALIA_AUTHOR_MAX_LENGTH = 60;

/**
 * Cartographic marginalia drawn inside an exported map.
 *
 * @remarks
 * The same options drive the dialog preview, both PNG routes and the SVG
 * writer: `layoutMarginalia` turns them into one set of output-pixel
 * primitives that every destination paints. Nothing here is decoration only
 * the dialog shows.
 */
export interface ExportPresentationOptions {
  /** Shows the city name as the panel's title. */
  showCityName: boolean;
  /** Shows the road hierarchy legend for the tiers present in the city. */
  showRoadLegend: boolean;
  /** Shows transit lines with their in-game colours. */
  showTransitLegend: boolean;
  /** Shows the hypsometric ramp with the DEM's elevation range. */
  showElevationLegend: boolean;
  /** Shows a graphic scale; never drawn for a tilted camera. */
  showScaleBar: boolean;
  /** Shows a north arrow following the camera bearing. */
  showOrientation: boolean;
  /** Shows collection counts derived from the loaded city data. */
  showSummary: boolean;
  /** Shows the source file, generation date and data-limits note. */
  showSourceNote: boolean;
  /**
   * Author credit typed by the user.
   *
   * @remarks
   * Trimmed and cut to {@link MARGINALIA_AUTHOR_MAX_LENGTH} characters by the
   * layout; an empty credit draws no line.
   */
  author: string;
  /** Corner the panel is anchored to. */
  corner: MarginaliaCorner;
}

/**
 * A count phrase in its singular and plural form.
 *
 * @remarks
 * Both carry a literal `{count}` placeholder. Localization stays in the UI:
 * core only picks the form and substitutes the number.
 */
export interface MarginaliaCountTemplate {
  /** Phrase used when the count is exactly one. */
  readonly one: string;
  /** Phrase used for every other count. */
  readonly other: string;
}

/**
 * Localized text the marginalia needs, resolved by the UI before export.
 *
 * @remarks
 * Plain data so it survives the snapshot's deep copy and the SVG worker's
 * structured clone. Core never translates; it only lays these strings out.
 */
export interface MarginaliaLabels {
  /** Header of the road legend. */
  readonly roadLegendTitle: string;
  /** Display name per road tier. */
  readonly roadTiers: Readonly<Record<RoadTier, string>>;
  /** Header of the transit legend. */
  readonly transitLegendTitle: string;
  /** Display name per transit mode, used when a line has no name. */
  readonly transitModes: Readonly<Record<TransitMode, string>>;
  /** Row announcing the lines left out of the transit legend. */
  readonly transitMore: MarginaliaCountTemplate;
  /** Header of the elevation legend. */
  readonly elevationLegendTitle: string;
  /** Collection counts shown by the summary block. */
  readonly summary: {
    readonly roads: MarginaliaCountTemplate;
    readonly buildings: MarginaliaCountTemplate;
    readonly districts: MarginaliaCountTemplate;
    readonly parks: MarginaliaCountTemplate;
    readonly lines: MarginaliaCountTemplate;
    readonly stops: MarginaliaCountTemplate;
  };
  /** Localized generation date; empty when the source has none. */
  readonly sourceDate: string;
  /** Fixed sentence stating where the data comes from and its limits. */
  readonly sourceStatement: string;
  /** Letter drawn beside the north arrow. */
  readonly north: string;
  /** Digit-group separator for counts, e.g. `,` or `.`. */
  readonly thousandsSeparator: string;
}

interface ExportDialogOptionsBase {
  /** Output format and raster scale. */
  format: ExportFormat;
  /** Background treatment selected by the user. */
  background: ExportBackground;
  /** Sanitized base filename without an extension. */
  fileName: string;
  /** Shared cartographic presentation configuration. */
  presentation: ExportPresentationOptions;
  /** Localized marginalia text, resolved by the dialog. */
  labels: MarginaliaLabels;
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

const NO_COUNT: MarginaliaCountTemplate = Object.freeze({ one: '', other: '' });

/**
 * Presentation that draws no marginalia at all.
 *
 * @remarks
 * For captures that are not user documents — the dialog's own preview render,
 * which the dialog decorates itself, and the benchmark harness.
 */
export const NEUTRAL_PRESENTATION_OPTIONS: Readonly<ExportPresentationOptions> =
  Object.freeze({
    showCityName: false,
    showRoadLegend: false,
    showTransitLegend: false,
    showElevationLegend: false,
    showScaleBar: false,
    showOrientation: false,
    showSummary: false,
    showSourceNote: false,
    author: '',
    corner: 'bottom-left',
  });

/** Empty labels to pair with {@link NEUTRAL_PRESENTATION_OPTIONS}. */
export const NEUTRAL_MARGINALIA_LABELS: MarginaliaLabels = Object.freeze({
  roadLegendTitle: '',
  roadTiers: Object.freeze({
    highway: '',
    train: '',
    metro: '',
    largeArterial: '',
    mediumArterial: '',
    local: '',
    gravel: '',
    pedestrian: '',
    pedestrianStreet: '',
    pedestrianWay: '',
  }),
  transitLegendTitle: '',
  transitModes: Object.freeze({
    Bus: '',
    Tram: '',
    Train: '',
    Metro: '',
    CableCar: '',
    Monorail: '',
    Ferry: '',
    Blimp: '',
    Trolleybus: '',
    Unknown: '',
  }),
  transitMore: NO_COUNT,
  elevationLegendTitle: '',
  summary: Object.freeze({
    roads: NO_COUNT,
    buildings: NO_COUNT,
    districts: NO_COUNT,
    parks: NO_COUNT,
    lines: NO_COUNT,
    stops: NO_COUNT,
  }),
  sourceDate: '',
  sourceStatement: '',
  north: '',
  thousandsSeparator: '',
});
