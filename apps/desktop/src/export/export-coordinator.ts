import type {
  ExportCapabilities,
  ExportReceipt,
  ExportRequest,
  ExportSink,
  ExportSnapshot,
  RasterExportV2,
} from '@vellum/core';
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

/** Composition service that keeps legacy PNG as the only active route. */
export class ExportCoordinator implements RasterExportV2 {
  /** Version of the application-level export contract. */
  readonly version = 2 as const;

  private readonly legacyExporter: LegacyRasterExporter;
  private readonly legacySink: ExportSink;
  private active = false;

  /**
   * Pairs the legacy renderer adapter and its persistence sink explicitly.
   *
   * @param legacyExporter - The single-surface renderer adapter.
   * @param legacySink - The sink that owns the unchanged legacy IPC edge.
   */
  constructor(legacyExporter: LegacyRasterExporter, legacySink: ExportSink) {
    this.legacyExporter = legacyExporter;
    this.legacySink = legacySink;
  }

  /** Reports the legacy default and keeps tiled unavailable until cutover. */
  async capabilities(_request: ExportRequest): Promise<ExportCapabilities> {
    return {
      legacy: { eligible: true },
      tiled: { eligible: false, reason: 'flag' },
    };
  }

  /** Captures and persists one snapshot, returning only a committed receipt. */
  async export(
    snapshot: ExportSnapshot,
    signal = new AbortController().signal,
  ): Promise<ExportReceipt> {
    if (this.active) throw new Error('An export operation is already active');
    this.active = true;
    try {
      const capability = this.legacyExporter.capabilities(snapshot);
      if (!capability.eligible) {
        throw new ExportCapabilityError(capability.reason ?? 'memory');
      }
      let receipt: ExportReceipt | null = null;
      const sink: ExportSink = {
        begin: (metadata) => this.legacySink.begin(metadata),
        append: (session, chunk) => this.legacySink.append(session, chunk),
        finish: async (session) => {
          receipt = await this.legacySink.finish(session);
          return receipt;
        },
        cancel: (session, reason) => this.legacySink.cancel(session, reason),
      };
      await this.legacyExporter.export(snapshot, sink, signal);
      if (!receipt) throw new Error('Export completed without a receipt');
      return receipt;
    } finally {
      this.active = false;
    }
  }
}
