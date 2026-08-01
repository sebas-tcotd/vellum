import type {
  ExportCapabilities,
  ExportSink,
  ExportSnapshot,
  RasterExportPort,
} from '@vellum/core';
import { exportScaleForFormat } from '@vellum/core';
import { captureExportSnapshotPng } from './maplibre-png-capture';
import type { PngExportOptions } from './export-types';
import { MapLibreRenderer } from '../map-libre-renderer';

const MAX_LEGACY_EXPORT_PIXELS = 64_000_000;

type SnapshotCapture = (
  snapshot: ExportSnapshot,
  options: PngExportOptions,
  signal: AbortSignal,
) => Promise<Uint8Array>;

/** Adapter that preserves the existing single-surface MapLibre PNG capture. */
export class LegacyRasterExporter implements RasterExportPort {
  /** Route implemented by this adapter. */
  readonly mode = 'legacy-png' as const;

  private readonly capture: SnapshotCapture;

  /**
   * Creates an adapter with the production MapLibre capture or a test capture.
   *
   * @param capture - Optional isolated-surface capture implementation.
   */
  constructor(
    capture: SnapshotCapture = (snapshot, options, signal) =>
      captureExportSnapshotPng(
        snapshot,
        options,
        signal,
        (container, style) =>
          new MapLibreRenderer(container, style, {
            preserveDrawingBuffer: true,
            releasesDemProtocol: false,
          }),
      ),
  ) {
    this.capture = capture;
  }

  /** Returns the explicit single-surface eligibility decision for a snapshot. */
  capabilities(snapshot: ExportSnapshot): ExportCapabilities['legacy'] {
    const { width, height } = snapshot.surface;
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return { eligible: false, reason: 'area' };
    }
    if (width * height > MAX_LEGACY_EXPORT_PIXELS) {
      return { eligible: false, reason: 'pixels' };
    }
    return { eligible: true };
  }

  /** Captures, appends, and finishes exactly one complete PNG chunk. */
  async export(
    snapshot: ExportSnapshot,
    sink: ExportSink,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    const capability = this.capabilities(snapshot);
    if (!capability.eligible) {
      throw new Error(
        `Legacy PNG export is unavailable: ${capability.reason ?? 'memory'}`,
      );
    }

    const session = await sink.begin({
      mode: this.mode,
      snapshotId: snapshot.snapshotId,
      request: snapshot.request,
      outputWidth: snapshot.surface.width,
      outputHeight: snapshot.surface.height,
      expectedTiles: 1,
    });
    let finishStarted = false;
    try {
      throwIfAborted(signal);
      const captureOptions: PngExportOptions = {
        scale: exportScaleForFormat(snapshot.request.format),
        area: snapshot.request.area,
        background: snapshot.request.background,
      };
      const encodedPng = await this.capture(snapshot, captureOptions, signal);
      throwIfAborted(signal);
      await sink.append(session, {
        sequence: 0,
        tileX: 0,
        tileY: 0,
        usefulRect: { x: 0, y: 0, ...snapshot.surface },
        renderRect: { x: 0, y: 0, ...snapshot.surface },
        encodedPng,
      });
      throwIfAborted(signal);
      finishStarted = true;
      await sink.finish(session);
    } catch (error: unknown) {
      if (!finishStarted) {
        await sink.cancel(session, signal.aborted ? 'aborted' : 'sink-failed');
      }
      throw error;
    }
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error('Export aborted');
  error.name = 'AbortError';
  throw error;
}
