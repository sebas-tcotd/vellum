import type { CityData } from './city-data';
import type {
  ExportBackground,
  ExportFormat,
  ExportTargetLongEdge,
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
 * Resolves the capture density for a raster request.
 *
 * @remarks
 * `full-map` always captures at density 1 — `targetLongEdge` already encodes
 * the exact output resolution, so multiplying by `exportScaleForFormat` would
 * double-apply it. This is the single point of that rule; the renderer and
 * legacy exporter must call this instead of repeating the
 * `area === 'full-map' ? 1 : exportScaleForFormat(...)` conditional.
 */
export function exportScaleForRequest(request: ExportRequest): ExportScale {
  return request.area === 'full-map' ? 1 : exportScaleForFormat(request.format);
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

/** Shared raster request fields captured in an export snapshot. */
interface ExportRequestBase {
  /** Requested PNG density. */
  readonly format: Exclude<ExportFormat, 'svg'>;
  /** Background selected for capture. */
  readonly background: ExportBackground;
  /** Base filename supplied by the caller; sanitization is outside this contract. */
  readonly fileName: string;
  /** Cartographic presentation options resolved at capture time. */
  readonly presentation: Readonly<ExportPresentationOptions>;
}

/** Raster request for the current viewport, preserving density semantics. */
export interface ViewportExportRequest extends ExportRequestBase {
  /** Area selected for capture. */
  readonly area: 'viewport';
}

/** Raster request for the complete city extent at an explicit resolution. */
export interface FullMapExportRequest extends ExportRequestBase {
  /** Area selected for capture. */
  readonly area: 'full-map';
  /** Full-map exports only ever request the base density. */
  readonly format: 'png-1x';
  /** Long edge of the final raster in logical pixels. */
  readonly targetLongEdge: ExportTargetLongEdge;
}

/** Raster-specific request captured in an export snapshot. */
export type ExportRequest = ViewportExportRequest | FullMapExportRequest;

/**
 * Vector request captured in an SVG export snapshot.
 *
 * @remarks
 * A separate discriminated shape rather than a widened {@link ExportRequest}:
 * `ExportScale` and `png-*` densities are meaningless for a vector document,
 * and letting them be type-legal here would make `format: 'svg', scale: 4`
 * representable with nothing able to check it. `targetLongEdge` is optional
 * and only meaningful for `full-map`, where it sizes the `viewBox`.
 */
export interface SvgExportRequest {
  /** Vector exports have exactly one format. */
  readonly format: 'svg';
  /** Area selected for capture. */
  readonly area: 'viewport' | 'full-map';
  /** Long edge of the document in pixels; `full-map` only. */
  readonly targetLongEdge?: ExportTargetLongEdge;
  /** Background selected for capture. */
  readonly background: ExportBackground;
  /** Base filename supplied by the caller; sanitization is outside this contract. */
  readonly fileName: string;
  /** Cartographic presentation options resolved at capture time. */
  readonly presentation: Readonly<ExportPresentationOptions>;
}

/** Every request shape an export snapshot may carry. */
export type AnyExportRequest = ExportRequest | SvgExportRequest;

/** Everything an export snapshot captures apart from the user's request. */
export interface ExportSnapshotBase {
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
}

/** Immutable input consumed by every raster exporter. */
export interface ExportSnapshot extends ExportSnapshotBase {
  /** User request captured by value. */
  readonly request: ExportRequest;
}

/**
 * Immutable input consumed by the SVG exporter.
 *
 * @remarks
 * Structurally identical to {@link ExportSnapshot} except for `request`, which
 * keeps raster and vector operations from ever being passed to the wrong
 * exporter: a `SvgExportSnapshot` is not assignable to a raster port, and a
 * raster snapshot is not assignable to {@link SvgExportPort}.
 */
export interface SvgExportSnapshot extends ExportSnapshotBase {
  /** User request captured by value. */
  readonly request: SvgExportRequest;
}

/** Arguments used to create an immutable snapshot, minus the request. */
export interface ExportSnapshotInputBase {
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
}

/** Arguments used to create an immutable {@link ExportSnapshot}. */
export interface ExportSnapshotInput extends ExportSnapshotInputBase {
  /** Current export request. */
  readonly request: ExportRequest;
}

/** Arguments used to create an immutable {@link SvgExportSnapshot}. */
export interface SvgExportSnapshotInput extends ExportSnapshotInputBase {
  /** Current export request. */
  readonly request: SvgExportRequest;
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

/**
 * Export route represented by an adapter and its sink.
 *
 * @remarks
 * AD-11: an exporter and a sink are paired by mode. `streaming-svg` carries
 * UTF-8 XML chunks rather than encoded raster tiles, so it is never
 * interchangeable with either PNG route even though it reuses the same
 * transactional `begin/append/finish/cancel` lifecycle.
 */
export type ExportMode = 'legacy-png' | 'tiled-png' | 'streaming-svg';

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

/** One deterministic tile in a tiled raster export plan. */
export interface TilePlanTile {
  /** Zero-based row-major sequence number. */
  readonly sequence: number;
  /** Zero-based tile column. */
  readonly tileX: number;
  /** Zero-based tile row. */
  readonly tileY: number;
  /** Output pixels owned exclusively by this tile. */
  readonly usefulRect: PixelRect;
  /** Output pixels rendered for this tile, including clipped overscan. */
  readonly renderRect: PixelRect;
  /** Camera centered on the rendered rectangle. */
  readonly camera: ExportCamera;
  /** World extent represented by the rendered rectangle. */
  readonly extent: ExportExtent;
}

/** Pure, reproducible plan consumed by the future tiled raster renderer. */
export interface TilePlan {
  /** Tiles in row-major order. */
  readonly tiles: readonly TilePlanTile[];
  /** Number of tiles the downstream session must receive. */
  readonly expectedTiles: number;
  /** Explicit logical-to-physical scale; fixed at one for the MVP. */
  readonly pixelRatio: 1;
  /** Aspect-corrected world extent represented by the complete output. */
  readonly renderExtent: ExportExtent;
  /** Uniform output density in CS1 world units per output pixel. */
  readonly worldUnitsPerPixel: number;
  /** MapLibre zoom derived from the output density. */
  readonly zoom: number;
}

/** Typed non-throwing result when a tile plan cannot be built. */
export interface TilePlanRejection {
  /** Discriminator for a rejected plan. */
  readonly rejected: true;
  /** Technical reason the plan cannot be built. */
  readonly reason: CapabilityUnavailableReason;
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
    readonly reason?: CapabilityUnavailableReason;
  };
}

/** Metadata used to open a typed export sink session. */
export interface ExportBeginMetadata {
  /** Route that must be accepted by the sink. */
  readonly mode: ExportMode;
  /** Snapshot identifier associated with this operation. */
  readonly snapshotId: string;
  /** Request whose legacy fields are persisted by the sink. */
  readonly request: AnyExportRequest;
  /** Exact output width in pixels. */
  readonly outputWidth: number;
  /** Exact output height in pixels. */
  readonly outputHeight: number;
  /**
   * Number of chunks the adapter promises to append.
   *
   * @remarks
   * Zero is only legal for `streaming-svg`, where the chunk count is not
   * knowable before serialization runs; the session then accepts any number
   * of chunks and only requires at least one before publishing. Every raster
   * route must declare a positive, exact tile budget.
   */
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

/** Lifecycle phase reported by a raster exporter while an operation is active. */
export type ExportProgressPhase = 'capturing' | 'composing' | 'finishing';

/**
 * Progress payload derived entirely from already-accepted units (`AppendAck`).
 *
 * @remarks
 * `percent` only exists once `totalUnits` is known and greater than zero —
 * legacy exports never report it, keeping the UI's indeterminate state honest.
 */
export interface ExportProgress {
  /** Snapshot this progress belongs to; stale callbacks are discarded by identity. */
  readonly snapshotId: string;
  /** Sink session once the tiled route has opened one. */
  readonly sessionId?: string;
  /** Route reporting this progress. */
  readonly mode: ExportMode;
  /** Current lifecycle phase. */
  readonly phase: ExportProgressPhase;
  /** Units accepted so far — only advances after a sink `AppendAck`. */
  readonly completedUnits: number;
  /** Total units the operation expects to accept. */
  readonly totalUnits: number;
  /** Rounded 0–100 completion, present only when `totalUnits` is determinate. */
  readonly percent?: number;
}

/** Callback an exporter invokes after each accepted unit; never a required param. */
export type ExportProgressCallback = (progress: ExportProgress) => void;

/** Segregated port implemented by a concrete raster exporter. */
export interface RasterExportPort {
  /** Route implemented by this exporter. */
  readonly mode: ExportMode;
  /** Captures the snapshot and persists it through a compatible sink. */
  export(
    snapshot: ExportSnapshot,
    sink: ExportSink,
    signal: AbortSignal,
    onProgress?: ExportProgressCallback,
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

/**
 * Maximum bytes a single SVG chunk may carry.
 *
 * @remarks
 * AD-10's initial 1 MiB chunk budget. Deliberately far below the session's
 * 64 MiB in-flight ceiling: with `maxInFlight = 1`, a smaller chunk is what
 * keeps peak memory bounded and cancellation responsive during a long
 * serialization.
 */
export const SVG_CHUNK_TARGET_BYTES = 1024 * 1024;

/** One UTF-8 XML fragment delivered from the SVG serializer to its sink. */
export interface SvgTextChunk {
  /** Strictly increasing chunk sequence, beginning at zero. */
  readonly sequence: number;
  /** XML fragment; concatenating every chunk in order yields the document. */
  readonly text: string;
}

/** Persistence port for the transactional SVG streaming session. */
export interface SvgExportSink {
  /** Opens a `streaming-svg` session. */
  begin(metadata: ExportBeginMetadata): Promise<ExportSession>;
  /** Accepts one XML fragment. */
  append(session: ExportSession, chunk: SvgTextChunk): Promise<AppendAck>;
  /** Publishes the completed document and returns its receipt. */
  finish(session: ExportSession): Promise<ExportReceipt>;
  /** Abandons a session without publishing a file. */
  cancel(session: ExportSession, reason: ExportCancelReason): Promise<void>;
}

/** Why an SVG export cannot be produced for a captured snapshot. */
export type SvgUnavailableReason =
  /** The camera is tilted; the MVP projection is strictly top-down. */
  | 'camera-pitch'
  /** The camera is rotated; the MVP projection has a fixed orientation. */
  | 'camera-bearing'
  /** The requested output surface is degenerate or not finite. */
  | 'dimensions'
  /** The requested area covers no world extent. */
  | 'extent';

/** Typed, non-throwing eligibility result for an SVG export. */
export interface SvgCapabilityDecision {
  /** Whether the snapshot can be exported as SVG. */
  readonly eligible: boolean;
  /** Technical reason for a negative decision. */
  readonly reason?: SvgUnavailableReason;
}

/**
 * Application-level vector export contract.
 *
 * @remarks
 * Deliberately not folded into {@link RasterExportV2}: a caller holding this
 * port cannot accidentally hand it a raster snapshot, and the raster
 * coordinator's tile/capability vocabulary has no meaning here. AC 9 lives in
 * {@link capabilitiesForSnapshot} — an unsupported camera is rejected before
 * a session is ever opened, never silently flattened.
 */
export interface SvgExportPort {
  /** Route implemented by this exporter. */
  readonly mode: 'streaming-svg';
  /** Reports eligibility for an already captured snapshot, without side effects. */
  capabilitiesForSnapshot(snapshot: SvgExportSnapshot): SvgCapabilityDecision;
  /** Serializes one snapshot and returns only a committed receipt. */
  export(
    snapshot: SvgExportSnapshot,
    signal?: AbortSignal,
    onProgress?: ExportProgressCallback,
  ): Promise<ExportReceipt>;
}

/** Application-level raster export contract implemented by the coordinator. */
export interface RasterExportV2 {
  /** Contract version for the new export boundary. */
  readonly version: 2;
  /**
   * Reports device-level capability without changing renderer or store state.
   *
   * @deprecated Use {@link capabilitiesForSnapshot} after capturing a
   * snapshot. This request-level method cannot evaluate dimensions or camera.
   */
  capabilities(request: ExportRequest): Promise<ExportCapabilities>;
  /**
   * Reports the real, falsifiable per-operation eligibility for an already
   * captured snapshot.
   *
   * @remarks
   * `capabilities(request)` alone carries no camera/extent/surface, so it can
   * only ever report device-level tiled eligibility and a static
   * `legacy.eligible: true` — it cannot detect an oversized legacy surface or
   * a rejected tile plan. This method re-runs the same checks `export()` is
   * about to perform, so a caller can bail out before ever invoking it.
   */
  capabilitiesForSnapshot(snapshot: ExportSnapshot): ExportCapabilities;
  /** Exports one immutable snapshot and returns its persisted receipt. */
  export(
    snapshot: ExportSnapshot,
    signal?: AbortSignal,
    onProgress?: ExportProgressCallback,
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

function freezeSnapshot<Request extends AnyExportRequest>(
  input: ExportSnapshotInputBase & { readonly request: Request },
): ExportSnapshotBase & { readonly request: Request } {
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

/** Creates a stable snapshot while retaining the original CityData reference. */
export function createExportSnapshot(
  input: ExportSnapshotInput,
): ExportSnapshot {
  return freezeSnapshot(input);
}

/** Creates a stable SVG snapshot while retaining the original CityData reference. */
export function createSvgExportSnapshot(
  input: SvgExportSnapshotInput,
): SvgExportSnapshot {
  return freezeSnapshot(input);
}

/**
 * Decides whether a captured snapshot can be exported as SVG.
 *
 * @remarks
 * AC 9: an unsupported camera is a *content* rejection, not a device
 * limitation — there is no GPU or encoder involved. Keeping it here, in the
 * dependency-free core, is what lets both the exporter and its caller run the
 * identical check without either owning the rule.
 */
export function evaluateSvgCapability(
  snapshot: SvgExportSnapshot,
): SvgCapabilityDecision {
  const { camera, surface, extent } = snapshot;
  if (!isNeutralAngle(camera.pitch)) {
    return { eligible: false, reason: 'camera-pitch' };
  }
  if (!isNeutralAngle(normalizeBearing(camera.bearing))) {
    return { eligible: false, reason: 'camera-bearing' };
  }
  if (
    !Number.isFinite(surface.width) ||
    !Number.isFinite(surface.height) ||
    surface.width < 1 ||
    surface.height < 1
  ) {
    return { eligible: false, reason: 'dimensions' };
  }
  if (extent.maxX <= extent.minX || extent.maxZ <= extent.minZ) {
    return { eligible: false, reason: 'extent' };
  }
  return { eligible: true };
}

/**
 * Tolerance in degrees for treating a camera angle as top-down/north-up.
 *
 * @remarks
 * MapLibre reports floating-point angles, so an untouched camera can read as
 * `1e-14` rather than exactly zero. A tolerance well below one degree accepts
 * that noise while still rejecting any rotation or tilt a user could have
 * applied deliberately.
 */
const CAMERA_ANGLE_EPSILON_DEG = 1e-6;

function isNeutralAngle(degrees: number): boolean {
  return (
    Number.isFinite(degrees) && Math.abs(degrees) < CAMERA_ANGLE_EPSILON_DEG
  );
}

function normalizeBearing(degrees: number): number {
  if (!Number.isFinite(degrees)) return Number.NaN;
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/**
 * Decides tiled eligibility without changing renderer or interactive map state.
 *
 * @remarks
 * The renderer-webgl adapter builds and validates the real {@link TilePlan}
 * first. This function only combines that plan with WebGL, encoder, and flag
 * availability, preserving core's dependency-free boundary.
 */
export function evaluateTiledCapability(
  report: CapabilityReport,
  plan: TilePlan,
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
  if (plan.expectedTiles <= 0) {
    return { eligible: false, reason: 'dimensions' };
  }
  return { eligible: true };
}
