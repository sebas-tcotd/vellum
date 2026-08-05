/// <reference lib="webworker" />
/**
 * Worker shell for SVG serialization.
 *
 * @remarks
 * `architecture.md` Gotcha 10: streaming over IPC does not by itself keep the
 * UI responsive — building the XML on the React thread would freeze it
 * regardless of how the bytes leave. So the whole serialization runs here, on
 * its own thread, separate from both the main thread and the interactive
 * renderer's worker.
 *
 * This file is deliberately nothing but `postMessage` plumbing; the loop it
 * drives lives in `svg-serialization-driver.ts` and is unit-tested without a
 * `Worker`. Nothing on this import graph reaches `document`, `window`,
 * `document.fonts`, MapLibre, React, or Tauri.
 */

import { runSvgSerialization } from './svg-serialization-driver';
import type {
  SvgWorkerCommand,
  SvgWorkerEvent,
  SvgWorkerReply,
} from './svg-worker-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Resolver for the acknowledgement the driver is currently waiting on. */
let pendingAck: ((proceed: boolean) => void) | null = null;
/** Operation currently being serialized; anything else is stale. */
let activeSnapshotId: string | null = null;

function emit(event: SvgWorkerEvent): void {
  scope.postMessage(event);
}

scope.onmessage = (
  message: MessageEvent<SvgWorkerCommand | SvgWorkerReply>,
) => {
  const command = message.data;

  if (command.type === 'cancel') {
    if (command.snapshotId !== activeSnapshotId) return;
    // Releasing the pending ack with `false` unwinds the driver at its next
    // await, so cancellation takes effect between chunks rather than after
    // the whole document has been produced.
    const resolve = pendingAck;
    pendingAck = null;
    activeSnapshotId = null;
    if (resolve) resolve(false);
    else emit({ type: 'cancelled', snapshotId: command.snapshotId });
    return;
  }

  if (command.type === 'ack') {
    if (command.snapshotId !== activeSnapshotId) return;
    const resolve = pendingAck;
    pendingAck = null;
    resolve?.(true);
    return;
  }

  if (command.type !== 'serialize') return;
  if (activeSnapshotId !== null) {
    emit({
      type: 'error',
      snapshotId: command.snapshotId,
      reason: 'another svg serialization is already active',
    });
    return;
  }

  activeSnapshotId = command.snapshotId;
  void runSvgSerialization(command, {
    emit,
    awaitAck: (sequence) =>
      new Promise<boolean>((resolve) => {
        if (activeSnapshotId !== command.snapshotId) {
          resolve(false);
          return;
        }
        void sequence;
        pendingAck = resolve;
      }),
  }).finally(() => {
    if (activeSnapshotId === command.snapshotId) activeSnapshotId = null;
    pendingAck = null;
  });
};
