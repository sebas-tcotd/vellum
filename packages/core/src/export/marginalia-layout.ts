/**
 * Pure layout of the cartographic marginalia drawn inside an export.
 *
 * @remarks
 * One geometry for every destination. {@link buildMarginaliaContent} decides
 * *what* the panel says from the snapshot's own data, theme and layers;
 * {@link layoutMarginalia} decides *where* each mark goes, in output pixels of
 * the final surface. The dialog preview, both PNG routes and the SVG writer
 * paint the same {@link MarginaliaLayout} — the preview merely scales it down.
 *
 * Every length derives from a fixed unit `u = (20 / 1.4) × density`, so the
 * body text is always 20 logical px (1.25rem) and a 12000 px document keeps the
 * letter size of a 6000 px one while having room for more content; only the
 * 34 % / 60 % caps grow with the surface.
 * Text is measured with DM Mono's fixed 0.6 em advance rather than with a
 * font engine, which keeps the layout deterministic and DOM-free.
 */

import {
  classifyRoadCategory,
  classifyRoadTier,
  ROAD_WIDTH_STYLES,
  type RoadTier,
} from '../road-classification';
import type { CityData, TransitMode } from '../types/city-data';
import type { ColorToken } from '../types/color-tokens';
import type { ExportSnapshotBase } from '../types/export-pipeline';
import { exportScaleForFormat } from '../types/export-pipeline';
import type {
  ExportPresentationOptions,
  MarginaliaCorner,
  MarginaliaCountTemplate,
  MarginaliaLabels,
} from '../types/export-presentation';
import { MARGINALIA_AUTHOR_MAX_LENGTH } from '../types/export-presentation';
import type { ExportArea, ExportFormat } from '../ipc-contract';
import type { LayerOptions, LayerVisibility } from '../types/layer';
import { TRANSIT_MODES } from '../types/layer';
import type { RenderStyleParams } from '../types/theme';
import { mapFrameMarginPixels } from './map-frame-metrics';
import {
  ELEVATION_UNITS_PER_METER,
  reliefDomain,
} from './terrain-relief-domain';
import {
  niceScaleDistance,
  worldUnitsPerPixelForZoom,
  zoomForWorldUnitsPerPixel,
} from './output-density';

// ─── Visual specification (Design Notes, story 3.5) ──────────────────────────
// Every value below is in `u` unless its name says otherwise.

/** Font stack of every marginalia text: the map's own label face. */
export const MARGINALIA_FONT_FAMILY = "'DM Mono', ui-monospace, monospace";
/** DM Mono's fixed advance width, as a fraction of the font size. */
export const MARGINALIA_GLYPH_ADVANCE_EM = 0.6;
/** Line box height, as a fraction of the font size. */
const LINE_HEIGHT_EM = 1.25;
/** Baseline offset from the top of a line box, as a fraction of the font size. */
const BASELINE_EM = 0.95;
/** Total width of the text halo stroke, as a fraction of the font size. */
const HALO_EM = 0.2;
/** Share of the surface width the panel may take. */
const PANEL_MAX_WIDTH_RATIO = 0.34;
/** Share of the surface height the panel may take. */
const PANEL_MAX_HEIGHT_RATIO = 0.6;
/** Opacity of the panel's background fill. */
const PANEL_FILL_OPACITY = 0.9;
const SAFE_INSET_U = 2;
const PANEL_PADDING_U = 2;
const PANEL_FRAME_U = 0.15;
const BLOCK_GAP_U = 1.5;
const DIVIDER_U = 0.08;
const TITLE_U = 3;
const TITLE_TRACKING_EM = 0.08;
const AUTHOR_U = 1.6;
const HEADER_U = 1.3;
const BODY_U = 1.4;
const NOTE_U = 1.1;
const SWATCH_WIDTH_U = 2.4;
const SWATCH_HEIGHT_U = 1.2;
const SWATCH_GAP_U = 1;
const ROW_GAP_U = 0.5;
const STACK_GAP_U = 0.5;
const TRANSIT_SWATCH_U = 0.5;
const RAMP_WIDTH_U = 16;
const SCALE_MAX_WIDTH_U = 20;
const SCALE_STROKE_U = 0.15;
const SCALE_TICK_U = 0.8;
const SCALE_HALF_TICK_U = 0.5;
const SCALE_LABEL_GAP_U = 0.3;
const NORTH_ARROW_U = 3;
const NORTH_BOX_U = 6.4;
const AIDS_GAP_U = 2;
/** Logical px of the body text (1.25rem); the unit is derived from it. */
const BODY_LOGICAL_PX = 20;
/** Tolerance, in degrees, for treating the camera as untilted. */
const PITCH_EPSILON_DEG = 1e-6;

// ─── Content ─────────────────────────────────────────────────────────────────

/** Blocks the panel can hold, in hierarchy order. */
export type MarginaliaBlockId =
  | 'identity'
  | 'road-legend'
  | 'transit-legend'
  | 'elevation-legend'
  | 'aids'
  | 'summary'
  | 'source-note';

/** Hierarchy order: the first block is the last to be omitted. */
export const MARGINALIA_BLOCK_ORDER: readonly MarginaliaBlockId[] =
  Object.freeze([
    'identity',
    'road-legend',
    'transit-legend',
    'elevation-legend',
    'aids',
    'summary',
    'source-note',
  ]);

/** Theme colours the panel paints with, all taken from `RenderStyleParams`. */
export interface MarginaliaTheme {
  /** Panel fill and text halo: the theme's map background. */
  readonly background: ColorToken;
  /** Panel frame and dividers: the theme's map frame colour. */
  readonly frame: ColorToken;
  /** Text and marks: the theme's district label colour. */
  readonly text: ColorToken;
}

/** Identity block: city name and author credit. */
export interface MarginaliaIdentityContent {
  readonly id: 'identity';
  /** Upper-cased city name, or `null` when not shown. */
  readonly title: string | null;
  /** Author credit, or `null` when empty. */
  readonly author: string | null;
}

/** One road tier in the legend. */
export interface MarginaliaRoadRow {
  readonly label: string;
  readonly fill: ColorToken;
  readonly casing: ColorToken;
  /** Tier weight relative to the widest tier, in `(0, 1]`. */
  readonly weight: number;
}

/** Road hierarchy legend. */
export interface MarginaliaRoadLegendContent {
  readonly id: 'road-legend';
  readonly title: string;
  readonly rows: readonly MarginaliaRoadRow[];
}

/** One transit line in the legend. */
export interface MarginaliaTransitRow {
  readonly label: string;
  readonly color: string;
}

/**
 * Transit legend: every visible line, in legend order.
 *
 * @remarks
 * How many rows are drawn is a layout decision — as many as the panel's
 * height allows, then a "+N" row built from {@link more}.
 */
export interface MarginaliaTransitLegendContent {
  readonly id: 'transit-legend';
  readonly title: string;
  readonly rows: readonly MarginaliaTransitRow[];
  /** Template of the row announcing the lines left out. */
  readonly more: MarginaliaCountTemplate;
  /** Digit-group separator for the "+N" count. */
  readonly thousandsSeparator: string;
}

/** Hypsometric ramp legend. */
export interface MarginaliaElevationLegendContent {
  readonly id: 'elevation-legend';
  readonly title: string;
  /**
   * `low → mid → high` at the renderer's own anchors (`reliefDomain`), as
   * offsets in `[0, 1]` along the legend.
   */
  readonly stops: readonly MarginaliaRampStop[];
  readonly minLabel: string;
  readonly maxLabel: string;
}

/** One colour stop of a legend ramp. */
export interface MarginaliaRampStop {
  /** Position along the ramp, in `[0, 1]`. */
  readonly offset: number;
  readonly color: string;
}

/** Scale bar and north arrow, drawn on one row. */
export interface MarginaliaAidsContent {
  readonly id: 'aids';
  /** Output density the bar is measured against, or `null` when not drawn. */
  readonly scale: { readonly worldUnitsPerPixel: number } | null;
  /** North arrow, or `null` when not drawn. */
  readonly north: {
    readonly bearingDegrees: number;
    readonly letter: string;
  } | null;
}

/** Collection counts. */
export interface MarginaliaSummaryContent {
  readonly id: 'summary';
  readonly items: readonly string[];
}

/** Source file, date and data-limits statement. */
export interface MarginaliaSourceNoteContent {
  readonly id: 'source-note';
  readonly segments: readonly string[];
}

/** Any block's content. */
export type MarginaliaBlockContent =
  | MarginaliaIdentityContent
  | MarginaliaRoadLegendContent
  | MarginaliaTransitLegendContent
  | MarginaliaElevationLegendContent
  | MarginaliaAidsContent
  | MarginaliaSummaryContent
  | MarginaliaSourceNoteContent;

/** Surface-independent description of the panel. */
export interface MarginaliaContent {
  readonly theme: MarginaliaTheme;
  /** Blocks to lay out, in hierarchy order. */
  readonly blocks: readonly MarginaliaBlockContent[];
}

/** Everything the content builder reads; all of it is in an export snapshot. */
export interface MarginaliaContentInputs {
  readonly presentation: Readonly<ExportPresentationOptions>;
  readonly labels: MarginaliaLabels;
  readonly style: Readonly<RenderStyleParams>;
  readonly cityData: CityData;
  readonly activeLayers: Readonly<LayerVisibility>;
  readonly layerOptions: Readonly<LayerOptions>;
  /** Camera angles of the exported composition, in degrees. */
  readonly camera: { readonly bearing: number; readonly pitch: number };
  /** CS1 world units covered by one output pixel. */
  readonly worldUnitsPerPixel: number;
}

/** Why a marginalia element cannot be drawn for the current map. */
export type MarginaliaUnavailableReason =
  | 'no-data'
  | 'layer-hidden'
  | 'camera-pitch';

/** Per-option availability; `null` means the element can be drawn. */
export interface MarginaliaAvailability {
  readonly showCityName: MarginaliaUnavailableReason | null;
  readonly showRoadLegend: MarginaliaUnavailableReason | null;
  readonly showTransitLegend: MarginaliaUnavailableReason | null;
  readonly showElevationLegend: MarginaliaUnavailableReason | null;
  readonly showScaleBar: MarginaliaUnavailableReason | null;
  readonly showOrientation: MarginaliaUnavailableReason | null;
  readonly showSummary: MarginaliaUnavailableReason | null;
  readonly showSourceNote: MarginaliaUnavailableReason | null;
}

/** Road tiers in legend order, widest first, rail last. */
const ROAD_TIER_ORDER: readonly RoadTier[] = [
  'highway',
  'largeArterial',
  'mediumArterial',
  'local',
  'gravel',
  'pedestrianStreet',
  'pedestrian',
  'pedestrianWay',
  'train',
  'metro',
];

const MAX_SCALED_WIDTH = Math.max(
  ...ROAD_TIER_ORDER.map((tier) => ROAD_WIDTH_STYLES[tier].scaled),
);

interface RoadStatistics {
  /** Tiers the city actually contains. */
  readonly tiers: ReadonlySet<RoadTier>;
  /** Segments the road classification draws with a tier. */
  readonly drawnSegments: number;
}

const roadStatisticsCache = new WeakMap<CityData, RoadStatistics>();

/**
 * Road tiers present and drawn-segment count, memoized per `CityData`.
 *
 * @remarks
 * One pass, one rule for both the legend and the summary count: a segment
 * counts only when the canonical classification draws it as road, runway or
 * railway geometry with a tier — ferry, airship and cable-car paths, power
 * lines and every excluded class are left out of both.
 */
function roadStatistics(cityData: CityData): RoadStatistics {
  const cached = roadStatisticsCache.get(cityData);
  if (cached) return cached;
  const tiers = new Set<RoadTier>();
  let drawnSegments = 0;
  for (const segment of cityData.roadSegments) {
    const category = classifyRoadCategory(segment.itemClass);
    if (category !== 'road' && category !== 'runway' && category !== 'railway')
      continue;
    const tier = classifyRoadTier(
      segment.itemClass,
      segment.wayType,
      segment.width,
    );
    if (!tier) continue;
    tiers.add(tier);
    drawnSegments += 1;
  }
  const statistics = { tiers, drawnSegments };
  roadStatisticsCache.set(cityData, statistics);
  return statistics;
}

/** Transit lines whose mode is visible, in legend order. */
function visibleTransitLines(
  cityData: CityData,
  layerOptions: Readonly<LayerOptions>,
): CityData['transitLines'] {
  const visible = new Set<TransitMode>(layerOptions.transit.visibleModes);
  return cityData.transitLines
    .filter((line) => visible.has(line.mode) || line.mode === 'Unknown')
    .slice()
    .sort((a, b) => {
      const byMode =
        TRANSIT_MODES.indexOf(a.mode) - TRANSIT_MODES.indexOf(b.mode);
      if (byMode !== 0) return byMode;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
}

function hasElevationRange(cityData: CityData): boolean {
  const dem = cityData.terrainDem;
  return (
    dem !== undefined &&
    dem !== null &&
    Number.isFinite(dem.elevMin) &&
    Number.isFinite(dem.elevMax) &&
    dem.elevMax > dem.elevMin
  );
}

/**
 * Decides which marginalia elements the current map can honestly draw.
 *
 * @remarks
 * The dialog disables a control whose element is unavailable and shows why;
 * {@link buildMarginaliaContent} skips the same elements, so a stale `true`
 * never draws something the map cannot back.
 */
export function marginaliaAvailability(
  inputs: Pick<
    MarginaliaContentInputs,
    | 'cityData'
    | 'activeLayers'
    | 'layerOptions'
    | 'camera'
    | 'worldUnitsPerPixel'
  >,
): MarginaliaAvailability {
  const { cityData, activeLayers, layerOptions, camera } = inputs;
  // Getters, so a caller that only asks about one element never pays for (or
  // depends on the data behind) the others — scanning every road segment for
  // its tier is the expensive one.
  return {
    get showCityName() {
      return cityData.cityName.trim() ? null : 'no-data';
    },
    get showRoadLegend() {
      if (roadStatistics(cityData).tiers.size === 0) return 'no-data';
      return activeLayers.roads ? null : 'layer-hidden';
    },
    get showTransitLegend() {
      if (cityData.transitLines.length === 0) return 'no-data';
      return activeLayers.transit &&
        visibleTransitLines(cityData, layerOptions).length > 0
        ? null
        : 'layer-hidden';
    },
    get showElevationLegend() {
      if (!hasElevationRange(cityData)) return 'no-data';
      return activeLayers.terrain && layerOptions.terrain.showColorRelief
        ? null
        : 'layer-hidden';
    },
    get showScaleBar() {
      if (
        !(
          Number.isFinite(camera.pitch) &&
          Math.abs(camera.pitch) < PITCH_EPSILON_DEG
        )
      )
        return 'camera-pitch';
      return Number.isFinite(inputs.worldUnitsPerPixel) &&
        inputs.worldUnitsPerPixel > 0
        ? null
        : 'no-data';
    },
    get showOrientation() {
      return Number.isFinite(camera.bearing) ? null : 'no-data';
    },
    showSummary: null,
    showSourceNote: null,
  };
}

/** Substitutes a count into its singular or plural template. */
export function formatMarginaliaCount(
  template: MarginaliaCountTemplate,
  count: number,
  thousandsSeparator: string,
): string {
  const digits = String(Math.trunc(Math.abs(count))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    thousandsSeparator,
  );
  const phrase = count === 1 ? template.one : template.other;
  return phrase.replaceAll('{count}', `${count < 0 ? '-' : ''}${digits}`);
}

/** Trims an author credit and cuts it to the maximum length. */
export function normalizeMarginaliaAuthor(author: string): string {
  return Array.from(author.trim())
    .slice(0, MARGINALIA_AUTHOR_MAX_LENGTH)
    .join('')
    .trim();
}

function metresLabel(raw: number): string {
  const metres = Math.round(raw / ELEVATION_UNITS_PER_METER);
  // `Math.round(-0.3)` is `-0`, which a template literal prints as "0" but
  // `Object.is` keeps distinct; normalize so no path can ever show "-0 m".
  return `${metres === 0 ? 0 : metres} m`;
}

/**
 * The legend ramp, stop for stop, as the map's `color-relief` layer paints it.
 *
 * @remarks
 * `terrain.base` is deliberately absent: it is the flat land fill under the
 * relief, never a stop of the hypsometric ramp, so showing it would promise a
 * colour no elevation on the map has.
 */
function reliefStops(
  style: Readonly<RenderStyleParams>,
  dem: CityData['terrainDem'],
): MarginaliaRampStop[] {
  const { min, mid, max } = reliefDomain(dem);
  const span = max - min;
  const at = (value: number): number => (span > 0 ? (value - min) / span : 0);
  return [
    { offset: at(min), color: style.terrain.low },
    { offset: at(mid), color: style.terrain.mid },
    { offset: at(max), color: style.terrain.high },
  ];
}

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function roadColors(
  style: Readonly<RenderStyleParams>,
  tier: RoadTier,
): { fill: ColorToken; casing: ColorToken } {
  const { roads } = style;
  switch (tier) {
    case 'highway':
      return roads.highway.generic;
    case 'largeArterial':
      return roads.largeArterial.generic;
    case 'mediumArterial':
      return roads.mediumArterial.generic;
    case 'local':
      return roads.local.generic;
    case 'gravel':
      return roads.local.gravel;
    case 'pedestrian':
      return roads.pedestrian.path;
    case 'pedestrianStreet':
      return roads.pedestrian.street;
    case 'pedestrianWay':
      return roads.pedestrian.way;
    case 'train':
      return roads.rail.train;
    case 'metro':
      return roads.rail.metro;
  }
}

/**
 * Decides what the marginalia panel says.
 *
 * @remarks
 * A block is left out when its option is off, its data does not exist, or its
 * layer is hidden in the snapshot — see {@link marginaliaAvailability}.
 */
export function buildMarginaliaContent(
  inputs: MarginaliaContentInputs,
): MarginaliaContent {
  const { presentation, labels, style, cityData } = inputs;
  const availability = marginaliaAvailability(inputs);
  const blocks: MarginaliaBlockContent[] = [];

  const title =
    presentation.showCityName && availability.showCityName === null
      ? cityData.cityName.trim().toUpperCase()
      : null;
  const author = normalizeMarginaliaAuthor(presentation.author) || null;
  if (title !== null || author !== null) {
    blocks.push({ id: 'identity', title, author });
  }

  if (presentation.showRoadLegend && availability.showRoadLegend === null) {
    const present = roadStatistics(cityData).tiers;
    blocks.push({
      id: 'road-legend',
      title: labels.roadLegendTitle,
      rows: ROAD_TIER_ORDER.filter((tier) => present.has(tier)).map((tier) => ({
        label: labels.roadTiers[tier],
        ...roadColors(style, tier),
        weight: ROAD_WIDTH_STYLES[tier].scaled / MAX_SCALED_WIDTH,
      })),
    });
  }

  if (
    presentation.showTransitLegend &&
    availability.showTransitLegend === null
  ) {
    const lines = visibleTransitLines(cityData, inputs.layerOptions);
    blocks.push({
      id: 'transit-legend',
      title: labels.transitLegendTitle,
      rows: lines.map((line) => ({
        label: line.name.trim() || labels.transitModes[line.mode],
        color: HEX_COLOR.test(line.color) ? line.color : style.districts.label,
      })),
      more: labels.transitMore,
      thousandsSeparator: labels.thousandsSeparator,
    });
  }

  if (
    presentation.showElevationLegend &&
    availability.showElevationLegend === null
  ) {
    blocks.push({
      id: 'elevation-legend',
      title: labels.elevationLegendTitle,
      stops: reliefStops(style, cityData.terrainDem),
      minLabel: metresLabel(reliefDomain(cityData.terrainDem).min),
      maxLabel: metresLabel(reliefDomain(cityData.terrainDem).max),
    });
  }

  const scale =
    presentation.showScaleBar && availability.showScaleBar === null
      ? { worldUnitsPerPixel: inputs.worldUnitsPerPixel }
      : null;
  const north =
    presentation.showOrientation && availability.showOrientation === null
      ? { bearingDegrees: inputs.camera.bearing, letter: labels.north }
      : null;
  if (scale || north) blocks.push({ id: 'aids', scale, north });

  if (presentation.showSummary) {
    const count = (template: MarginaliaCountTemplate, value: number) =>
      formatMarginaliaCount(template, value, labels.thousandsSeparator);
    blocks.push({
      id: 'summary',
      items: [
        count(labels.summary.roads, roadStatistics(cityData).drawnSegments),
        count(labels.summary.buildings, cityData.buildings.length),
        count(labels.summary.districts, cityData.districts.length),
        count(labels.summary.parks, cityData.parkAreas.length),
        count(labels.summary.lines, cityData.transitLines.length),
        count(
          labels.summary.stops,
          cityData.transitLines.reduce(
            (sum, line) => sum + line.stops.length,
            0,
          ),
        ),
      ],
    });
  }

  if (presentation.showSourceNote) {
    const fileName = cityData.fileName.trim();
    const segments = [
      fileName
        ? /\.cslmap$/i.test(fileName)
          ? fileName
          : `${fileName}.cslmap`
        : '',
      labels.sourceDate.trim(),
      labels.sourceStatement.trim(),
    ].filter((segment) => segment.length > 0);
    if (segments.length > 0) blocks.push({ id: 'source-note', segments });
  }

  return {
    theme: {
      background: style.mapBackground,
      frame: style.mapFrame,
      text: style.districts.label,
    },
    blocks,
  };
}

// ─── Primitives ──────────────────────────────────────────────────────────────

/** A filled and/or stroked rectangle. */
export interface MarginaliaRect {
  readonly kind: 'rect';
  readonly block: MarginaliaBlockId | 'panel';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fill?: string;
  readonly fillOpacity?: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
}

/** A straight stroked segment. */
export interface MarginaliaLine {
  readonly kind: 'line';
  readonly block: MarginaliaBlockId | 'panel';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly lineCap: 'butt' | 'round' | 'square';
}

/** A filled polygon. */
export interface MarginaliaPath {
  readonly kind: 'path';
  readonly block: MarginaliaBlockId;
  readonly points: readonly (readonly [number, number])[];
  readonly fill: string;
}

/** A rectangle filled with a left-to-right colour ramp. */
export interface MarginaliaRamp {
  readonly kind: 'ramp';
  readonly block: MarginaliaBlockId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Colour stops, left to right. */
  readonly stops: readonly MarginaliaRampStop[];
}

/** One line of text, positioned on its baseline. */
export interface MarginaliaText {
  readonly kind: 'text';
  readonly block: MarginaliaBlockId;
  readonly x: number;
  /** Alphabetic baseline. */
  readonly y: number;
  readonly text: string;
  readonly fontSize: number;
  /** Extra space after each glyph, in output pixels. */
  readonly letterSpacing: number;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly fill: string;
  readonly halo: { readonly color: string; readonly width: number };
}

/** Any drawable marginalia element. */
export type MarginaliaPrimitive =
  | MarginaliaRect
  | MarginaliaLine
  | MarginaliaPath
  | MarginaliaRamp
  | MarginaliaText;

/** Axis-aligned rectangle in output pixels. */
export interface MarginaliaBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The laid-out panel, in output pixels of the final surface. */
export interface MarginaliaLayout {
  /** Surface the layout was computed for. */
  readonly surface: { readonly width: number; readonly height: number };
  /** Layout unit in output pixels. */
  readonly unit: number;
  /** Primitives in painting order. */
  readonly primitives: readonly MarginaliaPrimitive[];
  /** Everything painted, including the frame stroke; `null` when empty. */
  readonly bounds: MarginaliaBounds | null;
  /** Requested blocks left out because the panel could not hold them. */
  readonly omitted: readonly MarginaliaBlockId[];
}

// ─── Text metrics ────────────────────────────────────────────────────────────

/** Width of a monospaced text run, in output pixels. */
export function measureMarginaliaText(
  text: string,
  fontSize: number,
  letterSpacing = 0,
): number {
  let advances = 0;
  let glyphs = 0;
  for (const glyph of text) {
    const advance = marginaliaGlyphAdvance(glyph);
    if (advance === 0) continue;
    advances += advance;
    glyphs += 1;
  }
  if (glyphs === 0) return 0;
  return (
    advances * fontSize * MARGINALIA_GLYPH_ADVANCE_EM +
    (glyphs - 1) * letterSpacing
  );
}

/** Joiners and combining marks: drawn on top of the previous glyph. */
const ZERO_ADVANCE = /^[\p{M}\u200B-\u200D\u2060\uFEFF]$/u;

/**
 * East Asian wide/fullwidth ranges and pictographic emoji.
 *
 * @remarks
 * DM Mono has none of these glyphs; the fallback face draws them about two
 * monospaced cells wide, so measuring them as one would under-estimate the
 * run and let `fitText` overflow the panel.
 */
const DOUBLE_ADVANCE =
  /^[\p{Extended_Pictographic}\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFD}]$/u;

/**
 * Monospaced cells one code point occupies: 0, 1 or 2.
 *
 * @remarks
 * Shared with the painter, which places tracked text glyph by glyph on the
 * same advances the layout measured.
 */
export function marginaliaGlyphAdvance(glyph: string): 0 | 1 | 2 {
  if (ZERO_ADVANCE.test(glyph)) return 0;
  return DOUBLE_ADVANCE.test(glyph) ? 2 : 1;
}

const ELLIPSIS = '…';

/**
 * Cuts `text` with an ellipsis so it fits `maxWidth`; the cut is visible.
 *
 * @returns The fitted text, or `''` when not even the ellipsis fits.
 */
function fitText(
  text: string,
  fontSize: number,
  letterSpacing: number,
  maxWidth: number,
): string {
  if (measureMarginaliaText(text, fontSize, letterSpacing) <= maxWidth)
    return text;
  const budget =
    maxWidth - measureMarginaliaText(ELLIPSIS, fontSize) - letterSpacing;
  if (budget < 0) return '';
  let kept = '';
  for (const glyph of text) {
    const candidate = kept + glyph;
    if (measureMarginaliaText(candidate, fontSize, letterSpacing) > budget)
      break;
    kept = candidate;
  }
  return `${kept.trimEnd()}${ELLIPSIS}`;
}

/** `true` when a non-empty source text was cut down to nothing. */
function lostText(source: string, fitted: string): boolean {
  return source.trim().length > 0 && fitted.length === 0;
}

/**
 * Greedy word wrap; words longer than a line are cut with an ellipsis.
 *
 * @returns The lines, or `null` when a word could not keep a single glyph.
 */
function wrapText(
  segments: readonly string[],
  separator: string,
  fontSize: number,
  maxWidth: number,
): string[] | null {
  // A segment that fits a line is kept whole ("1,204 buildings" never splits
  // its count from its noun); only a segment longer than a line breaks at
  // its spaces.
  const words: string[] = [];
  segments.forEach((segment, index) => {
    const unit =
      // The separator is glued to the segment it follows with a no-break
      // space, so a wrap can never strand a lone "·" at the start of a line.
      index < segments.length - 1 ? `${segment}\u00a0${separator}` : segment;
    if (measureMarginaliaText(unit, fontSize) <= maxWidth) {
      words.push(unit.replace(/\s+/g, '\u00a0'));
      return;
    }
    words.push(...unit.split(/[ \t\n\r\f\v]+/).filter(Boolean));
  });
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureMarginaliaText(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current.trimEnd());
    current = fitText(word, fontSize, 0, maxWidth);
    // Not even one glyph fits: the block cannot say what it is for.
    if (lostText(word, current)) return null;
  }
  if (current) lines.push(current.trimEnd());
  return lines
    .map((line) => line.replace(/\u00a0/g, ' '))
    .filter((line) => line.length > 0);
}

// ─── Block layout ────────────────────────────────────────────────────────────

interface MeasuredBlock {
  readonly id: MarginaliaBlockId;
  /** Natural width, never above the available inner width. */
  readonly width: number;
  readonly height: number;
  /** Emits the block's primitives with its top-left corner at `(x, y)`. */
  readonly draw: (
    x: number,
    y: number,
    innerWidth: number,
  ) => MarginaliaPrimitive[];
}

interface BlockContext {
  readonly u: number;
  readonly maxWidth: number;
  readonly theme: MarginaliaTheme;
}

function textPrimitive(
  context: BlockContext,
  block: MarginaliaBlockId,
  text: string,
  x: number,
  top: number,
  fontSize: number,
  anchor: MarginaliaText['anchor'] = 'start',
  letterSpacing = 0,
): MarginaliaText {
  return {
    kind: 'text',
    block,
    x,
    y: top + fontSize * BASELINE_EM,
    text,
    fontSize,
    letterSpacing,
    anchor,
    fill: context.theme.text,
    halo: { color: context.theme.background, width: fontSize * HALO_EM },
  };
}

function lineHeight(fontSize: number): number {
  return fontSize * LINE_HEIGHT_EM;
}

function measureIdentity(
  content: MarginaliaIdentityContent,
  context: BlockContext,
): MeasuredBlock | null {
  const { u, maxWidth } = context;
  const titleSize = TITLE_U * u;
  const tracking = titleSize * TITLE_TRACKING_EM;
  const authorSize = AUTHOR_U * u;
  const title =
    content.title === null
      ? ''
      : fitText(content.title, titleSize, tracking, maxWidth);
  const author =
    content.author === null
      ? ''
      : fitText(content.author, authorSize, 0, maxWidth);
  if (
    (content.title !== null && lostText(content.title, title)) ||
    (content.author !== null && lostText(content.author, author))
  ) {
    return null;
  }
  if (!title && !author) return null;
  const width = Math.max(
    measureMarginaliaText(title, titleSize, tracking),
    measureMarginaliaText(author, authorSize),
  );
  const height =
    (title ? lineHeight(titleSize) : 0) +
    (title && author ? STACK_GAP_U * u : 0) +
    (author ? lineHeight(authorSize) : 0);
  return {
    id: 'identity',
    width,
    height,
    draw: (x, y) => {
      const out: MarginaliaPrimitive[] = [];
      let top = y;
      if (title) {
        out.push(
          textPrimitive(
            context,
            'identity',
            title,
            x,
            top,
            titleSize,
            'start',
            tracking,
          ),
        );
        top += lineHeight(titleSize) + (author ? STACK_GAP_U * u : 0);
      }
      if (author) {
        out.push(
          textPrimitive(context, 'identity', author, x, top, authorSize),
        );
      }
      return out;
    },
  };
}

/** Header plus swatch rows: the shape shared by the road and transit legends. */
function measureSwatchLegend(
  id: 'road-legend' | 'transit-legend',
  title: string,
  rows: readonly {
    label: string;
    swatch: ((x: number, cy: number) => MarginaliaPrimitive[]) | null;
  }[],
  context: BlockContext,
): MeasuredBlock | null {
  const { u, maxWidth } = context;
  const headerSize = HEADER_U * u;
  const bodySize = BODY_U * u;
  const labelOffset = (SWATCH_WIDTH_U + SWATCH_GAP_U) * u;
  if (rows.length === 0 || labelOffset >= maxWidth) return null;
  const header = fitText(title.toUpperCase(), headerSize, 0, maxWidth);
  const fitted = rows.map((row) => ({
    ...row,
    label: fitText(row.label, bodySize, 0, maxWidth - labelOffset),
  }));
  // A swatch with no words, or a header cut to nothing, is not a legend: the
  // block goes to `omitted` instead of drawing unlabelled marks.
  if (
    lostText(title, header) ||
    fitted.some((row, index) => lostText(rows[index]!.label, row.label))
  ) {
    return null;
  }
  const rowHeight = Math.max(SWATCH_HEIGHT_U * u, lineHeight(bodySize));
  const width = Math.max(
    measureMarginaliaText(header, headerSize),
    ...fitted.map(
      (row) => labelOffset + measureMarginaliaText(row.label, bodySize),
    ),
  );
  const headerHeight = header ? lineHeight(headerSize) + ROW_GAP_U * u : 0;
  const height =
    headerHeight +
    fitted.length * rowHeight +
    (fitted.length - 1) * ROW_GAP_U * u;
  return {
    id,
    width: Math.min(width, maxWidth),
    height,
    draw: (x, y) => {
      const out: MarginaliaPrimitive[] = [];
      if (header)
        out.push(textPrimitive(context, id, header, x, y, headerSize));
      let top = y + headerHeight;
      for (const row of fitted) {
        const cy = top + rowHeight / 2;
        if (row.swatch) out.push(...row.swatch(x, cy));
        out.push(
          textPrimitive(
            context,
            id,
            row.label,
            x + labelOffset,
            cy - lineHeight(bodySize) / 2,
            bodySize,
          ),
        );
        top += rowHeight + ROW_GAP_U * u;
      }
      return out;
    },
  };
}

function measureRoadLegend(
  content: MarginaliaRoadLegendContent,
  context: BlockContext,
): MeasuredBlock | null {
  const { u } = context;
  const swatchWidth = SWATCH_WIDTH_U * u;
  return measureSwatchLegend(
    'road-legend',
    content.title,
    content.rows.map((row) => ({
      label: row.label,
      swatch: (x: number, cy: number): MarginaliaPrimitive[] => {
        const casing = SWATCH_HEIGHT_U * u * (0.25 + 0.75 * row.weight);
        const fill = Math.max(casing * 0.6, casing - 0.3 * u);
        const line = (stroke: string, width: number): MarginaliaLine => ({
          kind: 'line',
          block: 'road-legend',
          x1: x,
          y1: cy,
          x2: x + swatchWidth,
          y2: cy,
          stroke,
          strokeWidth: width,
          lineCap: 'butt',
        });
        return [line(row.casing, casing), line(row.fill, fill)];
      },
    })),
    context,
  );
}

function measureTransitLegend(
  content: MarginaliaTransitLegendContent,
  context: BlockContext,
  shownRows: number = content.rows.length,
): MeasuredBlock | null {
  const { u } = context;
  const hidden = content.rows.length - shownRows;
  const swatchWidth = SWATCH_WIDTH_U * u;
  const rows: {
    label: string;
    swatch: ((x: number, cy: number) => MarginaliaPrimitive[]) | null;
  }[] = content.rows.slice(0, shownRows).map((row) => ({
    label: row.label,
    swatch: (x: number, cy: number): MarginaliaPrimitive[] => [
      {
        kind: 'line',
        block: 'transit-legend',
        x1: x,
        y1: cy,
        x2: x + swatchWidth,
        y2: cy,
        stroke: row.color,
        strokeWidth: TRANSIT_SWATCH_U * u,
        lineCap: 'round',
      },
    ],
  }));
  if (hidden > 0) {
    rows.push({
      label: formatMarginaliaCount(
        content.more,
        hidden,
        content.thousandsSeparator,
      ),
      swatch: null,
    });
  }
  return measureSwatchLegend('transit-legend', content.title, rows, context);
}

function measureElevationLegend(
  content: MarginaliaElevationLegendContent,
  context: BlockContext,
): MeasuredBlock | null {
  const { u, maxWidth } = context;
  const headerSize = HEADER_U * u;
  const bodySize = BODY_U * u;
  const header = fitText(content.title.toUpperCase(), headerSize, 0, maxWidth);
  const minWidth =
    measureMarginaliaText(content.minLabel, bodySize) +
    measureMarginaliaText(content.maxLabel, bodySize) +
    u;
  const rampWidth = Math.min(maxWidth, Math.max(RAMP_WIDTH_U * u, minWidth));
  if (minWidth > maxWidth || lostText(content.title, header)) return null;
  const headerHeight = header ? lineHeight(headerSize) + ROW_GAP_U * u : 0;
  const rampHeight = SWATCH_HEIGHT_U * u;
  const height =
    headerHeight + rampHeight + STACK_GAP_U * u + lineHeight(bodySize);
  return {
    id: 'elevation-legend',
    width: Math.max(rampWidth, measureMarginaliaText(header, headerSize)),
    height,
    draw: (x, y) => {
      const out: MarginaliaPrimitive[] = [];
      if (header)
        out.push(
          textPrimitive(context, 'elevation-legend', header, x, y, headerSize),
        );
      const rampTop = y + headerHeight;
      out.push({
        kind: 'ramp',
        block: 'elevation-legend',
        x,
        y: rampTop,
        width: rampWidth,
        height: rampHeight,
        stops: content.stops,
      });
      const labelTop = rampTop + rampHeight + STACK_GAP_U * u;
      out.push(
        textPrimitive(
          context,
          'elevation-legend',
          content.minLabel,
          x,
          labelTop,
          bodySize,
        ),
        textPrimitive(
          context,
          'elevation-legend',
          content.maxLabel,
          x + rampWidth,
          labelTop,
          bodySize,
          'end',
        ),
      );
      return out;
    },
  };
}

function scaleLabel(metres: number): string {
  return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
}

function measureAids(
  content: MarginaliaAidsContent,
  context: BlockContext,
): MeasuredBlock | null {
  const { u, maxWidth, theme } = context;
  const bodySize = BODY_U * u;
  const northBox = content.north ? NORTH_BOX_U * u : 0;
  const northReserve = content.north ? northBox + AIDS_GAP_U * u : 0;

  let scale: {
    barWidth: number;
    label: string;
    width: number;
    height: number;
  } | null = null;
  if (content.scale) {
    const available = Math.min(SCALE_MAX_WIDTH_U * u, maxWidth - northReserve);
    const units = content.scale.worldUnitsPerPixel;
    if (available > 0 && Number.isFinite(units) && units > 0) {
      const metres = niceScaleDistance(available * units);
      const barWidth = metres / units;
      const label = scaleLabel(metres);
      const width = Math.max(barWidth, measureMarginaliaText(label, bodySize));
      if (Number.isFinite(barWidth) && barWidth > 0 && width <= available) {
        scale = {
          barWidth,
          label,
          width,
          height:
            lineHeight(bodySize) + SCALE_LABEL_GAP_U * u + SCALE_TICK_U * u,
        };
      }
    }
  }
  const north = content.north && northBox <= maxWidth ? content.north : null;
  if (!scale && !north) return null;

  const width =
    (scale ? scale.width : 0) +
    (scale && north ? AIDS_GAP_U * u : 0) +
    (north ? northBox : 0);
  const height = Math.max(scale ? scale.height : 0, north ? northBox : 0);
  return {
    id: 'aids',
    width,
    height,
    draw: (x, y, innerWidth) => {
      const out: MarginaliaPrimitive[] = [];
      if (scale) {
        const top = y + (height - scale.height);
        out.push(textPrimitive(context, 'aids', scale.label, x, top, bodySize));
        const baseline = top + scale.height;
        const tick = (at: number, length: number): MarginaliaLine => ({
          kind: 'line',
          block: 'aids',
          x1: x + at,
          y1: baseline - length,
          x2: x + at,
          y2: baseline,
          stroke: theme.text,
          strokeWidth: SCALE_STROKE_U * u,
          lineCap: 'square',
        });
        out.push(
          {
            kind: 'line',
            block: 'aids',
            x1: x,
            y1: baseline,
            x2: x + scale.barWidth,
            y2: baseline,
            stroke: theme.text,
            strokeWidth: SCALE_STROKE_U * u,
            lineCap: 'square',
          },
          tick(0, SCALE_TICK_U * u),
          tick(scale.barWidth / 2, SCALE_HALF_TICK_U * u),
          tick(scale.barWidth, SCALE_TICK_U * u),
        );
      }
      if (north) {
        const cx = x + innerWidth - northBox / 2;
        const cy = y + height - northBox / 2;
        const theta = (-north.bearingDegrees * Math.PI) / 180;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const rotate = (px: number, py: number): [number, number] => [
          cx + px * cos - py * sin,
          cy + px * sin + py * cos,
        ];
        // Arrow centred slightly below the box centre so the letter fits above.
        const half = (NORTH_ARROW_U * u) / 2;
        const shift = 0.6 * u;
        out.push({
          kind: 'path',
          block: 'aids',
          points: [
            rotate(0, -half + shift),
            rotate(0.6 * half, half + shift),
            rotate(0, 0.5 * half + shift),
            rotate(-0.6 * half, half + shift),
          ],
          fill: theme.text,
        });
        const [lx, ly] = rotate(0, -half + shift - 1.1 * u);
        out.push(
          textPrimitive(
            context,
            'aids',
            north.letter,
            lx,
            ly - lineHeight(bodySize) / 2,
            bodySize,
            'middle',
          ),
        );
      }
      return out;
    },
  };
}

function measureWrapped(
  id: 'summary' | 'source-note',
  segments: readonly string[],
  fontSize: number,
  context: BlockContext,
): MeasuredBlock | null {
  const lines = wrapText(segments, '·', fontSize, context.maxWidth);
  if (!lines || lines.length === 0) return null;
  const width = Math.max(
    ...lines.map((line) => measureMarginaliaText(line, fontSize)),
  );
  return {
    id,
    width,
    height: lines.length * lineHeight(fontSize),
    draw: (x, y) =>
      lines.map((line, index) =>
        textPrimitive(
          context,
          id,
          line,
          x,
          y + index * lineHeight(fontSize),
          fontSize,
        ),
      ),
  };
}

function measureBlock(
  content: MarginaliaBlockContent,
  context: BlockContext,
): MeasuredBlock | null {
  switch (content.id) {
    case 'identity':
      return measureIdentity(content, context);
    case 'road-legend':
      return measureRoadLegend(content, context);
    case 'transit-legend':
      return measureTransitLegend(content, context);
    case 'elevation-legend':
      return measureElevationLegend(content, context);
    case 'aids':
      return measureAids(content, context);
    case 'summary':
      return measureWrapped(
        'summary',
        content.items,
        BODY_U * context.u,
        context,
      );
    case 'source-note':
      return measureWrapped(
        'source-note',
        content.segments,
        NOTE_U * context.u,
        context,
      );
  }
}

// ─── Panel layout ────────────────────────────────────────────────────────────

const EMPTY_PRIMITIVES: readonly MarginaliaPrimitive[] = Object.freeze([]);

/**
 * Places the marginalia panel on a surface.
 *
 * @param content - What the panel says; see {@link buildMarginaliaContent}.
 * @param surface - Final output surface, in output pixels.
 * @param frameMarginPx - Output pixels the map frame reserves on every side.
 * @param corner - Corner the panel is anchored to.
 * @param density - Output pixels per logical pixel (1 for full-map and SVG,
 * the raster density for a viewport export); sizes the unit `u`.
 * @returns Primitives in output pixels, their bounds, and the blocks that did not fit.
 */
export function layoutMarginalia(
  content: MarginaliaContent,
  surface: { readonly width: number; readonly height: number },
  frameMarginPx: number,
  corner: MarginaliaCorner,
  density = 1,
): MarginaliaLayout {
  // Fixed type size: body text (1.4u) is 20 logical px times the export's
  // density, whatever the surface measures. A larger document keeps the same
  // letters and gains room for more content.
  const u =
    (BODY_LOGICAL_PX / BODY_U) *
    (Number.isFinite(density) && density > 0 ? density : 1);
  const requested = content.blocks.map((block) => block.id);
  const empty = (omitted: readonly MarginaliaBlockId[]): MarginaliaLayout => ({
    surface: { width: surface.width, height: surface.height },
    unit: Number.isFinite(u) && u > 0 ? u : 0,
    primitives: EMPTY_PRIMITIVES,
    bounds: null,
    omitted,
  });
  if (!(Number.isFinite(u) && u > 0) || requested.length === 0)
    return empty([]);

  const inset =
    (Number.isFinite(frameMarginPx) ? Math.max(frameMarginPx, 0) : 0) +
    SAFE_INSET_U * u;
  const padding = PANEL_PADDING_U * u;
  const maxPanelWidth = Math.min(
    surface.width * PANEL_MAX_WIDTH_RATIO,
    surface.width - 2 * inset,
  );
  const maxPanelHeight = Math.min(
    surface.height * PANEL_MAX_HEIGHT_RATIO,
    surface.height - 2 * inset,
  );
  const maxInnerWidth = maxPanelWidth - 2 * padding;
  if (!(maxInnerWidth > 0) || !(maxPanelHeight > 2 * padding)) {
    return empty(requested);
  }

  const context: BlockContext = {
    u,
    maxWidth: maxInnerWidth,
    theme: content.theme,
  };
  const omitted: MarginaliaBlockId[] = [];
  const measured: MeasuredBlock[] = [];
  for (const block of content.blocks) {
    const result = measureBlock(block, context);
    if (result) measured.push(result);
    else omitted.push(block.id);
  }

  const gap = BLOCK_GAP_U * u;
  const panelHeightOf = (blocks: readonly MeasuredBlock[]): number =>
    blocks.reduce((sum, block) => sum + block.height, 0) +
    Math.max(0, blocks.length - 1) * gap +
    2 * padding;
  // The transit legend gives up rows before any block is dropped: it shows as
  // many lines as the remaining height holds, then a "+N lines" row — which
  // is measured too, so the row announcing the cut always fits.
  const transitIndex = measured.findIndex(
    (block) => block.id === 'transit-legend',
  );
  const transitContent = content.blocks.find(
    (block): block is MarginaliaTransitLegendContent =>
      block.id === 'transit-legend',
  );
  if (transitIndex >= 0 && transitContent) {
    for (
      let shown = transitContent.rows.length - 1;
      shown >= 1 && panelHeightOf(measured) > maxPanelHeight;
      shown -= 1
    ) {
      const trimmed = measureTransitLegend(transitContent, context, shown);
      if (!trimmed) break;
      measured[transitIndex] = trimmed;
    }
  }
  // Reverse hierarchy: the last block is the first to go.
  while (measured.length > 0 && panelHeightOf(measured) > maxPanelHeight) {
    omitted.push(measured.pop()!.id);
  }
  const orderedOmitted = MARGINALIA_BLOCK_ORDER.filter((id) =>
    omitted.includes(id),
  );
  if (measured.length === 0) return empty(orderedOmitted);

  const innerWidth = Math.min(
    maxInnerWidth,
    Math.max(...measured.map((block) => block.width)),
  );
  const panelWidth = innerWidth + 2 * padding;
  const panelHeight = panelHeightOf(measured);
  const left = corner.endsWith('left');
  const top = corner.startsWith('top');
  const panelX = left ? inset : surface.width - inset - panelWidth;
  const panelY = top ? inset : surface.height - inset - panelHeight;
  const frameWidth = PANEL_FRAME_U * u;

  const primitives: MarginaliaPrimitive[] = [
    {
      kind: 'rect',
      block: 'panel',
      x: panelX,
      y: panelY,
      width: panelWidth,
      height: panelHeight,
      fill: content.theme.background,
      fillOpacity: PANEL_FILL_OPACITY,
      stroke: content.theme.frame,
      strokeWidth: frameWidth,
    },
  ];
  let cursor = panelY + padding;
  measured.forEach((block, index) => {
    if (index > 0) {
      const dividerY = cursor - gap / 2;
      primitives.push({
        kind: 'line',
        block: 'panel',
        x1: panelX + padding,
        y1: dividerY,
        x2: panelX + panelWidth - padding,
        y2: dividerY,
        stroke: content.theme.frame,
        strokeWidth: DIVIDER_U * u,
        lineCap: 'butt',
      });
    }
    primitives.push(...block.draw(panelX + padding, cursor, innerWidth));
    cursor += block.height + gap;
  });

  return {
    surface: { width: surface.width, height: surface.height },
    unit: u,
    primitives,
    bounds: {
      x: panelX - frameWidth / 2,
      y: panelY - frameWidth / 2,
      width: panelWidth + frameWidth,
      height: panelHeight + frameWidth,
    },
    omitted: orderedOmitted,
  };
}

// ─── Snapshot adapters ───────────────────────────────────────────────────────

/** Geometry of the document the marginalia is drawn into. */
export interface MarginaliaFrame {
  /** Final surface, in output pixels. */
  readonly surface: { readonly width: number; readonly height: number };
  /** CS1 world units per output pixel. */
  readonly worldUnitsPerPixel: number;
  /** Camera angles of the rendered composition, in degrees. */
  readonly camera: { readonly bearing: number; readonly pitch: number };
  /**
   * Whether the document draws the decorative map frame.
   *
   * @remarks
   * Raster documents do, so the panel keeps clear of its stroke and shadow.
   * An SVG document has no frame (`buildSvgExportSnapshot` reserves none), so
   * its safe inset is `2u` alone.
   */
  readonly hasMapFrame: boolean;
  /**
   * Output pixels per logical pixel: 1 for full-map and SVG, 1/2/4 for a
   * viewport raster. Fixes the marginalia's type size.
   */
  readonly density: number;
}

/** What {@link resolveMarginaliaFrame} needs to know about an export. */
export interface MarginaliaFrameInput {
  readonly area: ExportArea;
  readonly format: ExportFormat;
  readonly surface: { readonly width: number; readonly height: number };
  /** World extent the document covers; used for `full-map`. */
  readonly extent: ExportSnapshotBase['extent'];
  /** World units per CSS pixel of the live camera; used for `viewport`. */
  readonly viewportWorldUnitsPerPixel: number;
  readonly camera: { readonly bearing: number; readonly pitch: number };
}

/**
 * Resolves the output density and camera an export is rendered with.
 *
 * @remarks
 * `full-map` maps its extent edge to edge onto the surface after padding the
 * short axis (as `planTiles` does), so the density is the larger per-axis
 * ratio. `viewport` renders the live camera at its raster density, so the
 * live density is divided by it; a vector document has none.
 */
export function resolveMarginaliaFrame(
  input: MarginaliaFrameInput,
): MarginaliaFrame {
  const { surface, extent } = input;
  const worldUnitsPerPixel =
    input.area === 'full-map'
      ? Math.max(
          (extent.maxX - extent.minX) / surface.width,
          (extent.maxZ - extent.minZ) / surface.height,
        )
      : input.viewportWorldUnitsPerPixel /
        (input.format === 'svg' ? 1 : exportScaleForFormat(input.format));
  return {
    surface: { width: surface.width, height: surface.height },
    worldUnitsPerPixel,
    hasMapFrame: input.format !== 'svg',
    density:
      input.area === 'full-map' || input.format === 'svg'
        ? 1
        : exportScaleForFormat(input.format),
    camera:
      input.area === 'full-map'
        ? { bearing: 0, pitch: 0 }
        : { bearing: input.camera.bearing, pitch: input.camera.pitch },
  };
}

/** A captured export of either route, as far as the marginalia is concerned. */
export type MarginaliaSnapshot = ExportSnapshotBase & {
  readonly request: {
    readonly area: ExportArea;
    readonly format: ExportFormat;
    readonly presentation: Readonly<ExportPresentationOptions>;
    readonly labels: MarginaliaLabels;
  };
};

/**
 * Lays out the marginalia for a captured export snapshot.
 *
 * @remarks
 * The single entry point every exporter uses. The dialog preview reaches the
 * same layout through {@link composeMarginalia} with a frame resolved from its
 * own inputs by {@link resolveMarginaliaFrame}.
 */
export function layoutSnapshotMarginalia(
  snapshot: MarginaliaSnapshot,
): MarginaliaLayout {
  const frame = resolveMarginaliaFrame({
    area: snapshot.request.area,
    format: snapshot.request.format,
    surface: snapshot.surface,
    extent: snapshot.extent,
    viewportWorldUnitsPerPixel: worldUnitsPerPixelForZoom(snapshot.camera.zoom),
    camera: snapshot.camera,
  });
  return composeMarginalia(
    {
      presentation: snapshot.request.presentation,
      labels: snapshot.request.labels,
      style: snapshot.style,
      cityData: snapshot.cityData,
      activeLayers: snapshot.activeLayers,
      layerOptions: snapshot.layerOptions,
    },
    frame,
  );
}

/**
 * Builds and lays out the marginalia for a resolved frame.
 *
 * @param inputs - Options, labels and the captured map state.
 * @param frame - Surface, density and camera of the final document.
 */
export function composeMarginalia(
  inputs: Omit<MarginaliaContentInputs, 'camera' | 'worldUnitsPerPixel'>,
  frame: MarginaliaFrame,
): MarginaliaLayout {
  const content = buildMarginaliaContent({
    ...inputs,
    camera: frame.camera,
    worldUnitsPerPixel: frame.worldUnitsPerPixel,
  });
  const valid =
    Number.isFinite(frame.worldUnitsPerPixel) && frame.worldUnitsPerPixel > 0;
  const frameMarginPx =
    valid && frame.hasMapFrame
      ? mapFrameMarginPixels(
          zoomForWorldUnitsPerPixel(frame.worldUnitsPerPixel),
        )
      : 0;
  return layoutMarginalia(
    content,
    frame.surface,
    frameMarginPx,
    inputs.presentation.corner,
    frame.density,
  );
}
