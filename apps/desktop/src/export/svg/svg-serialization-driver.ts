/**
 * The ACK-gated serialization loop, extracted from the worker shell.
 *
 * @remarks
 * Lives apart from `svg-export-worker.ts` so it can be unit-tested without a
 * `Worker` at all: the worker file is then only `onmessage` plumbing. Emits at
 * most one chunk before waiting for an acknowledgement, which is what keeps
 * `maxInFlight = 1` true all the way from the serializer to Rust rather than
 * only at the IPC edge.
 */

import { serializeSceneToSvg } from './svg-serializer';
import type { SvgWorkerEvent, SvgWorkerRequest } from './svg-worker-protocol';

/** Ports the driver needs, so tests can supply plain functions. */
export interface SvgSerializationPorts {
  /** Delivers one event to the exporter. */
  readonly emit: (event: SvgWorkerEvent) => void;
  /**
   * Resolves once the last emitted chunk was acknowledged.
   *
   * @returns `true` to continue, `false` when the operation was cancelled.
   */
  readonly awaitAck: (sequence: number) => Promise<boolean>;
}

/**
 * Serializes one scene, emitting chunks under back-pressure.
 *
 * @param request - The scene and chunk budget to serialize.
 * @param ports - Emission and acknowledgement callbacks.
 */
export async function runSvgSerialization(
  request: SvgWorkerRequest,
  ports: SvgSerializationPorts,
): Promise<void> {
  const { snapshotId, scene, chunkTargetBytes } = request;
  let sequence = 0;
  try {
    for (const text of serializeSceneToSvg(scene, chunkTargetBytes)) {
      // One chunk in flight at a time: nothing is emitted until Rust has
      // accepted the previous one, so `maxInFlight = 1` holds inside the
      // worker rather than only at the IPC edge.
      ports.emit({ type: 'chunk', snapshotId, sequence, text });
      const proceed = await ports.awaitAck(sequence);
      if (!proceed) {
        ports.emit({ type: 'cancelled', snapshotId });
        return;
      }
      sequence += 1;
    }
    ports.emit({
      type: 'ready-to-commit',
      snapshotId,
      totalChunks: sequence,
      warnings: scene.warnings,
    });
  } catch (error: unknown) {
    ports.emit({
      type: 'error',
      snapshotId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
