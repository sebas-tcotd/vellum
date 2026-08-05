/**
 * Orchestrates one SVG export: scene → worker → sink → receipt.
 *
 * @remarks
 * Owns the parts that must not live in the worker (Tauri IPC, cancellation
 * wiring, progress) and none of the parts that must not live on the main
 * thread (XML construction). The scene is built here, on the main thread,
 * because deriving it needs `renderer-webgl`'s geometry builders; it is a
 * single pass over already-parsed data producing plain arrays, and every
 * string-heavy step — which is the expensive half — happens in the worker.
 *
 * The transactional order is deliberate and never reordered: the worker only
 * signals `ready-to-commit` once every chunk has been *acknowledged by Rust*,
 * and only then does `finish()` publish. A receipt is therefore the sole
 * evidence a file exists.
 */

import {
  evaluateSvgCapability,
  SVG_CHUNK_TARGET_BYTES,
  type CartographicScene,
  type ExportProgress,
  type ExportProgressCallback,
  type ExportReceipt,
  type ExportSession,
  type SceneWarning,
  type SvgCapabilityDecision,
  type SvgExportPort,
  type SvgExportSink,
  type SvgExportSnapshot,
} from '@vellum/core';
import { buildCartographicScene } from '@vellum/renderer-webgl';
import { resolveSvgExportPolicy } from './svg-export-policy';
import type { SvgExportMetrics } from './svg-export-metrics';
import { peakOf, readPeakMemoryBytes } from './svg-export-metrics';
import type {
  SvgWorkerCommand,
  SvgWorkerEvent,
  SvgWorkerReply,
} from './svg-worker-protocol';

/** Minimal `Worker` surface the exporter depends on, so tests can fake it. */
export interface SvgWorkerHandle {
  /** Sends one command or reply to the worker. */
  postMessage(message: SvgWorkerCommand | SvgWorkerReply): void;
  /** Receives worker events; assigned once per operation. */
  onmessage: ((event: MessageEvent<SvgWorkerEvent>) => void) | null;
  /** Receives worker-level failures (a load or uncaught error). */
  onerror: ((event: unknown) => void) | null;
  /** Releases the worker thread. */
  terminate(): void;
}

/** Everything the exporter needs wired from the composition root. */
export interface SvgExporterOptions {
  /** Creates a fresh worker per operation, so state never leaks between exports. */
  readonly createWorker: () => SvgWorkerHandle;
  /** Transactional sink speaking the streaming-svg session. */
  readonly sink: SvgExportSink;
  /**
   * Pins the local-road width instead of deriving it from the document's own
   * density. Normally omitted — see `svg-export-policy.ts`.
   */
  readonly localRoadWidthPx?: number;
  /** Optional override of the chunk budget, for tests. */
  readonly chunkTargetBytes?: number;
  /** Receives aggregated, privacy-safe fallbacks for localized surfacing. */
  readonly onWarnings?: (warnings: readonly SceneWarning[]) => void;
  /**
   * Receives the aggregated run metrics AC 10 requires.
   *
   * @remarks
   * Duration, published size and peak memory only — never a path, a city
   * name, or anything read out of `CityData`.
   */
  readonly onMetrics?: (metrics: SvgExportMetrics) => void;
}

/** Error raised when the snapshot's camera or surface rules out an SVG export. */
export class SvgExportCapabilityError extends Error {
  /** Technical reason retained for logs and tests, never for UI copy. */
  readonly reason: NonNullable<SvgCapabilityDecision['reason']>;

  /** Creates a typed capability failure without touching the request. */
  constructor(reason: NonNullable<SvgCapabilityDecision['reason']>) {
    super(`SVG export is unavailable: ${reason}`);
    this.name = 'SvgExportCapabilityError';
    this.reason = reason;
  }
}

/** Streams one captured snapshot out as a self-contained SVG document. */
export class SvgExporter implements SvgExportPort {
  /** Route implemented by this exporter. */
  readonly mode = 'streaming-svg' as const;

  private readonly options: SvgExporterOptions;
  private active = false;

  /**
   * Wires the worker factory and sink.
   *
   * @param options - Worker factory, sink, and optional tuning overrides.
   */
  constructor(options: SvgExporterOptions) {
    this.options = options;
  }

  /**
   * Reports whether this snapshot can be exported, running the exact check
   * `export()` is about to run.
   */
  capabilitiesForSnapshot(snapshot: SvgExportSnapshot): SvgCapabilityDecision {
    return evaluateSvgCapability(snapshot);
  }

  /**
   * Serializes and publishes one snapshot.
   *
   * @param snapshot - Immutable capture of the scene to export.
   * @param signal - Abort signal; aborting cancels the worker and the session.
   * @param onProgress - Invoked only after Rust has accepted a chunk.
   * @returns The receipt of the published document.
   */
  async export(
    snapshot: SvgExportSnapshot,
    signal: AbortSignal = new AbortController().signal,
    onProgress?: ExportProgressCallback,
  ): Promise<ExportReceipt> {
    if (this.active) throw new Error('An SVG export is already active');
    const decision = this.capabilitiesForSnapshot(snapshot);
    // AC 9: rejected before a worker or a session exists — an unsupported
    // camera never gets silently flattened into a top-down one.
    if (!decision.eligible) {
      throw new SvgExportCapabilityError(decision.reason ?? 'dimensions');
    }
    this.active = true;
    try {
      return await this.run(snapshot, signal, onProgress);
    } finally {
      this.active = false;
    }
  }

  private async run(
    snapshot: SvgExportSnapshot,
    signal: AbortSignal,
    onProgress: ExportProgressCallback | undefined,
  ): Promise<ExportReceipt> {
    const policy = resolveSvgExportPolicy({
      outputWidth: snapshot.surface.width,
      worldSpanX: snapshot.extent.maxX - snapshot.extent.minX,
      ...(this.options.localRoadWidthPx !== undefined
        ? { localRoadWidthPx: this.options.localRoadWidthPx }
        : {}),
    });
    const scene = buildCartographicScene({
      snapshot,
      background: snapshot.request.background,
      roadWidthFactor: policy.roadWidthFactor,
      roadCasingAddPx: policy.roadCasingAddPx,
    });
    throwIfAborted(signal);

    const worker = this.options.createWorker();
    const startedAt = Date.now();
    const memoryAtStart = readPeakMemoryBytes();
    let session: ExportSession | null = null;
    let committed = false;
    let bytes = 0;
    try {
      session = await this.options.sink.begin({
        mode: 'streaming-svg',
        snapshotId: snapshot.snapshotId,
        request: snapshot.request,
        outputWidth: snapshot.surface.width,
        outputHeight: snapshot.surface.height,
        // Unknown until serialization ends; the Rust session treats zero as
        // "streaming" and checks completeness at the writer instead.
        expectedTiles: 0,
      });
      const outcome = await this.pump(
        worker,
        session,
        snapshot,
        scene,
        signal,
        onProgress,
      );
      bytes = outcome.bytes;
      const receipt = await this.options.sink.finish(session);
      committed = true;
      this.options.onWarnings?.(outcome.warnings);
      this.options.onMetrics?.({
        durationMs: Date.now() - startedAt,
        byteLength: bytes,
        chunks: outcome.chunks,
        peakMemoryBytes: peakOf(memoryAtStart, readPeakMemoryBytes()),
      });
      return receipt;
    } catch (error: unknown) {
      if (session && !committed) {
        await this.options.sink
          .cancel(session, signal.aborted ? 'aborted' : 'sink-failed')
          .catch(() => undefined);
      }
      throw error;
    } finally {
      // Terminating is what actually stops a worker mid-document: an aborted
      // export must not keep producing chunks for a session that is gone.
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
  }

  /**
   * Drives the worker, forwarding each chunk to the sink and acknowledging it
   * only once Rust has accepted it.
   */
  private pump(
    worker: SvgWorkerHandle,
    session: ExportSession,
    snapshot: SvgExportSnapshot,
    scene: CartographicScene,
    signal: AbortSignal,
    onProgress: ExportProgressCallback | undefined,
  ): Promise<SvgPumpOutcome> {
    const { snapshotId } = snapshot;
    return new Promise<SvgPumpOutcome>((resolve, reject) => {
      let settled = false;
      let acceptedChunks = 0;
      let acceptedBytes = 0;

      const settle = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        outcome();
      };

      const onAbort = (): void => {
        worker.postMessage({ type: 'cancel', snapshotId });
        settle(() => reject(abortError()));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
        return;
      }

      worker.onerror = (event: unknown) => {
        settle(() =>
          reject(new Error(`SVG export worker failed: ${String(event)}`)),
        );
      };

      worker.onmessage = (message: MessageEvent<SvgWorkerEvent>) => {
        const event = message.data;
        // A message from a previous operation must never advance this one.
        if (event.snapshotId !== snapshotId || settled) return;

        if (event.type === 'error') {
          settle(() => reject(new Error(event.reason)));
          return;
        }
        if (event.type === 'cancelled') {
          settle(() => reject(abortError()));
          return;
        }
        if (event.type === 'ready-to-commit') {
          settle(() =>
            resolve({
              warnings: event.warnings,
              chunks: acceptedChunks,
              bytes: acceptedBytes,
            }),
          );
          return;
        }

        void this.options.sink
          .append(session, { sequence: event.sequence, text: event.text })
          .then((ack) => {
            if (settled) return;
            acceptedChunks += 1;
            acceptedBytes += ack.acceptedBytes;
            onProgress?.(
              buildProgress(snapshotId, session, acceptedChunks, 'composing'),
            );
            worker.postMessage({
              type: 'ack',
              snapshotId,
              sequence: event.sequence,
            });
          })
          .catch((error: unknown) => {
            worker.postMessage({ type: 'cancel', snapshotId });
            settle(() => reject(error));
          });
      };

      worker.postMessage({
        type: 'serialize',
        snapshotId,
        scene,
        chunkTargetBytes:
          this.options.chunkTargetBytes ?? SVG_CHUNK_TARGET_BYTES,
      });
    });
  }
}

/**
 * Builds a progress payload from accepted chunks only.
 *
 * @remarks
 * `totalUnits` stays at the accepted count and `percent` is deliberately
 * absent: a streaming serializer does not know how many chunks remain, and
 * inventing a denominator would make the bar lie. The UI shows an
 * indeterminate state, which is the truth.
 */
function buildProgress(
  snapshotId: string,
  session: ExportSession,
  acceptedChunks: number,
  phase: ExportProgress['phase'],
): ExportProgress {
  return {
    snapshotId,
    sessionId: session.sessionId,
    mode: 'streaming-svg',
    phase,
    completedUnits: acceptedChunks,
    totalUnits: 0,
  };
}

/** What one completed pump reports back for metrics and warnings. */
interface SvgPumpOutcome {
  readonly warnings: readonly SceneWarning[];
  readonly chunks: number;
  readonly bytes: number;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function abortError(): Error {
  const error = new Error('SVG export was aborted');
  error.name = 'AbortError';
  return error;
}
