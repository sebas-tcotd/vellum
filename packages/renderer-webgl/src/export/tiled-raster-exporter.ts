import type {
  CapabilityReport,
  ExportSink,
  ExportSnapshot,
  ExportCancelReason,
  RasterExportPort,
  RenderStyleParams,
  TilePlan,
  TilePlanRejection,
  TilePlanTile,
} from '@vellum/core';
import { planTiles } from './tile-planner';
import { RasterTileRenderer } from './raster-tile-renderer';

/** The subset of `RasterTileRenderer` this exporter drives — narrowed for test injection. */
export interface TileCapture {
  /** Loads the snapshot's city once onto the temporary surface. */
  configure(snapshot: ExportSnapshot, signal: AbortSignal): Promise<void>;
  /** Captures exactly one tile and returns its encoded PNG bytes. */
  captureTile(tile: TilePlanTile, signal: AbortSignal): Promise<Uint8Array>;
  /** Releases the temporary surface. Idempotent. */
  dispose(): void;
}

/** Adapter that produces a tiled PNG raster export with bounded overscan. */
export class TiledRasterExporter implements RasterExportPort {
  /** Route implemented by this adapter. */
  readonly mode = 'tiled-png' as const;

  private readonly plan: (
    snapshot: ExportSnapshot,
  ) => TilePlan | TilePlanRejection;
  private readonly createRenderer: (style: RenderStyleParams) => TileCapture;

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
  ) {
    this.plan = (snapshot) => {
      if (capability.toBlob !== true)
        return { rejected: true, reason: 'to-blob' };
      return planTiles(snapshot, capability);
    };
    this.createRenderer = createRenderer;
  }

  /** Captures, appends, and finishes every tile of a deterministic plan sequentially. */
  async export(
    snapshot: ExportSnapshot,
    sink: ExportSink,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    const plan = this.plan(snapshot);
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
    let finishStarted = false;
    let renderer: TileCapture | null = null;
    let cancelReason: ExportCancelReason = 'capture-failed';
    try {
      renderer = this.createRenderer(snapshot.style);
      throwIfAborted(signal);
      await renderer.configure(snapshot, signal);
      for (const tile of plan.tiles) {
        throwIfAborted(signal);
        const encodedPng = await renderer.captureTile(tile, signal);
        throwIfAborted(signal);
        cancelReason = 'sink-failed';
        await sink.append(session, {
          sequence: tile.sequence,
          tileX: tile.tileX,
          tileY: tile.tileY,
          usefulRect: tile.usefulRect,
          renderRect: tile.renderRect,
          encodedPng,
        });
        cancelReason = 'capture-failed';
      }
      throwIfAborted(signal);
      finishStarted = true;
      await sink.finish(session);
    } catch (error: unknown) {
      if (!finishStarted) {
        await sink.cancel(session, signal.aborted ? 'aborted' : cancelReason);
      }
      throw error;
    } finally {
      renderer?.dispose();
    }
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error('Export aborted');
  error.name = 'AbortError';
  throw error;
}
