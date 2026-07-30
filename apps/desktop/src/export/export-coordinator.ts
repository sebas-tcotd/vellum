import type {
  CapabilityReport,
  ExportCapabilities,
  ExportProgressCallback,
  ExportReceipt,
  ExportRequest,
  ExportSink,
  ExportSnapshot,
  RasterExportPort,
  RasterExportV2,
  TiledCapabilityDecision,
  TilePlan,
} from '@vellum/core';
import { evaluateTiledCapability } from '@vellum/core';
import { LegacyRasterExporter } from '@vellum/renderer-webgl';

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
}

/** A plan-shaped placeholder used only to reuse `evaluateTiledCapability`'s flag/GPU checks. */
const NOMINAL_PLAN: TilePlan = {
  tiles: [],
  expectedTiles: 1,
  pixelRatio: 1,
  renderExtent: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
  worldUnitsPerPixel: 1,
  zoom: 0,
};

/** Composition service that selects between the legacy and (opt-in) tiled routes. */
export class ExportCoordinator implements RasterExportV2 {
  /** Version of the application-level export contract. */
  readonly version = 2 as const;

  private readonly legacyExporter: LegacyRasterExporter;
  private readonly legacySink: ExportSink;
  private readonly tiledRoute: TiledRouteConfig | undefined;
  private active = false;

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

  /** Reports the legacy default and only reports tiled when explicitly enabled. */
  async capabilities(_request: ExportRequest): Promise<ExportCapabilities> {
    return {
      legacy: { eligible: true },
      tiled: this.tiledDecision(),
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
      if (this.tiledRoute?.enabled && this.tiledDecision().eligible) {
        return await this.runRoute(
          this.tiledRoute.exporter,
          this.tiledRoute.sink,
          snapshot,
          signal,
          onProgress,
        );
      }
      const capability = this.legacyExporter.capabilities(snapshot);
      if (!capability.eligible) {
        throw new ExportCapabilityError(capability.reason ?? 'memory');
      }
      return await this.runRoute(
        this.legacyExporter,
        this.legacySink,
        snapshot,
        signal,
        onProgress,
      );
    } finally {
      this.active = false;
    }
  }

  private tiledDecision(): TiledCapabilityDecision {
    if (!this.tiledRoute) return { eligible: false, reason: 'flag' };
    return evaluateTiledCapability(
      this.tiledRoute.capability,
      NOMINAL_PLAN,
      this.tiledRoute.enabled ?? false,
    );
  }

  private async runRoute(
    exporter: RasterExportPort,
    persistSink: ExportSink,
    snapshot: ExportSnapshot,
    signal: AbortSignal,
    onProgress: ExportProgressCallback | undefined,
  ): Promise<ExportReceipt> {
    let receipt: ExportReceipt | null = null;
    const sink: ExportSink = {
      begin: (metadata) => persistSink.begin(metadata),
      append: (session, chunk) => persistSink.append(session, chunk),
      finish: async (session) => {
        receipt = await persistSink.finish(session);
        return receipt;
      },
      cancel: (session, reason) => persistSink.cancel(session, reason),
    };
    await exporter.export(snapshot, sink, signal, onProgress);
    if (!receipt) throw new Error('Export completed without a receipt');
    return receipt;
  }
}
