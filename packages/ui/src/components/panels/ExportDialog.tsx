import type {
  ExportArea,
  ExportBackground,
  ExportDialogOptions,
  ExportFormat,
  ExportExtent,
  ExportPresentationOptions,
  ExportPreviewSnapshot,
  ExportTargetLongEdge,
  LayerName,
  TransitMode,
} from '@vellum/core';
import { exportScaleForFormat } from '@vellum/core';
import {
  resolveFullMapOutputSurface,
  vellumLogoDataUri,
} from '@vellum/renderer-webgl';
import { useEffect, useMemo, useRef, useState } from 'react';
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

/** Describes which optional cartographic content exists for the loaded map. */
export interface ExportContentAvailability {
  /** Whether district annotations can be generated. */
  districts: boolean;
  /** Whether park-area annotations can be generated. */
  parks: boolean;
  /** Whether a road hierarchy legend can be generated. */
  roads: boolean;
  /** Whether a transit legend can be generated. */
  transit: boolean;
  /** Whether an elevation legend can be generated. */
  elevation: boolean;
}

/** Collection counts derived from immutable `CityData`. */
export interface ExportContentCounts {
  /** Physical road-segment count. */
  roads: number;
  /** Building count. */
  buildings: number;
  /** District count. */
  districts: number;
  /** Park-area count. */
  parks: number;
  /** Transit-line count. */
  transitLines: number;
  /** Transit-stop count. */
  transitStops: number;
}

/** Props for the controlled export-configuration dialog. */
export interface ExportDialogProps {
  /** Whether the Radix dialog is open. */
  open: boolean;
  /** City name used for identity and the initial filename. */
  cityName: string;
  /** Source `.cslmap` filename. */
  fileName: string;
  /** Source generation timestamp, when available. */
  generatedAt: string;
  /** Background derived from the current visual theme. */
  defaultBackground: ExportBackground;
  /** Captured MapLibre viewport and its projection-derived metadata. */
  preview: ExportPreviewSnapshot | null;
  /** Full city extent used to calculate target-resolution dimensions. */
  fullMapBounds: Pick<ExportExtent, 'minX' | 'maxX' | 'minZ' | 'maxZ'>;
  /** Optional-content availability derived from the loaded city. */
  availability: ExportContentAvailability;
  /** Collection counts derived from the loaded city. */
  counts: ExportContentCounts;
  /** Visible-layer labels rendered in the preview legend. */
  visibleLayerNames?: LayerName[];
  /** Transit line or mode labels rendered in the preview legend. */
  transitLabels?: ExportTransitLegendItem[];
  /** Prevents submission while a future exporter is active. */
  isExporting?: boolean;
  /** Receives all controlled-open state changes, including Escape. */
  onOpenChange: (open: boolean) => void;
  /** Receives a sanitized, typed configuration without invoking IPC. */
  onExport: (options: ExportDialogOptions) => Promise<void>;
}

/** A transit line entry rendered in the localized export legend. */
export interface ExportTransitLegendItem {
  /** Stable transit-line identifier. */
  id: string;
  /** Parsed transit mode used to select the localized label. */
  mode: TransitMode;
  /** User-defined transit-line name. */
  name: string;
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
  | 'export.background_transparent';

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
  disabled?: boolean;
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

const EMPTY_LAYERS: LayerName[] = [];
const EMPTY_TRANSIT_LABELS: ExportTransitLegendItem[] = [];
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const ROAD_LEGEND_ENTRIES = [
  { key: 'road-highway', label: 'export.legend_road_highway' },
  { key: 'road-arterial', label: 'export.legend_road_arterial' },
  { key: 'road-local', label: 'export.legend_road_local' },
  { key: 'road-rail', label: 'export.legend_road_rail' },
] as const;

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
    showVellumLogo: false,
    showSourceFile: false,
    showGeneratedAt: false,
    showDistrictNames: false,
    showParkNames: false,
    showLayerLegend: false,
    showRoadLegend: false,
    showTransitLegend: false,
    showElevationLegend: false,
    showScaleBar: false,
    showOrientation: false,
    showSummary: false,
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

function outputDimensions(
  area: ExportArea,
  format: ExportFormat,
  targetLongEdge: ExportTargetLongEdge,
  preview: ExportPreviewSnapshot | null,
  bounds: ExportDialogProps['fullMapBounds'],
): { width: number; height: number } | null {
  if (area === 'viewport') {
    if (!preview || format === 'svg') return null;
    const scale = exportScaleForFormat(format);
    return { width: preview.width * scale, height: preview.height * scale };
  }
  const extentWidth = bounds.maxX - bounds.minX;
  const extentHeight = bounds.maxZ - bounds.minZ;
  if (extentWidth <= 0 || extentHeight <= 0) return null;
  return resolveFullMapOutputSurface(bounds, targetLongEdge);
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
  bounds: ExportDialogProps['fullMapBounds'];
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
  disabled,
  onChange,
}: PresentationToggleProps) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className={disabled ? 'opacity-50' : undefined}>{label}</span>
    </label>
  );
}

function PreviewIdentity({
  presentation,
  cityName,
  fileName,
  generatedAt,
}: Pick<ExportDialogProps, 'cityName' | 'fileName' | 'generatedAt'> & {
  presentation: ExportPresentationOptions;
}) {
  if (
    !presentation.showCityName &&
    !presentation.showVellumLogo &&
    !presentation.showSourceFile &&
    !presentation.showGeneratedAt
  ) {
    return null;
  }
  return (
    <div className="absolute left-3 top-3 max-w-[55%] rounded bg-background/85 p-2 text-[10px] shadow">
      {presentation.showCityName && <strong>{cityName}</strong>}
      {presentation.showVellumLogo && (
        <img
          src={vellumLogoDataUri()}
          alt=""
          aria-hidden="true"
          className="mt-1 h-8 w-8"
        />
      )}
      {presentation.showSourceFile && <div>{fileName}</div>}
      {presentation.showGeneratedAt && <div>{generatedAt}</div>}
    </div>
  );
}

function PreviewAnnotations({
  presentation,
  preview,
}: {
  presentation: ExportPresentationOptions;
  preview: ExportPreviewSnapshot | null;
}) {
  const annotations =
    preview?.annotations.filter(
      (annotation) =>
        (annotation.kind === 'district' && presentation.showDistrictNames) ||
        (annotation.kind === 'park' && presentation.showParkNames),
    ) ?? [];
  if (annotations.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 text-[9px] font-semibold text-white drop-shadow">
      {annotations.map((annotation) => (
        <span
          key={`${annotation.kind}-${annotation.id}`}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${annotation.xPercent}%`,
            top: `${annotation.yPercent}%`,
          }}
        >
          {annotation.name}
        </span>
      ))}
    </div>
  );
}

function PreviewLegends({
  presentation,
  visibleLayerNames,
  transitLabels,
}: {
  presentation: ExportPresentationOptions;
  visibleLayerNames: LayerName[];
  transitLabels: ExportTransitLegendItem[];
}) {
  const { t } = useTranslation();
  const entries = [
    ...(presentation.showLayerLegend
      ? visibleLayerNames.map((layer) => ({
          key: `layer-${layer}`,
          label: t(`layers.${layer}`),
        }))
      : []),
    ...(presentation.showRoadLegend
      ? ROAD_LEGEND_ENTRIES.map((entry) => ({
          key: entry.key,
          label: t(entry.label),
        }))
      : []),
    ...(presentation.showTransitLegend
      ? transitLabels.map((line) => ({
          key: `transit-${line.id}`,
          label: `${t(`transitModes.${line.mode}`)}: ${line.name}`,
        }))
      : []),
    ...(presentation.showElevationLegend
      ? [
          {
            key: 'elevation-contours',
            label: t('export.legend_elevationContours'),
          },
          { key: 'elevation-low', label: t('export.legend_elevationLow') },
          { key: 'elevation-high', label: t('export.legend_elevationHigh') },
        ]
      : []),
  ];
  if (entries.length === 0) return null;
  return (
    <div className="absolute right-3 top-3 max-w-[35%] rounded bg-background/85 p-2 text-[9px] shadow">
      {entries.slice(0, 12).map((entry) => (
        <div key={entry.key}>{entry.label}</div>
      ))}
    </div>
  );
}

function PreviewAids({
  presentation,
  counts,
  preview,
}: {
  presentation: ExportPresentationOptions;
  counts: ExportContentCounts;
  preview: ExportPreviewSnapshot | null;
}) {
  const { t } = useTranslation();
  const scale = preview?.scale;
  const scaleLabel =
    scale && scale.distanceMeters >= 1_000
      ? `${scale.distanceMeters / 1_000} km`
      : `${scale?.distanceMeters ?? 0} m`;
  return (
    <>
      {presentation.showScaleBar && scale && (
        <div
          data-testid="export-preview-scale"
          className="absolute bottom-3 left-3 border-b-2 border-current text-center text-[9px]"
          style={{ width: `${scale.widthPercent}%` }}
        >
          {scaleLabel}
        </div>
      )}
      {presentation.showOrientation && preview && (
        <div
          data-testid="export-preview-orientation"
          data-bearing={preview.bearingDegrees}
          className="absolute bottom-3 right-3 text-xs font-bold"
          style={{ transform: `rotate(${-preview.bearingDegrees}deg)` }}
        >
          ↑ N
        </div>
      )}
      {presentation.showSummary && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-background/85 px-2 py-1 text-[8px]">
          {counts.roads} {t('export.summary_roads')} · {counts.buildings}{' '}
          {t('export.summary_buildings')} · {counts.districts}{' '}
          {t('export.summary_districts')} · {counts.parks}{' '}
          {t('export.summary_parks')} · {counts.transitLines}{' '}
          {t('export.summary_lines')} · {counts.transitStops}{' '}
          {t('export.summary_stops')}
        </div>
      )}
    </>
  );
}

function ExportPreview({
  format,
  background,
  preview,
  presentation,
  cityName,
  fileName,
  generatedAt,
  visibleLayerNames = EMPTY_LAYERS,
  transitLabels = EMPTY_TRANSIT_LABELS,
  counts,
}: Pick<
  ExportDialogProps,
  | 'preview'
  | 'cityName'
  | 'fileName'
  | 'generatedAt'
  | 'visibleLayerNames'
  | 'transitLabels'
  | 'counts'
> & {
  format: ExportFormat;
  background: ExportBackground;
  presentation: ExportPresentationOptions;
}) {
  const { t } = useTranslation();
  const backgroundClass =
    background === 'dark'
      ? 'bg-slate-950 text-white'
      : background === 'white'
        ? 'bg-white text-slate-950'
        : 'bg-[repeating-conic-gradient(#d1d5db_0_25%,#fff_0_50%)_0_0/16px_16px] text-slate-950';
  return (
    <div
      data-testid="export-preview"
      data-format={format}
      data-background={background}
      role="img"
      aria-label={t('export.preview')}
      className={cn(
        'relative aspect-video overflow-hidden rounded-md border border-panel-border',
        backgroundClass,
      )}
    >
      {preview ? (
        <img
          src={preview.dataUrl}
          alt=""
          className="h-full w-full object-cover"
          style={{ opacity: background === 'transparent' ? 0.78 : 0.9 }}
          draggable={false}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs opacity-60">
          {t('export.previewUnavailable')}
        </div>
      )}
      <PreviewIdentity
        presentation={presentation}
        cityName={cityName}
        fileName={fileName}
        generatedAt={generatedAt}
      />
      <PreviewAnnotations presentation={presentation} preview={preview} />
      <PreviewLegends
        presentation={presentation}
        visibleLayerNames={visibleLayerNames}
        transitLabels={transitLabels}
      />
      <PreviewAids
        presentation={presentation}
        counts={counts}
        preview={preview}
      />
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

function PresentationControls({
  presentation,
  availability,
  setPresentation,
}: {
  presentation: ExportPresentationOptions;
  availability: ExportContentAvailability;
  setPresentation: (
    key: keyof ExportPresentationOptions,
    checked: boolean,
  ) => void;
}) {
  const { t } = useTranslation();
  const toggle = (
    key: keyof ExportPresentationOptions,
    label: string,
    disabled = false,
  ) => (
    <PresentationToggle
      key={key}
      label={label}
      checked={presentation[key]}
      disabled={disabled}
      onChange={(checked) => setPresentation(key, checked)}
    />
  );
  return (
    <fieldset className="space-y-3 rounded-md border border-panel-border p-3">
      <legend className="px-1 text-xs font-semibold">
        {t('export.cartographicElements')}
      </legend>
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase opacity-60">
          {t('export.group_identity')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {toggle('showCityName', t('export.element_cityName'))}
          {toggle('showVellumLogo', t('export.element_logo'))}
          {toggle('showSourceFile', t('export.element_sourceFile'))}
          {toggle('showGeneratedAt', t('export.element_generatedAt'))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase opacity-60">
          {t('export.group_annotations')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {toggle(
            'showDistrictNames',
            t('export.element_districts'),
            !availability.districts,
          )}
          {toggle(
            'showParkNames',
            t('export.element_parks'),
            !availability.parks,
          )}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase opacity-60">
          {t('export.group_legends')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {toggle('showLayerLegend', t('export.element_layerLegend'))}
          {toggle(
            'showRoadLegend',
            t('export.element_roadLegend'),
            !availability.roads,
          )}
          {toggle(
            'showTransitLegend',
            t('export.element_transitLegend'),
            !availability.transit,
          )}
          {toggle(
            'showElevationLegend',
            t('export.element_elevationLegend'),
            !availability.elevation,
          )}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase opacity-60">
          {t('export.group_aids')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {toggle('showScaleBar', t('export.element_scaleBar'))}
          {toggle('showOrientation', t('export.element_orientation'))}
          {toggle('showSummary', t('export.element_summary'))}
        </div>
      </div>
    </fieldset>
  );
}

/**
 * Controlled export configuration dialog with a non-destructive map preview.
 *
 * @remarks
 * Story 6.1 prepares a typed callback only. The component never invokes Tauri
 * commands and never mutates renderer, camera, theme, layers, or `CityData`.
 */
export function ExportDialog(props: ExportDialogProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState(() =>
    initialFileName(props.cityName),
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

  useEffect(() => {
    if (!props.open) return;
    setFileName(initialFileName(props.cityName));
    setFormat('png-1x');
    viewportFormatRef.current = 'png-1x';
    setArea('viewport');
    setTargetLongEdge(6000);
    setBackground(props.defaultBackground);
    setPresentationState(initialPresentation());
  }, [props.cityName, props.defaultBackground, props.open]);

  const sanitizedFileName = useMemo(
    () => sanitizeExportFileName(fileName),
    [fileName],
  );
  const setPresentation = (
    key: keyof ExportPresentationOptions,
    checked: boolean,
  ) => {
    setPresentationState((current) => ({ ...current, [key]: checked }));
  };
  // A rotated capture cannot be projected top-down, so the vector route is
  // withdrawn while it lasts instead of failing after the user commits.
  const svgUnavailable =
    props.preview !== null &&
    Math.abs(normalizeBearing(props.preview.bearingDegrees)) >
      BEARING_EPSILON_DEG;
  const svgUnavailableReason = t('errors.SvgExportUnsupportedCamera');
  useEffect(() => {
    if (svgUnavailable && format === 'svg') setFormat('png-1x');
  }, [svgUnavailable, format]);

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
          }
        : {
            format,
            area,
            background,
            fileName: sanitizedFileName,
            presentation,
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
              presentation={presentation}
              cityName={props.cityName}
              fileName={props.fileName}
              generatedAt={props.generatedAt}
              {...(props.visibleLayerNames
                ? { visibleLayerNames: props.visibleLayerNames }
                : {})}
              {...(props.transitLabels
                ? { transitLabels: props.transitLabels }
                : {})}
              counts={props.counts}
            />
            <PresentationControls
              presentation={presentation}
              availability={props.availability}
              setPresentation={setPresentation}
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
              bounds={props.fullMapBounds}
            />
            <ChoiceGroup
              legend={t('export.background')}
              name="export-background"
              value={background}
              choices={BACKGROUND_CHOICES}
              onChange={setBackground}
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
