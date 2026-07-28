import type { CityData } from './city-data';
import type {
  ExportArea,
  ExportBackground,
  ExportFormat,
} from '../ipc-contract';
import type { LayerOptions, LayerVisibility } from './layer';
import type { RenderStyleParams } from './theme';
import type { ExportPresentationOptions } from './export-presentation';

/** Raster density supported by the export pipeline. */
export type ExportScale = 1 | 2 | 4;

/** Camera state captured at the start of an export operation. */
export interface ExportCamera {
  /** MapLibre longitude of the camera center. */
  readonly longitude: number;
  /** MapLibre latitude of the camera center. */
  readonly latitude: number;
  /** MapLibre zoom level. */
  readonly zoom: number;
  /** Clockwise bearing in degrees. */
  readonly bearing: number;
  /** Camera pitch in degrees. */
  readonly pitch: number;
}

/** World-space extent captured by an export operation. */
export interface ExportExtent {
  /** Minimum world X coordinate. */
  readonly minX: number;
  /** Maximum world X coordinate. */
  readonly maxX: number;
  /** Minimum world Z coordinate. */
  readonly minZ: number;
  /** Maximum world Z coordinate. */
  readonly maxZ: number;
}

/** Dimensions of the temporary export surface in logical pixels. */
export interface ExportSurface {
  /** Surface width in logical pixels. */
  readonly width: number;
  /** Surface height in logical pixels. */
  readonly height: number;
}

/** Raster-specific request captured in an export snapshot. */
export interface ExportRequest {
  /** Requested PNG density. */
  readonly format: Exclude<ExportFormat, 'svg'>;
  /** Area selected for capture. */
  readonly area: ExportArea;
  /** Background selected for capture. */
  readonly background: ExportBackground;
  /** Sanitized base filename, without a path or extension. */
  readonly fileName: string;
  /** Cartographic presentation options resolved at capture time. */
  readonly presentation: Readonly<ExportPresentationOptions>;
}

/** Immutable input consumed by every future raster exporter. */
export interface ExportSnapshot {
  /** Opaque identifier unique to this export operation. */
  readonly snapshotId: string;
  /** Parsed city model retained by reference and never mutated by export. */
  readonly cityData: CityData;
  /** Resolved style values captured by value. */
  readonly style: Readonly<RenderStyleParams>;
  /** Layer visibility captured by value. */
  readonly activeLayers: Readonly<LayerVisibility>;
  /** Per-layer options captured by value. */
  readonly layerOptions: Readonly<LayerOptions>;
  /** Whether transit dimming was enabled at capture time. */
  readonly transitDimming: boolean;
  /** Whether the renderer watermark was enabled at capture time. */
  readonly watermarkVisible: boolean;
  /** Camera state captured by value. */
  readonly camera: ExportCamera;
  /** World extent captured by value. */
  readonly extent: ExportExtent;
  /** Temporary surface dimensions captured by value. */
  readonly surface: ExportSurface;
  /** User request captured by value. */
  readonly request: ExportRequest;
}

/** Arguments used to create an immutable {@link ExportSnapshot}. */
export interface ExportSnapshotInput {
  /** Optional caller-owned identifier, useful for reproducible harnesses. */
  readonly snapshotId?: string;
  /** Parsed city model retained by reference. */
  readonly cityData: CityData;
  /** Fully resolved theme parameters. */
  readonly style: RenderStyleParams;
  /** Current layer visibility. */
  readonly activeLayers: LayerVisibility;
  /** Current per-layer options. */
  readonly layerOptions: LayerOptions;
  /** Current transit dimming state. */
  readonly transitDimming: boolean;
  /** Current watermark state. */
  readonly watermarkVisible: boolean;
  /** Current camera. */
  readonly camera: ExportCamera;
  /** Current world extent. */
  readonly extent: ExportExtent;
  /** Current surface dimensions. */
  readonly surface: ExportSurface;
  /** Current export request. */
  readonly request: ExportRequest;
}

/** WebGL and canvas limits measured on a disposable surface. */
export interface CapabilityReport {
  /** WebGL context actually created by the probe. */
  readonly contextType: 'webgl2' | 'webgl' | 'unknown';
  /** Whether a WebGL2 context was available. */
  readonly webgl2: boolean;
  /** Maximum texture dimension reported by the driver. */
  readonly maxTextureSize: number | 'unknown';
  /** Maximum renderbuffer dimension reported by the driver. */
  readonly maxRenderbufferSize: number | 'unknown';
  /** Maximum viewport dimensions reported by the driver. */
  readonly maxViewportDims: readonly [number, number] | 'unknown';
  /** Maximum safe square canvas dimension derived from the measured limits. */
  readonly maxCanvasSize: number | 'unknown';
  /** Whether the surface can encode a PNG through `toBlob`. */
  readonly toBlob: boolean | 'unknown';
  /** Available memory when the platform exposes it, otherwise `unknown`. */
  readonly memoryAvailableBytes: number | 'unknown';
  /** Technical reason when a capability could not be observed. */
  readonly unknownReason?: string;
}

/** Technical reason why a tiled export cannot be selected. */
export type CapabilityUnavailableReason =
  | 'gpu'
  | 'webgl'
  | 'memory'
  | 'to-blob'
  | 'dimensions'
  | 'flag';

/** Typed result of checking whether a tiled export is possible. */
export interface TiledCapabilityDecision {
  /** Whether the requested tiled operation is technically eligible. */
  readonly eligible: boolean;
  /** Technical reason for a negative decision. */
  readonly reason?: CapabilityUnavailableReason;
}

/** Aggregated, privacy-safe measurements for a baseline run. */
export interface ExportBaselineMetrics {
  /** Export route measured by the harness. */
  readonly route: 'legacy' | 'tiled';
  /** Duration in milliseconds. */
  readonly durationMs: number | 'unknown';
  /** Output dimensions. */
  readonly dimensions: ExportSurface;
  /** Requested density. */
  readonly scale: ExportScale;
  /** Number of planned tiles, if applicable. */
  readonly tileBudget: number | 'unknown';
  /** Peak memory in bytes when observable. */
  readonly peakMemoryBytes: number | 'unknown';
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function freeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}

function makeSnapshotId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `snapshot-${Date.now()}`;
}

/** Creates a stable snapshot while retaining the original CityData reference. */
export function createExportSnapshot(
  input: ExportSnapshotInput,
): ExportSnapshot {
  const request = copy(input.request);
  freeze(request.presentation);
  freeze(request);
  return freeze({
    snapshotId: input.snapshotId ?? makeSnapshotId(),
    cityData: input.cityData,
    style: freeze(copy(input.style)),
    activeLayers: freeze(copy(input.activeLayers)),
    layerOptions: freeze(copy(input.layerOptions)),
    transitDimming: input.transitDimming,
    watermarkVisible: input.watermarkVisible,
    camera: freeze(copy(input.camera)),
    extent: freeze(copy(input.extent)),
    surface: freeze(copy(input.surface)),
    request,
  });
}

/** Decides tiled eligibility without changing renderer or interactive map state. */
export function evaluateTiledCapability(
  report: CapabilityReport,
  surface: ExportSurface,
  enabled = true,
): TiledCapabilityDecision {
  if (!enabled) return { eligible: false, reason: 'flag' };
  if (report.webgl2 === false) return { eligible: false, reason: 'webgl' };
  if (report.toBlob !== true) return { eligible: false, reason: 'to-blob' };
  if (report.maxCanvasSize === 'unknown') {
    return { eligible: false, reason: 'gpu' };
  }
  if (
    surface.width > report.maxCanvasSize ||
    surface.height > report.maxCanvasSize
  ) {
    return { eligible: false, reason: 'dimensions' };
  }
  return { eligible: true };
}
