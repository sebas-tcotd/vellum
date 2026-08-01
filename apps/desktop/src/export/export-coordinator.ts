import type {
  CapabilityReport,
  ExportCapabilities,
  ExportProgressCallback,
  ExportReceipt,
  ExportRequest,
  ExportSink,
  ExportSnapshot,
  ExportSession,
  RasterExportPort,
  RasterExportV2,
  TiledCapabilityDecision,
} from '@vellum/core';
import { evaluateTiledCapability } from '@vellum/core';
import {
  LegacyRasterExporter,
  planTiles,
  TiledExportCapabilityError,
} from '@vellum/renderer-webgl';

/** Typed reason for rejecting a legacy request before capture begins. */
export type LegacyCapabilityReason = 'area' | 'pixels' | 'memory';

/** Error raised when the requested legacy surface cannot be captured safely. */
export class ExportCapabilityError extends Error {
  /** Technical capability reason retained for logs and tests, not UI copy. */
  readonly reason: LegacyCapabilityReason;

  /** Creates a typed capability failure without changing the request. */
  constructor(reason: LegacyCapabilityReason) {
    super(`Legacy PNG export is unavailable: ${reason}`);
    this.name = 'ExportCapabilityError';
    this.reason = reason;
  }
}

/** Error raised when an exporter and sink are paired with different modes. */
export class ExportPairingError extends Error {
  /** Creates a pairing error without exposing technical details to the UI. */
  constructor(expected: string, received: string) {
    super(
      `Export route pairing mismatch: expected ${expected}, received ${received}`,
    );
    this.name = 'ExportPairingError';
  }
}

/** Runtime controls for the production tiled cutover. */
export interface ExportCutoverConfig {
  /** Whether the quality gate has been approved for the current release. */
  readonly gateApproved: boolean | (() => boolean);
  /** Whether the tiled route is enabled for operational use. */
  readonly tiledEnabled: boolean | (() => boolean);
  /** Runtime rollback override; true forces new exports through legacy. */
  readonly killSwitch: boolean | (() => boolean);
}

/** Local-storage key used by the operational rollback procedure. */
export const EXPORT_FORCE_LEGACY_KEY = 'vellum.export.forceLegacy';

/** Local-storage key used to approve the cutover after the release gate. */
export const EXPORT_TILED_GATE_KEY = 'vellum.export.tiledGateApproved';

/** Reads a boolean runtime override without making browser storage mandatory. */
export function readExportRuntimeFlag(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === 'true';
  } catch {
    return false;
  }
}

/**
 * Optional tiled route the coordinator may select instead of legacy.
 *
 * @remarks
 * `enabled` defaults to `false` — pairing this with the coordinator does not
 * change the production default. Only an explicit `enabled: true` (used by
 * tests and, later, the 6.2I cutover) makes `capabilities()` report
 * `tiled.eligible: true` and lets `export()` prefer this route.
 */
export interface TiledRouteConfig {
  /** The tiled renderer adapter driving capture and chunk sequencing. */
  readonly exporter: RasterExportPort;
  /** The transactional sink accepting tiled-png sessions. */
  readonly sink: ExportSink;
  /** Measured WebGL/canvas limits used for the flag-independent eligibility checks. */
  readonly capability: CapabilityReport;
  /** Explicit opt-in; the route stays unavailable when omitted or `false`. */
  readonly enabled?: boolean;
  /** Gate and runtime controls applied before every capability decision. */
  readonly cutover?: ExportCutoverConfig;
}

/** Composition service that selects between the legacy and (opt-in) tiled routes. */
export class ExportCoordinator implements RasterExportV2 {
  /** Version of the application-level export contract. */
  readonly version = 2 as const;

  private readonly legacyExporter: LegacyRasterExporter;
  private readonly legacySink: ExportSink;
  private tiledRoute: TiledRouteConfig | undefined;
  private active = false;
  private lastRoute: RasterExportPort['mode'] | null = null;

  /**
   * Pairs the legacy renderer adapter and its persistence sink explicitly.
   *
   * @param legacyExporter - The single-surface renderer adapter.
   * @param legacySink - The sink that owns the unchanged legacy IPC edge.
   * @param tiledRoute - Optional, explicitly-enabled tiled route (default: none).
   */
  constructor(
    legacyExporter: LegacyRasterExporter,
    legacySink: ExportSink,
    tiledRoute?: TiledRouteConfig,
  ) {
    this.legacyExporter = legacyExporter;
    this.legacySink = legacySink;
    this.tiledRoute = tiledRoute;
  }

  /** Installs the measured tiled route after the asynchronous capability probe. */
  setTiledRoute(route: TiledRouteConfig): void {
    if (this.active)
      throw new Error('Cannot change export routes while exporting');
    this.tiledRoute = route;
  }

  /** Returns the route used by the latest successfully completed export. */
  getLastRoute(): RasterExportPort['mode'] | null {
    return this.lastRoute;
  }

  /**
   * Reports the legacy default and, when tiled is explicitly enabled, a
   * device-level eligibility only.
   *
   * @remarks
   * `ExportRequest` alone carries no camera/extent/surface, so the real,
   * per-operation dimension/camera check (the one `planTiles` performs)
   * cannot run here — only `export()` has the full `ExportSnapshot` needed
   * for that. A caller must not treat `tiled.eligible: true` here as a
   * guarantee that a specific operation will be planned successfully;
   * `export()` re-checks against the real snapshot before ever selecting
   * this route.
   */
  async capabilities(_request: ExportRequest): Promise<ExportCapabilities> {
    return {
      legacy: { eligible: true },
      tiled: this.deviceTiledDecision(),
    };
  }

  /**
   * Real, falsifiable eligibility for an already captured snapshot — reuses
   * the exact same checks `export()` is about to run, so it can never
   * diverge from what that call would actually do.
   */
  capabilitiesForSnapshot(snapshot: ExportSnapshot): ExportCapabilities {
    return {
      legacy: this.legacyExporter.capabilities(snapshot),
      tiled: this.realTiledDecision(snapshot),
    };
  }

  /** Captures and persists one snapshot, returning only a committed receipt. */
  async export(
    snapshot: ExportSnapshot,
    signal = new AbortController().signal,
    onProgress?: ExportProgressCallback,
  ): Promise<ExportReceipt> {
    if (this.active) throw new Error('An export operation is already active');
    this.active = true;
    try {
      const route = this.tiledRoute;
      if (route && this.realTiledDecision(snapshot).eligible) {
        try {
          return await this.runRoute(
            route.exporter,
            route.sink,
            snapshot,
            signal,
            onProgress,
          );
        } catch (error: unknown) {
          if (!this.canFallbackToLegacy(error, signal)) throw error;
        }
      }
      return await this.runLegacy(snapshot, signal, onProgress);
    } finally {
      this.active = false;
    }
  }

  /** Device-only decision (GPU/canvas/encoder) — no snapshot dimensions available yet. */
  private deviceTiledDecision(): TiledCapabilityDecision {
    if (!this.isTiledRouteEnabled()) return { eligible: false, reason: 'flag' };
    const route = this.tiledRoute;
    if (!route) return { eligible: false, reason: 'flag' };
    const { capability } = route;
    if (capability.webgl2 === false)
      return { eligible: false, reason: 'webgl' };
    if (capability.toBlob !== true)
      return { eligible: false, reason: 'to-blob' };
    if (
      capability.maxCanvasSize === 'unknown' ||
      !Number.isInteger(capability.maxCanvasSize) ||
      capability.maxCanvasSize <= 0
    ) {
      return { eligible: false, reason: 'gpu' };
    }
    return { eligible: true };
  }

  /**
   * Real decision built from the actual snapshot's dimensions and camera —
   * built with the exact same {@link planTiles} the tiled exporter itself
   * uses, so eligibility here can never diverge from what `export()` is
   * about to attempt.
   */
  private realTiledDecision(snapshot: ExportSnapshot): TiledCapabilityDecision {
    if (!this.tiledRoute || !this.isTiledRouteEnabled())
      return { eligible: false, reason: 'flag' };
    const plan = planTiles(snapshot, this.tiledRoute.capability);
    if ('rejected' in plan) return { eligible: false, reason: plan.reason };
    return evaluateTiledCapability(this.tiledRoute.capability, plan, true);
  }

  private isTiledRouteEnabled(): boolean {
    const route = this.tiledRoute;
    if (!route?.enabled) return false;
    if (!route.cutover) return true;
    return (
      readConfigValue(route.cutover.gateApproved) &&
      readConfigValue(route.cutover.tiledEnabled) &&
      !readConfigValue(route.cutover.killSwitch)
    );
  }

  private async runLegacy(
    snapshot: ExportSnapshot,
    signal: AbortSignal,
    onProgress: ExportProgressCallback | undefined,
  ): Promise<ExportReceipt> {
    const capability = this.legacyExporter.capabilities(snapshot);
    if (!capability.eligible) {
      throw new ExportCapabilityError(capability.reason ?? 'memory');
    }
    return this.runRoute(
      this.legacyExporter,
      this.legacySink,
      snapshot,
      signal,
      onProgress,
    );
  }

  private canFallbackToLegacy(error: unknown, signal: AbortSignal): boolean {
    if (signal.aborted || isAbortError(error)) return false;
    return error instanceof TiledExportCapabilityError;
  }

  private async runRoute(
    exporter: RasterExportPort,
    persistSink: ExportSink,
    snapshot: ExportSnapshot,
    signal: AbortSignal,
    onProgress: ExportProgressCallback | undefined,
  ): Promise<ExportReceipt> {
    let receipt: ExportReceipt | null = null;
    const state: { session?: ExportSession } = {};
    let cancelled = false;
    const sink: ExportSink = {
      begin: async (metadata) => {
        const opened = await persistSink.begin(metadata);
        if (opened.mode !== exporter.mode) {
          await persistSink.cancel(opened, 'invalid-chunk');
          throw new ExportPairingError(exporter.mode, opened.mode);
        }
        state.session = opened;
        return opened;
      },
      append: (session, chunk) => persistSink.append(session, chunk),
      finish: async (session) => {
        receipt = await persistSink.finish(session);
        return receipt;
      },
      cancel: async (opened, reason) => {
        cancelled = true;
        await persistSink.cancel(opened, reason);
      },
    };
    try {
      await exporter.export(snapshot, sink, signal, onProgress);
    } catch (error: unknown) {
      if (state.session && !cancelled && receipt === null) {
        await persistSink
          .cancel(state.session, signal.aborted ? 'aborted' : 'capture-failed')
          .catch(() => undefined);
      }
      throw error;
    }
    if (!receipt) throw new Error('Export completed without a receipt');
    this.lastRoute = exporter.mode;
    return receipt;
  }
}

function readConfigValue(value: boolean | (() => boolean)): boolean {
  return typeof value === 'function' ? value() : value;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
