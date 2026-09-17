import type {
  CityData,
  ExportArea,
  ExportBackground,
  ExportDialogOptions,
  ExportFormat,
  ExportPresentationOptions,
  ExportPreviewOptions,
  ExportPreviewSnapshot,
  ExportTargetLongEdge,
  MarginaliaAvailability,
  MarginaliaBlockId,
  MarginaliaCorner,
  MarginaliaFrame,
  MarginaliaLabels,
  MarginaliaLayout,
  MarginaliaUnavailableReason,
} from '@vellum/core';
import {
  composeMarginalia,
  DEFAULT_LAYER_OPTIONS,
  exportScaleForFormat,
  LAYER_NAMES,
  MARGINALIA_AUTHOR_MAX_LENGTH,
  MARGINALIA_CORNERS,
  MARGINALIA_FONT_FAMILY,
  marginaliaAvailability,
  paintMarginalia,
  resolveFullMapFraming,
  resolveFullMapOutputSurface,
  resolveMarginaliaFrame,
} from '@vellum/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../lib/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../lib/dialog';
import { cn } from '../../lib/utils';
import { resolveMarginaliaLabels } from './export-marginalia-labels';

/** Props for the controlled export-configuration dialog. */
export interface ExportDialogProps {
  /** Whether the Radix dialog is open. */
  open: boolean;
  /**
   * Loaded city: name, file, date, bounds and every count the marginalia shows.
   *
   * @remarks
   * The dialog lays the marginalia out from the same data the exporter will
   * read out of the snapshot, so the preview cannot promise content the file
   * lacks.
   */
  cityData: CityData;
  /** Background derived from the current visual theme. */
  defaultBackground: ExportBackground;
  /** Captured MapLibre viewport and its projection-derived metadata. */
  preview: ExportPreviewSnapshot | null;
  /** Prevents submission while a future exporter is active. */
  isExporting?: boolean;
  /**
   * Whether a preview render is in flight.
   *
   * @remarks
   * A preview is a real render on a disposable export surface, so it is not
   * instantaneous. Without this the dialog keeps showing the previous image
   * after the user changes area or background, which reads as "nothing
   * happened" rather than "working on it".
   */
  isPreviewLoading?: boolean;
  /**
   * Asks for a preview of the composition now configured.
   *
   * @remarks
   * Fired once when the dialog opens — with the composition it restores —
   * and afterwards only when the area or the background actually changes.
   * Those are the two choices that alter what is drawn. Optional so a host
   * with no renderer attached still renders a dialog.
   */
  onPreviewOptionsChange?: (options: ExportPreviewOptions) => void;
  /** Receives all controlled-open state changes, including Escape. */
  onOpenChange: (open: boolean) => void;
  /** Receives a sanitized, typed configuration without invoking IPC. */
  onExport: (options: ExportDialogOptions) => Promise<void>;
}

type ExportChoiceKey =
  | 'export.format_png1x'
  | 'export.format_png2x'
  | 'export.format_png4x'
  | 'export.format_png'
  | 'export.format_svg'
  | 'export.quality'
  | 'export.resolution_standard'
  | 'export.resolution_standardDescription'
  | 'export.resolution_high'
  | 'export.resolution_highDescription'
  | 'export.resolution_veryHigh'
  | 'export.resolution_veryHighDescription'
  | 'export.resolution_maximum'
  | 'export.resolution_maximumDescription'
  | 'export.outputDimensions'
  | 'export.area_viewport'
  | 'export.area_fullMap'
  | 'export.background_white'
  | 'export.background_dark'
  | 'export.background_transparent'
  | 'export.corner_topLeft'
  | 'export.corner_topRight'
  | 'export.corner_bottomLeft'
  | 'export.corner_bottomRight';

interface Choice<T extends string> {
  value: T;
  label: ExportChoiceKey;
  /** Renders the choice greyed out and unselectable, with a reason. */
  disabled?: boolean;
  /** Localized explanation shown as the control's title when disabled. */
  disabledReason?: string;
}

interface ChoiceGroupProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  choices: Choice<T>[];
  onChange: (value: T) => void;
}

interface ResolutionChoice {
  value: ExportTargetLongEdge;
  label: ExportChoiceKey;
  description: ExportChoiceKey;
}

interface PresentationToggleProps {
  label: string;
  checked: boolean;
  /** Localized reason the element cannot be drawn; disables the control. */
  unavailableReason?: string | undefined;
  onChange: (checked: boolean) => void;
}

const FORMAT_CHOICES: Choice<ExportFormat>[] = [
  { value: 'png-1x', label: 'export.format_png1x' },
  { value: 'png-2x', label: 'export.format_png2x' },
  { value: 'png-4x', label: 'export.format_png4x' },
  { value: 'svg', label: 'export.format_svg' },
];

/**
 * Tolerance in degrees for treating the captured bearing as north-up.
 *
 * @remarks
 * Mirrors `evaluateSvgCapability`'s own epsilon: MapLibre reports
 * floating-point angles, so an untouched camera can read as `1e-14`.
 */
const BEARING_EPSILON_DEG = 1e-6;

/**
 * Marks SVG unselectable while the camera rules it out.
 *
 * @remarks
 * AC 19: an ineligible route goes back to disabled with an actionable reason,
 * rather than staying selectable and failing only once the user commits. The
 * check mirrors `evaluateSvgCapability`, whose rejection is what the export
 * would otherwise hit.
 */
function withSvgAvailability<T extends string>(
  choices: Choice<T>[],
  rotated: boolean,
  reason: string,
): Choice<T>[] {
  if (!rotated) return choices;
  return choices.map((choice) =>
    choice.value === 'svg'
      ? { ...choice, disabled: true, disabledReason: reason }
      : choice,
  );
}

/**
 * Formats a full-map export may request.
 *
 * @remarks
 * The raster densities are absent because `targetLongEdge` already fixes the
 * output resolution — offering `2x` there would double-apply it. SVG has no
 * density at all, so it is offered unchanged.
 */
const FULL_MAP_FORMAT_CHOICES: Choice<'png-1x' | 'svg'>[] = [
  { value: 'png-1x', label: 'export.format_png' },
  { value: 'svg', label: 'export.format_svg' },
];

const RESOLUTION_CHOICES: ResolutionChoice[] = [
  {
    value: 6000,
    label: 'export.resolution_standard',
    description: 'export.resolution_standardDescription',
  },
  {
    value: 12000,
    label: 'export.resolution_high',
    description: 'export.resolution_highDescription',
  },
  {
    value: 16000,
    label: 'export.resolution_veryHigh',
    description: 'export.resolution_veryHighDescription',
  },
  {
    value: 20000,
    label: 'export.resolution_maximum',
    description: 'export.resolution_maximumDescription',
  },
];

const BLOCK_LABELS = {
  identity: 'export.block_identity',
  'road-legend': 'export.block_roadLegend',
  'transit-legend': 'export.block_transitLegend',
  'elevation-legend': 'export.block_elevationLegend',
  aids: 'export.block_aids',
  summary: 'export.block_summary',
  'source-note': 'export.block_sourceNote',
} as const satisfies Record<MarginaliaBlockId, string>;

const CORNER_LABELS: Record<MarginaliaCorner, ExportChoiceKey> = {
  'top-left': 'export.corner_topLeft',
  'top-right': 'export.corner_topRight',
  'bottom-left': 'export.corner_bottomLeft',
  'bottom-right': 'export.corner_bottomRight',
};

const CORNER_CHOICES: Choice<MarginaliaCorner>[] = MARGINALIA_CORNERS.map(
  (corner) => ({ value: corner, label: CORNER_LABELS[corner] }),
);

const AREA_CHOICES: Choice<ExportArea>[] = [
  { value: 'viewport', label: 'export.area_viewport' },
  { value: 'full-map', label: 'export.area_fullMap' },
];

const BACKGROUND_CHOICES: Choice<ExportBackground>[] = [
  { value: 'white', label: 'export.background_white' },
  { value: 'dark', label: 'export.background_dark' },
  { value: 'transparent', label: 'export.background_transparent' },
];

/** Wraps a bearing into `(-180, 180]` so 360° reads as north-up. */
function normalizeBearing(degrees: number): number {
  if (!Number.isFinite(degrees)) return Number.NaN;
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const ALL_LAYERS_VISIBLE = Object.fromEntries(
  LAYER_NAMES.map((layer) => [layer, true]),
) as ExportPreviewSnapshot['activeLayers'];

/** Removes path characters, reserved punctuation, and known export extensions. */
export function sanitizeExportFileName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/[.\s]+$/g, '')
    .replace(/\.(?:png|svg)$/i, '')
    .replace(/[.\s]+$/g, '');
  return WINDOWS_RESERVED_NAME.test(sanitized) ? `_${sanitized}` : sanitized;
}

function initialPresentation(): ExportPresentationOptions {
  return {
    showCityName: true,
    showRoadLegend: false,
    showTransitLegend: false,
    showElevationLegend: false,
    showScaleBar: false,
    showOrientation: false,
    showSummary: false,
    showSourceNote: false,
    author: '',
    corner: 'bottom-left',
  };
}

function initialFileName(cityName: string): string {
  return sanitizeExportFileName(cityName) || 'Vellum-map';
}

function ChoiceGroup<T extends string>({
  legend,
  name,
  value,
  choices,
  onChange,
}: ChoiceGroupProps<T>) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className="font-ui text-xs font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <label
            key={choice.value}
            title={choice.disabled ? choice.disabledReason : undefined}
            className={
              choice.disabled
                ? 'flex cursor-not-allowed items-center gap-1.5 rounded-md border border-panel-border px-2 py-1 text-xs opacity-50'
                : 'flex cursor-pointer items-center gap-1.5 rounded-md border border-panel-border px-2 py-1 text-xs'
            }
          >
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              disabled={choice.disabled ?? false}
              onChange={() => onChange(choice.value)}
            />
            {t(choice.label)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ResolutionGroup({
  value,
  onChange,
}: {
  value: ExportTargetLongEdge;
  onChange: (value: ExportTargetLongEdge) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <fieldset className="space-y-2" data-testid="export-resolution-options">
      <legend className="font-ui text-xs font-semibold">
        {t('export.quality')}
      </legend>
      <div className="space-y-2">
        {RESOLUTION_CHOICES.map((choice) => (
          <label
            key={choice.value}
            className="flex cursor-pointer items-start gap-2 rounded-md border border-panel-border px-2 py-1.5 text-xs"
          >
            <input
              type="radio"
              name="export-resolution"
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
            />
            <span className="flex flex-col">
              <span className="font-semibold">
                {t(choice.label)} · {formatPixels(choice.value, locale)} px
              </span>
              <span className="opacity-70">{t(choice.description)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function formatPixels(value: number, locale?: string): string {
  return value.toLocaleString(locale);
}

type CityBounds = Pick<CityData['bounds'], 'minX' | 'maxX' | 'minZ' | 'maxZ'>;

function outputDimensions(
  area: ExportArea,
  format: ExportFormat,
  targetLongEdge: ExportTargetLongEdge,
  preview: ExportPreviewSnapshot | null,
  bounds: CityBounds,
): { width: number; height: number } | null {
  if (area === 'viewport') {
    if (!preview || format === 'svg') return null;
    const scale = exportScaleForFormat(format);
    // `viewportSurface`, never the preview image's own `width`/`height`: the
    // preview is rendered small on purpose, so reading its size here announced
    // "720 × 480 px" for a file that came out 1200 × 800.
    return {
      width: preview.viewportSurface.width * scale,
      height: preview.viewportSurface.height * scale,
    };
  }
  const extentWidth = bounds.maxX - bounds.minX;
  const extentHeight = bounds.maxZ - bounds.minZ;
  if (extentWidth <= 0 || extentHeight <= 0) return null;
  // A vector document draws no map frame, so `buildSvgExportSnapshot` sizes it
  // from the bare extent; reserving the frame's margin here would report a
  // taller document than the `.svg` actually declares.
  return format === 'svg'
    ? resolveFullMapOutputSurface(bounds, targetLongEdge)
    : // The raster route does reserve it, and the readout has to agree with the
      // file on the short edge once that margin widens the extent.
      resolveFullMapFraming(bounds, targetLongEdge).surface;
}

/**
 * Resolves the document the export will write, as the marginalia sees it.
 *
 * @remarks
 * Mirrors the snapshot builders exactly — viewport surface times density, the
 * framed full-map raster, the unframed full-map SVG — so the layout painted
 * over the preview is the file's own layout, scaled down, never one computed
 * for the preview image.
 */
function marginaliaFrameFor(
  area: ExportArea,
  format: ExportFormat,
  targetLongEdge: ExportTargetLongEdge,
  preview: ExportPreviewSnapshot | null,
  bounds: CityBounds,
): MarginaliaFrame | null {
  if (!preview) return null;
  if (area === 'viewport') {
    const density = format === 'svg' ? 1 : exportScaleForFormat(format);
    return resolveMarginaliaFrame({
      area,
      format,
      surface: {
        width: preview.viewportSurface.width * density,
        height: preview.viewportSurface.height * density,
      },
      extent: bounds,
      viewportWorldUnitsPerPixel: preview.viewportWorldUnitsPerPixel,
      camera: {
        bearing: preview.liveBearingDegrees,
        pitch: preview.livePitchDegrees,
      },
    });
  }
  if (bounds.maxX <= bounds.minX || bounds.maxZ <= bounds.minZ) return null;
  const framing =
    format === 'svg'
      ? {
          extent: bounds,
          surface: resolveFullMapOutputSurface(bounds, targetLongEdge),
        }
      : resolveFullMapFraming(bounds, targetLongEdge);
  return resolveMarginaliaFrame({
    area,
    format,
    surface: framing.surface,
    extent: framing.extent,
    viewportWorldUnitsPerPixel: 0,
    camera: { bearing: 0, pitch: 0 },
  });
}

function OutputDimensions({
  area,
  format,
  targetLongEdge,
  preview,
  bounds,
}: {
  area: ExportArea;
  format: ExportFormat;
  targetLongEdge: ExportTargetLongEdge;
  preview: ExportPreviewSnapshot | null;
  bounds: CityBounds;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const dimensions = outputDimensions(
    area,
    format,
    targetLongEdge,
    preview,
    bounds,
  );
  if (!dimensions) return null;
  const estimatedMegabytes = Math.max(
    1,
    Math.round((dimensions.width * dimensions.height * 1.1) / 1_000_000),
  );
  return (
    <div
      className="rounded-md border border-panel-border bg-muted/40 px-3 py-2 text-xs"
      data-testid="export-output-dimensions"
    >
      <span className="font-semibold">{t('export.outputDimensions')}: </span>
      {formatPixels(dimensions.width, locale)} ×{' '}
      {formatPixels(dimensions.height, locale)} px · ~{estimatedMegabytes} MB
    </div>
  );
}

function PresentationToggle({
  label,
  checked,
  unavailableReason,
  onChange,
}: PresentationToggleProps) {
  const disabled = unavailableReason !== undefined;
  return (
    <label className="flex items-start gap-2 text-xs" title={unavailableReason}>
      <input
        type="checkbox"
        aria-label={label}
        className="mt-0.5"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="flex flex-col">
        <span className={disabled ? 'opacity-50' : undefined}>{label}</span>
        {disabled && (
          <span className="text-[10px] opacity-60">{unavailableReason}</span>
        )}
      </span>
    </label>
  );
}

/**
 * Paints the final surface's marginalia layout over the preview image.
 *
 * @remarks
 * No HTML overlay and no layout of its own: the canvas receives the layout
 * computed for the file and scales it by `canvas width / surface width`, with
 * the same painter the PNG routes use.
 */
function MarginaliaPreviewCanvas({
  layout,
}: {
  layout: MarginaliaLayout | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const measure = (): void => {
      const rect = canvas.getBoundingClientRect();
      setSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    const paint = (): void => {
      if (cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(0, Math.round(size.width * ratio));
      canvas.height = Math.max(0, Math.round(size.height * ratio));
      if (!layout || canvas.width === 0 || canvas.height === 0) return;
      let ctx: CanvasRenderingContext2D | null = null;
      try {
        ctx = canvas.getContext('2d');
      } catch {
        ctx = null;
      }
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      paintMarginalia(ctx, layout, {
        offsetX: 0,
        offsetY: 0,
        scale: canvas.width / layout.surface.width,
      });
    };
    // A canvas draws with the fallback face while DM Mono is still loading, and
    // would keep that until the next repaint.
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (layout && fonts?.load) {
      fonts.load(`16px ${MARGINALIA_FONT_FAMILY}`).then(paint, paint);
    } else {
      paint();
    }
    return () => {
      cancelled = true;
    };
  }, [layout, size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="export-preview-marginalia"
      data-primitives={layout?.primitives.length ?? 0}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

/**
 * Proportions of the preview frame.
 *
 * @remarks
 * The image is drawn `object-fill`, so the frame must share the image's own
 * proportions or it is stretched. The final document's aspect is used only
 * when it matches the image's within {@link ASPECT_TOLERANCE} — the usual
 * case, since the preview is a scaled render of that document — which lets
 * the marginalia canvas map onto it with one uniform scale. A mismatch (a
 * stale capture while the area changes, or rounding on a tiny preview) falls
 * back to the image rather than distorting it.
 */
function previewAspect(
  preview: ExportPreviewSnapshot | null,
  layout: MarginaliaLayout | null,
): string | undefined {
  if (!preview || preview.width <= 0 || preview.height <= 0) return undefined;
  const image = preview.width / preview.height;
  if (layout && layout.surface.height > 0) {
    const document = layout.surface.width / layout.surface.height;
    if (Math.abs(document - image) <= ASPECT_TOLERANCE) {
      return `${layout.surface.width} / ${layout.surface.height}`;
    }
  }
  return `${preview.width} / ${preview.height}`;
}

/** Largest aspect-ratio difference treated as the same proportions. */
const ASPECT_TOLERANCE = 1e-3;

function ExportPreview({
  format,
  background,
  preview,
  layout,
  isLoading = false,
}: {
  format: ExportFormat;
  background: ExportBackground;
  preview: ExportPreviewSnapshot | null;
  layout: MarginaliaLayout | null;
  isLoading?: boolean;
}) {
  const { t } = useTranslation();
  // The capture itself carries the chosen background now, so this only shows
  // where the capture does not: the checkerboard behind a transparent PNG, and
  // the empty frame before the first preview arrives.
  const backgroundClass =
    background === 'dark'
      ? 'bg-slate-950 text-white'
      : background === 'white'
        ? 'bg-white text-slate-950'
        : 'bg-[repeating-conic-gradient(#d1d5db_0_25%,#fff_0_50%)_0_0/16px_16px] text-slate-950';
  const aspect = previewAspect(preview, layout);
  return (
    <div
      data-testid="export-preview"
      data-format={format}
      data-background={background}
      data-preview-loading={isLoading ? 'true' : undefined}
      aria-busy={isLoading || undefined}
      role="img"
      aria-label={t('export.preview')}
      className={cn(
        'relative overflow-hidden rounded-md border border-panel-border',
        aspect ? undefined : 'aspect-video',
        backgroundClass,
      )}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      {preview ? (
        <img
          src={preview.dataUrl}
          alt=""
          className="h-full w-full object-fill"
          draggable={false}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs opacity-60">
          {t(isLoading ? 'export.previewLoading' : 'export.previewUnavailable')}
        </div>
      )}
      <MarginaliaPreviewCanvas layout={preview ? layout : null} />
      {isLoading && preview && (
        // Over the previous image rather than instead of it: the old
        // composition is still the closest thing to the answer while the new
        // one renders, and replacing it would make the dialog flicker empty on
        // every radio click.
        <div
          data-testid="export-preview-loading"
          className="absolute inset-0 flex items-center justify-center bg-background/60 text-xs font-semibold"
        >
          {t('export.previewLoading')}
        </div>
      )}
      <span className="absolute bottom-1 right-1 text-[8px]">
        {format === 'svg'
          ? t('export.scale_vector')
          : format === 'png-4x'
            ? t('export.scale_4x')
            : format === 'png-2x'
              ? t('export.scale_2x')
              : t('export.scale_1x')}
      </span>
    </div>
  );
}

type PresentationToggleKey = {
  [K in keyof ExportPresentationOptions]: ExportPresentationOptions[K] extends boolean
    ? K
    : never;
}[keyof ExportPresentationOptions];

function PresentationControls({
  presentation,
  availability,
  omitted,
  onToggle,
  onAuthorChange,
  onCornerChange,
}: {
  presentation: ExportPresentationOptions;
  availability: MarginaliaAvailability;
  omitted: readonly MarginaliaBlockId[];
  onToggle: (key: PresentationToggleKey, checked: boolean) => void;
  onAuthorChange: (author: string) => void;
  onCornerChange: (corner: MarginaliaCorner) => void;
}) {
  const { t } = useTranslation();
  const reasonText = (
    reason: MarginaliaUnavailableReason | null,
  ): string | undefined =>
    reason === 'no-data'
      ? t('export.unavailable_noData')
      : reason === 'layer-hidden'
        ? t('export.unavailable_layerHidden')
        : reason === 'camera-pitch'
          ? t('export.unavailable_cameraPitch')
          : undefined;
  const toggle = (key: PresentationToggleKey, label: string) => (
    <PresentationToggle
      key={key}
      label={label}
      checked={presentation[key]}
      unavailableReason={reasonText(availability[key])}
      onChange={(checked) => onToggle(key, checked)}
    />
  );
  const group = (title: string, children: React.ReactNode) => (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase opacity-60">{title}</p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
  return (
    <fieldset className="space-y-3 rounded-md border border-panel-border p-3">
      <legend className="px-1 text-xs font-semibold">
        {t('export.cartographicElements')}
      </legend>
      {group(
        t('export.group_identity'),
        <>
          {toggle('showCityName', t('export.element_cityName'))}
          <label className="flex flex-col gap-1 text-xs">
            <span>{t('export.element_author')}</span>
            <input
              value={presentation.author}
              maxLength={MARGINALIA_AUTHOR_MAX_LENGTH}
              placeholder={t('export.element_authorPlaceholder')}
              onChange={(event) => onAuthorChange(event.currentTarget.value)}
              className="h-7 w-full rounded-md border border-input bg-background px-2"
            />
          </label>
        </>,
      )}
      {group(
        t('export.group_legends'),
        <>
          {toggle('showRoadLegend', t('export.element_roadLegend'))}
          {toggle('showTransitLegend', t('export.element_transitLegend'))}
          {toggle('showElevationLegend', t('export.element_elevationLegend'))}
        </>,
      )}
      {group(
        t('export.group_aids'),
        <>
          {toggle('showScaleBar', t('export.element_scaleBar'))}
          {toggle('showOrientation', t('export.element_orientation'))}
        </>,
      )}
      {group(
        t('export.group_information'),
        <>
          {toggle('showSummary', t('export.element_summary'))}
          {toggle('showSourceNote', t('export.element_sourceNote'))}
        </>,
      )}
      <ChoiceGroup
        legend={t('export.element_corner')}
        name="export-corner"
        value={presentation.corner}
        choices={CORNER_CHOICES}
        onChange={onCornerChange}
      />
      {omitted.length > 0 && (
        <p
          role="status"
          data-testid="export-marginalia-omitted"
          data-omitted={omitted.join(' ')}
          className="text-[10px] opacity-80"
        >
          {t('export.marginaliaOmitted', {
            blocks: omitted.map((id) => t(BLOCK_LABELS[id])).join(', '),
          })}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Controlled export configuration dialog with a non-destructive map preview.
 *
 * @remarks
 * The component never invokes Tauri commands and never mutates renderer,
 * camera, theme, layers, or `CityData`.
 */
export function ExportDialog(props: ExportDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const { cityData } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState(() =>
    initialFileName(cityData.cityName),
  );
  const [format, setFormat] = useState<ExportFormat>('png-1x');
  const viewportFormatRef = useRef<ExportFormat>('png-1x');
  const [area, setArea] = useState<ExportArea>('viewport');
  const [targetLongEdge, setTargetLongEdge] =
    useState<ExportTargetLongEdge>(6000);
  const [background, setBackground] = useState<ExportBackground>(
    props.defaultBackground,
  );
  const [presentation, setPresentationState] = useState(initialPresentation);

  // Held in a ref so the open effect below can call it without listing it as a
  // dependency: a host that rebuilds the callback each render would otherwise
  // re-request a preview on every parent render.
  const onPreviewOptionsChangeRef = useRef(props.onPreviewOptionsChange);
  onPreviewOptionsChangeRef.current = props.onPreviewOptionsChange;

  useEffect(() => {
    if (!props.open) return;
    setFileName(initialFileName(cityData.cityName));
    setFormat('png-1x');
    viewportFormatRef.current = 'png-1x';
    setArea('viewport');
    setTargetLongEdge(6000);
    setBackground(props.defaultBackground);
    setPresentationState(initialPresentation());
    // The composition the dialog opens with is the one it has just restored,
    // so the dialog — not the workflow — is what knows it. Asking for the
    // first preview from here is what keeps it a real `ExportSnapshot` render
    // of these exact options instead of a cheaper read of the live canvas
    // that could already disagree with the file.
    onPreviewOptionsChangeRef.current?.({
      area: 'viewport',
      background: props.defaultBackground,
    });
  }, [cityData.cityName, props.defaultBackground, props.open]);

  const sanitizedFileName = useMemo(
    () => sanitizeExportFileName(fileName),
    [fileName],
  );
  const labels: MarginaliaLabels = useMemo(
    () => resolveMarginaliaLabels(t, locale, cityData),
    [t, locale, cityData],
  );
  const frame = useMemo(
    () =>
      marginaliaFrameFor(
        area,
        format,
        targetLongEdge,
        props.preview,
        cityData.bounds,
      ),
    [area, format, targetLongEdge, props.preview, cityData.bounds],
  );
  const activeLayers = props.preview?.activeLayers ?? ALL_LAYERS_VISIBLE;
  const layerOptions = props.preview?.layerOptions ?? DEFAULT_LAYER_OPTIONS;
  const availability: MarginaliaAvailability = useMemo(() => {
    const computed = marginaliaAvailability({
      cityData,
      activeLayers,
      layerOptions,
      camera: frame?.camera ?? { bearing: 0, pitch: 0 },
      worldUnitsPerPixel: frame?.worldUnitsPerPixel ?? Number.NaN,
    });
    // Density and camera come from the capture: until a preview (and so a
    // frame) exists, neither aid can be judged, so neither is offered.
    if (frame) return computed;
    return {
      showCityName: computed.showCityName,
      showRoadLegend: computed.showRoadLegend,
      showTransitLegend: computed.showTransitLegend,
      showElevationLegend: computed.showElevationLegend,
      showScaleBar: 'no-data',
      showOrientation: 'no-data',
      showSummary: computed.showSummary,
      showSourceNote: computed.showSourceNote,
    };
  }, [cityData, activeLayers, layerOptions, frame]);
  const layout = useMemo(
    () =>
      frame && props.preview
        ? composeMarginalia(
            {
              presentation,
              labels,
              style: props.preview.style,
              cityData,
              activeLayers: props.preview.activeLayers,
              layerOptions: props.preview.layerOptions,
            },
            frame,
          )
        : null,
    [frame, props.preview, presentation, labels, cityData],
  );

  const setPresentation = <K extends keyof ExportPresentationOptions>(
    key: K,
    value: ExportPresentationOptions[K],
  ) => {
    setPresentationState((current) => ({ ...current, [key]: value }));
  };
  // A rotated capture cannot be projected top-down, so the vector route is
  // withdrawn while it lasts instead of failing after the user commits.
  const svgUnavailable =
    props.preview !== null &&
    // The *live* camera, not the captured composition's: a full-map preview is
    // always rendered north-up, so reading its bearing would silently re-offer
    // SVG on a rotated map — and `createSvgExportSnapshot` captures the real
    // rotated camera for full-map too, then rejects it after the user commits.
    Math.abs(normalizeBearing(props.preview.liveBearingDegrees)) >
      BEARING_EPSILON_DEG;
  const svgUnavailableReason = t('errors.SvgExportUnsupportedCamera');
  useEffect(() => {
    if (svgUnavailable && format === 'svg') setFormat('png-1x');
  }, [svgUnavailable, format]);

  /**
   * Asks the host for a preview of a composition the user has just chosen.
   *
   * @remarks
   * Driven from the two `onChange` handlers rather than an effect on `[area,
   * background]`: the open-reset effect below rewrites both, so an effect
   * would also fire for the values the dialog restores on open — a second
   * render of the composition the host has just captured.
   */
  const requestPreview = (
    nextArea: ExportArea,
    nextBackground: ExportBackground,
  ): void => {
    if (nextArea === area && nextBackground === background) return;
    onPreviewOptionsChangeRef.current?.({
      area: nextArea,
      background: nextBackground,
    });
  };

  const handleExport = () => {
    if (!sanitizedFileName || props.isExporting) return;
    props.onOpenChange(false);
    void props.onExport(
      area === 'full-map'
        ? {
            format: format === 'svg' ? 'svg' : 'png-1x',
            area,
            targetLongEdge,
            background,
            fileName: sanitizedFileName,
            presentation,
            labels,
          }
        : {
            format,
            area,
            background,
            fileName: sanitizedFileName,
            presentation,
            labels,
          },
    );
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="max-h-[92vh] max-w-4xl overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('export.title')}</DialogTitle>
          <DialogDescription>{t('export.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <div className="space-y-3">
            <ExportPreview
              format={format}
              background={background}
              preview={props.preview}
              layout={layout}
              isLoading={props.isPreviewLoading ?? false}
            />
            <PresentationControls
              presentation={presentation}
              availability={availability}
              omitted={layout?.omitted ?? []}
              onToggle={(key, checked) => setPresentation(key, checked)}
              onAuthorChange={(author) => setPresentation('author', author)}
              onCornerChange={(corner) => setPresentation('corner', corner)}
            />
          </div>
          <div className="space-y-4">
            <label className="block space-y-1 text-xs font-semibold">
              <span>{t('export.fileName')}</span>
              <input
                ref={inputRef}
                value={fileName}
                onChange={(event) => setFileName(event.currentTarget.value)}
                onBlur={() => setFileName(sanitizedFileName)}
                aria-label={t('export.fileName')}
                className="h-9 w-full rounded-md border border-input bg-background px-3 font-normal"
              />
            </label>
            {area === 'viewport' ? (
              <ChoiceGroup
                legend={t('export.format')}
                name="export-format"
                value={format}
                choices={withSvgAvailability(
                  FORMAT_CHOICES,
                  svgUnavailable,
                  svgUnavailableReason,
                )}
                onChange={setFormat}
              />
            ) : (
              <ChoiceGroup
                legend={t('export.format')}
                name="export-format"
                value={format === 'svg' ? 'svg' : 'png-1x'}
                choices={withSvgAvailability(
                  FULL_MAP_FORMAT_CHOICES,
                  svgUnavailable,
                  svgUnavailableReason,
                )}
                onChange={setFormat}
              />
            )}
            <ChoiceGroup
              legend={t('export.area')}
              name="export-area"
              value={area}
              choices={AREA_CHOICES}
              onChange={(nextArea) => {
                requestPreview(nextArea, background);
                setArea(nextArea);
                if (nextArea === 'full-map') {
                  viewportFormatRef.current = format;
                  // SVG survives the switch — it has no density to collapse.
                  if (format !== 'svg') setFormat('png-1x');
                } else {
                  setFormat(viewportFormatRef.current);
                }
              }}
            />
            {area === 'full-map' ? (
              <ResolutionGroup
                value={targetLongEdge}
                onChange={setTargetLongEdge}
              />
            ) : null}
            <OutputDimensions
              area={area}
              format={format}
              targetLongEdge={targetLongEdge}
              preview={props.preview}
              bounds={cityData.bounds}
            />
            <ChoiceGroup
              legend={t('export.background')}
              name="export-background"
              value={background}
              choices={BACKGROUND_CHOICES}
              onChange={(nextBackground) => {
                requestPreview(area, nextBackground);
                setBackground(nextBackground);
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => props.onOpenChange(false)}
          >
            {t('export.cancelButton')}
          </Button>
          <Button
            type="button"
            disabled={!sanitizedFileName || props.isExporting}
            onClick={handleExport}
          >
            {t('export.exportButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
