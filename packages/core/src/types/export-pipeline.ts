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

const SCALE_BY_FORMAT: Readonly<
  Record<Exclude<ExportFormat, 'svg'>, ExportScale>
> = Object.freeze({
  'png-1x': 1,
  'png-2x': 2,
  'png-4x': 4,
});

/**
 * Resolves the numeric density encoded in a raster export format.
 *
 * @remarks
 * The single conversion point between `ExportRequest.format` and
 * {@link ExportScale}. Without it, `'png-4x'` and `scale: 1` are both type-legal
 * in the same operation and nothing can mechanically check they agree.
 */
export function exportScaleForFormat(
  format: Exclude<ExportFormat, 'svg'>,
): ExportScale {
  return SCALE_BY_FORMAT[format];
}

/**
 * Maximum logical pixels a single tiled export operation may produce.
 *
 * @remarks
 * Initial budget from ARCHITECTURE-SPINE AD-10 ("Output lógico por operación").
 * Deliberately separate from the legacy single-surface cap of 64.000.000
 * pixels — adjust only with measured evidence.
 */
export const MAX_TILED_LOGICAL_PIXELS = 1_000_000_000;

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
  /** Base filename supplied by the caller; sanitization is outside this contract. */
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

/** Export route represented by a raster adapter and its sink. */
export type ExportMode = 'legacy-png' | 'tiled-png';

/** A rectangle expressed in output pixels. */
export interface PixelRect {
  /** Horizontal pixel origin. */
  readonly x: number;
  /** Vertical pixel origin. */
  readonly y: number;
  /** Rectangle width in pixels. */
  readonly width: number;
  /** Rectangle height in pixels. */
  readonly height: number;
}

/** Capability decision exposed to the application before an export begins. */
export interface ExportCapabilities {
  /** Eligibility of the preserved single-surface PNG path. */
  readonly legacy: {
    /** Whether the requested operation fits the legacy path. */
    readonly eligible: boolean;
    /** Why the legacy path is unavailable, when applicable. */
    readonly reason?: 'area' | 'pixels' | 'memory';
  };
  /** Tiled path status during the legacy-only transition. */
  readonly tiled: {
    /** Whether the tiled path can be selected. */
    readonly eligible: boolean;
    /** Why the tiled path is unavailable, when applicable. */
    readonly reason?: 'gpu' | 'webgl' | 'memory' | 'flag';
  };
}

/** Metadata used to open a typed export sink session. */
export interface ExportBeginMetadata {
  /** Route that must be accepted by the sink. */
  readonly mode: ExportMode;
  /** Snapshot identifier associated with this operation. */
  readonly snapshotId: string;
  /** Request whose legacy fields are persisted by the sink. */
  readonly request: ExportRequest;
  /** Exact output width in pixels. */
  readonly outputWidth: number;
  /** Exact output height in pixels. */
  readonly outputHeight: number;
  /** Number of chunks the adapter promises to append. */
  readonly expectedTiles: number;
}

/** Opaque sink session returned by `begin`. */
export interface ExportSession {
  /** Non-reusable operation identifier. */
  readonly sessionId: string;
  /** Route accepted by this session. */
  readonly mode: ExportMode;
  /** Maximum encoded bytes accepted in one chunk. */
  readonly maxChunkBytes: number;
  /** Maximum number of chunks allowed in flight. */
  readonly maxInFlight: 1;
}

/** A raster chunk delivered from an exporter to its sink. */
export interface RasterTileChunk {
  /** Strictly increasing chunk sequence, beginning at zero. */
  readonly sequence: number;
  /** Tile column; zero for the complete legacy surface. */
  readonly tileX: number;
  /** Tile row; zero for the complete legacy surface. */
  readonly tileY: number;
  /** Useful output rectangle covered by the encoded bytes. */
  readonly usefulRect: PixelRect;
  /** Render rectangle represented by the encoded bytes. */
  readonly renderRect: PixelRect;
  /** Encoded PNG bytes, retained as binary until the legacy IPC boundary. */
  readonly encodedPng: Uint8Array;
}

/** Acknowledgement returned after a sink accepts a raster chunk. */
export interface AppendAck {
  /** Session that accepted the chunk. */
  readonly sessionId: string;
  /** Sequence accepted by the sink. */
  readonly sequence: number;
  /** Number of encoded bytes accepted. */
  readonly acceptedBytes: number;
  /** Number of accepted output units; one for the complete legacy chunk. */
  readonly completedUnits: number;
}

/** Reasons used when abandoning an in-memory or future tiled session. */
export type ExportCancelReason =
  | 'aborted'
  | 'capture-failed'
  | 'sink-failed'
  | 'invalid-chunk';

/** Receipt returned only after the sink confirms the final file. */
export interface ExportReceipt {
  /** Absolute path to the published file, matching `ExportResult.filePath`. */
  readonly filePath: string;
  /** Absolute path to the containing folder, matching `ExportResult.folderPath`. */
  readonly folderPath: string;
}

/** Segregated port implemented by a concrete raster exporter. */
export interface RasterExportPort {
  /** Route implemented by this exporter. */
  readonly mode: ExportMode;
  /** Captures the snapshot and persists it through a compatible sink. */
  export(
    snapshot: ExportSnapshot,
    sink: ExportSink,
    signal: AbortSignal,
  ): Promise<void>;
}

/** Persistence port kept separate from renderers and UI frameworks. */
export interface ExportSink {
  /** Opens a session for the requested export route. */
  begin(metadata: ExportBeginMetadata): Promise<ExportSession>;
  /** Accepts one encoded raster chunk. */
  append(session: ExportSession, chunk: RasterTileChunk): Promise<AppendAck>;
  /** Publishes the completed operation and returns its receipt. */
  finish(session: ExportSession): Promise<ExportReceipt>;
  /** Abandons a session without publishing a file. */
  cancel(session: ExportSession, reason: ExportCancelReason): Promise<void>;
}

/** Application-level raster export contract implemented by the coordinator. */
export interface RasterExportV2 {
  /** Contract version for the new export boundary. */
  readonly version: 2;
  /** Reports capability without changing renderer or store state. */
  capabilities(request: ExportRequest): Promise<ExportCapabilities>;
  /** Exports one immutable snapshot and returns its persisted receipt. */
  export(
    snapshot: ExportSnapshot,
    signal?: AbortSignal,
  ): Promise<ExportReceipt>;
}

function copy<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return cloneFallback(value, new WeakMap<object, unknown>());
  }
}

function cloneFallback<T>(value: T, seen: WeakMap<object, unknown>): T {
  // Functions cannot be cloned; sharing the reference is the only option and is
  // safe because a resolver closure carries no snapshot state of its own.
  if (value === null || typeof value !== 'object') return value;
  const existing = seen.get(value);
  if (existing) return existing as T;

  // These carry internal slots that `Object.create` + `Object.entries` cannot
  // reproduce: copying them field-by-field yields an object with the right
  // prototype and no slots, so every method on it throws.
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (value instanceof Map) {
    const clone = new Map<unknown, unknown>();
    seen.set(value, clone);
    for (const [key, nested] of value) {
      clone.set(key, cloneFallback(nested, seen));
    }
    return clone as T;
  }
  if (value instanceof Set) {
    const clone = new Set<unknown>();
    seen.set(value, clone);
    for (const nested of value) clone.add(cloneFallback(nested, seen));
    return clone as T;
  }

  const clone: Record<string, unknown> = Array.isArray(value)
    ? ([] as unknown as Record<string, unknown>)
    : Object.create(Object.getPrototypeOf(value));
  seen.set(value, clone);
  for (const [key, nested] of Object.entries(value)) {
    clone[key] = cloneFallback(nested, seen);
  }
  return clone as T;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  // `Object.freeze` throws on an ArrayBuffer view that has elements.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  seen.add(value);
  if (value instanceof Map) {
    for (const nested of value.values()) deepFreeze(nested, seen);
    return Object.freeze(value);
  }
  if (value instanceof Set) {
    for (const nested of value) deepFreeze(nested, seen);
    return Object.freeze(value);
  }
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

let snapshotSequence = 0;

function makeSnapshotId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  const randomBytes = new Uint32Array(2);
  globalThis.crypto?.getRandomValues?.(randomBytes);
  snapshotSequence += 1;
  return `snapshot-${snapshotSequence}-${randomBytes[0].toString(16)}${randomBytes[1].toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** Creates a stable snapshot while retaining the original CityData reference. */
export function createExportSnapshot(
  input: ExportSnapshotInput,
): ExportSnapshot {
  const request = copy(input.request);
  deepFreeze(request);
  return Object.freeze({
    snapshotId: input.snapshotId?.trim() || makeSnapshotId(),
    cityData: input.cityData,
    style: deepFreeze(copy(input.style)),
    activeLayers: deepFreeze(copy(input.activeLayers)),
    layerOptions: deepFreeze(copy(input.layerOptions)),
    transitDimming: input.transitDimming,
    watermarkVisible: input.watermarkVisible,
    camera: deepFreeze(copy(input.camera)),
    extent: deepFreeze(copy(input.extent)),
    surface: deepFreeze(copy(input.surface)),
    request,
  });
}

/**
 * Decides tiled eligibility without changing renderer or interactive map state.
 *
 * @remarks
 * **Provisional dimension check.** This story (6.2A) does not implement the
 * tile planner (6.2D) — there is no notion of tile size yet. Until then,
 * `eligible: true` means "the whole surface fits within a single GPU-sized
 * canvas," not "a tile plan exists that covers it." A surface that exceeds
 * `maxCanvasSize` on either edge is rejected even if it could theoretically
 * be split into valid tiles, per AD-12's stated intent ("elegible sólo si el
 * tile plan cabe") — because no planner exists yet to actually verify that.
 * 6.2D must replace the per-edge check below with one that consults a real
 * tile plan instead of the raw surface dimensions.
 */
export function evaluateTiledCapability(
  report: CapabilityReport,
  surface: ExportSurface,
  enabled = true,
): TiledCapabilityDecision {
  if (!enabled) return { eligible: false, reason: 'flag' };
  if (report.webgl2 === false) return { eligible: false, reason: 'webgl' };
  if (report.toBlob !== true) return { eligible: false, reason: 'to-blob' };
  if (
    report.maxCanvasSize === 'unknown' ||
    !Number.isFinite(report.maxCanvasSize)
  ) {
    return { eligible: false, reason: 'gpu' };
  }
  if (
    !Number.isFinite(surface.width) ||
    !Number.isFinite(surface.height) ||
    surface.width <= 0 ||
    surface.height <= 0
  ) {
    return { eligible: false, reason: 'dimensions' };
  }
  if (
    surface.width > report.maxCanvasSize ||
    surface.height > report.maxCanvasSize
  ) {
    return { eligible: false, reason: 'dimensions' };
  }
  // Both edges can fit the driver limit while the total area still blows the
  // per-operation budget (40k x 40k = 1.6e9 pixels on an 8k-capable GPU).
  if (surface.width * surface.height > MAX_TILED_LOGICAL_PIXELS) {
    return { eligible: false, reason: 'dimensions' };
  }
  return { eligible: true };
}
