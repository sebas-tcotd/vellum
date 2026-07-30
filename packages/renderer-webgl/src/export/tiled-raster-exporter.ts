import type {
  CapabilityReport,
  ExportSink,
  ExportSnapshot,
  ExportCancelReason,
  ExportProgressCallback,
  ExportProgressPhase,
  RasterExportPort,
  RenderStyleParams,
  TilePlan,
  TilePlanRejection,
  TilePlanTile,
} from '@vellum/core';
import { planTiles } from './tile-planner';
import { RasterTileRenderer } from './raster-tile-renderer';
import {
  createBrowserPngCodec,
  preflightQuality,
  processQualityPng,
  type ExportQualityConfig,
} from './export-quality';

/** The subset of `RasterTileRenderer` this exporter drives — narrowed for test injection. */
export interface TileCapture {
  /** Loads the snapshot's city once onto the temporary surface. */
  configure(snapshot: ExportSnapshot, signal: AbortSignal): Promise<void>;
  /** Captures exactly one tile and returns its encoded PNG bytes. */
  captureTile(tile: TilePlanTile, signal: AbortSignal): Promise<Uint8Array>;
  /** Captures a tile at a requested physical scale when the adapter supports it. */
  captureTileAtScale?(
    tile: TilePlanTile,
    scale: number,
    signal: AbortSignal,
  ): Promise<Uint8Array>;
  /** Releases the temporary surface. Idempotent. */
  dispose(): void;
}

/** Adapter that produces a tiled PNG raster export with bounded overscan. */
export class TiledRasterExporter implements RasterExportPort {
  /** Route implemented by this adapter. */
  readonly mode = 'tiled-png' as const;

  private readonly plan: (
    snapshot: ExportSnapshot,
    signal: AbortSignal,
  ) => TilePlan | TilePlanRejection;
  private readonly createRenderer: (style: RenderStyleParams) => TileCapture;
  private readonly capability: CapabilityReport;
  private readonly quality: ExportQualityConfig;

  /**
   * Creates an adapter bound to a measured capability report.
   *
   * @param capability - GPU/canvas limits used to build the deterministic tile plan.
   * @param createRenderer - Optional factory for a test double replacing `RasterTileRenderer`.
   */
  constructor(
    capability: CapabilityReport,
    createRenderer: (style: RenderStyleParams) => TileCapture = (style) =>
      new RasterTileRenderer(style),
    quality: ExportQualityConfig = {},
  ) {
    this.capability = capability;
    this.quality = quality;
    this.plan = (snapshot, signal) => {
      if (capability.toBlob !== true)
        return { rejected: true, reason: 'to-blob' };
      return planTiles(snapshot, capability, signal);
    };
    this.createRenderer = createRenderer;
  }

  /** Captures, appends, and finishes every tile of a deterministic plan sequentially. */
  async export(
    snapshot: ExportSnapshot,
    sink: ExportSink,
    signal: AbortSignal,
    onProgress?: ExportProgressCallback,
  ): Promise<void> {
    throwIfAborted(signal);
    const plan = this.plan(snapshot, signal);
    if ('rejected' in plan) {
      throw new Error(`Tiled PNG export is unavailable: ${plan.reason}`);
    }

    const session = await sink.begin({
      mode: this.mode,
      snapshotId: snapshot.snapshotId,
      request: snapshot.request,
      outputWidth: snapshot.surface.width,
      outputHeight: snapshot.surface.height,
      expectedTiles: plan.expectedTiles,
    });
    const totalUnits = plan.expectedTiles;
    const emit = (phase: ExportProgressPhase, completedUnits: number): void => {
      if (!onProgress) return;
      const percent =
        totalUnits > 0
          ? Math.min(
              100,
              Math.max(0, Math.round((completedUnits / totalUnits) * 100)),
            )
          : undefined;
      onProgress({
        snapshotId: snapshot.snapshotId,
        sessionId: session.sessionId,
        mode: this.mode,
        phase,
        completedUnits,
        totalUnits,
        ...(percent !== undefined ? { percent } : {}),
      });
    };
    let finishStarted = false;
    let renderer: TileCapture | null = null;
    let cancelReason: ExportCancelReason = 'capture-failed';
    let completedUnits = 0;
    try {
      renderer = this.createRenderer(snapshot.style);
      throwIfAborted(signal);
      await renderer.configure(snapshot, signal);
      for (const tile of plan.tiles) {
        throwIfAborted(signal);
        emit('capturing', completedUnits);
        const encodedPng = await this.captureTile(renderer, tile, signal);
        throwIfAborted(signal);
        cancelReason = 'sink-failed';
        const ack = await sink.append(session, {
          sequence: tile.sequence,
          tileX: tile.tileX,
          tileY: tile.tileY,
          usefulRect: tile.usefulRect,
          renderRect: tile.renderRect,
          encodedPng,
        });
        // `AppendAck.completedUnits` counts only the units this ack just
        // accepted (Rust always reports `1` per tile), never a running
        // total — accumulate here, clamped so a duplicate/repeated ack can
        // never push progress past `totalUnits`.
        completedUnits =
          totalUnits > 0
            ? Math.min(totalUnits, completedUnits + ack.completedUnits)
            : completedUnits + ack.completedUnits;
        emit('composing', completedUnits);
        cancelReason = 'capture-failed';
      }
      throwIfAborted(signal);
      // `sink.finish()` is the only point a tile export is durably
      // published — a cancellation that arrives while it's in flight must
      // still reach Rust before the atomic rename, not after. Racing a
      // proactive `cancel` alongside the await (rather than waiting for
      // `finish()` to settle first) is what lets `session.rs`'s own
      // `cancel_requested` check — already race-safe on its side — actually
      // fire in time.
      const cancellation = { request: null as Promise<void> | null };
      const cancelIfAborted = (): void => {
        cancellation.request ??= sink.cancel(session, 'aborted');
      };
      signal.addEventListener('abort', cancelIfAborted, { once: true });
      try {
        if (signal.aborted) cancelIfAborted();
        emit('finishing', completedUnits);
        finishStarted = true;
        await sink.finish(session);
        await cancellation.request?.catch(() => undefined);
      } finally {
        signal.removeEventListener('abort', cancelIfAborted);
      }
    } catch (error: unknown) {
      if (!finishStarted) {
        await sink.cancel(session, signal.aborted ? 'aborted' : cancelReason);
      }
      throw error;
    } finally {
      renderer?.dispose();
    }
  }

  private async captureTile(
    renderer: TileCapture,
    tile: TilePlanTile,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    if (this.quality.enabled !== true)
      return renderer.captureTile(tile, signal);
    const preflight = preflightQuality(tile, this.capability, this.quality);
    if (!preflight.eligible) return renderer.captureTile(tile, signal);
    const codec = this.quality.codec ?? createBrowserPngCodec();
    try {
      const physicalPng = await this.capturePhysicalTile(
        renderer,
        tile,
        preflight.factor,
        signal,
      );
      return await processQualityPng(
        physicalPng,
        tile,
        this.quality,
        codec,
        signal,
      );
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      return renderer.captureTile(tile, signal);
    }
  }

  private async capturePhysicalTile(
    renderer: TileCapture,
    tile: TilePlanTile,
    factor: number,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    if (factor === 1 || renderer.captureTileAtScale === undefined)
      return renderer.captureTile(tile, signal);
    return renderer.captureTileAtScale(tile, factor, signal);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error('Export aborted');
  error.name = 'AbortError';
  throw error;
}
