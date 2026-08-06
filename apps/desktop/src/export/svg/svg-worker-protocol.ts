/**
 * Discriminated message protocol between the SVG exporter and its worker.
 *
 * @remarks
 * Types only — imported by both sides so neither can send a message the other
 * does not handle. Nothing here touches the DOM, Tauri, or `renderer-webgl`.
 */

import type { CartographicScene, SceneWarning } from '@vellum/core';

/** Work handed to the worker; every field must survive `structuredClone`. */
export interface SvgWorkerRequest {
  /** Discriminator. */
  readonly type: 'serialize';
  /** Correlates every reply with the operation that asked for it. */
  readonly snapshotId: string;
  /** The scene to serialize. */
  readonly scene: CartographicScene;
  /** Soft ceiling for one emitted chunk. */
  readonly chunkTargetBytes: number;
}

/** Tells the worker to stop and emit nothing further. */
export interface SvgWorkerCancel {
  /** Discriminator. */
  readonly type: 'cancel';
  /** Operation to abandon. */
  readonly snapshotId: string;
}

/** Every message the exporter may send to the worker. */
export type SvgWorkerCommand = SvgWorkerRequest | SvgWorkerCancel;

/** One serialized fragment, awaiting an acknowledgement before the next. */
export interface SvgWorkerChunk {
  /** Discriminator. */
  readonly type: 'chunk';
  /** Operation this chunk belongs to. */
  readonly snapshotId: string;
  /** Strictly increasing sequence, beginning at zero. */
  readonly sequence: number;
  /** XML fragment. */
  readonly text: string;
}

/**
 * The document is complete and every chunk has been emitted.
 *
 * @remarks
 * Named for what it is: the serializer's assertion that a commit is now
 * *permissible*, not that one happened. The sink still has to publish, and
 * only its receipt means a file exists.
 */
export interface SvgWorkerReadyToCommit {
  /** Discriminator. */
  readonly type: 'ready-to-commit';
  /** Operation that finished serializing. */
  readonly snapshotId: string;
  /** Total chunks emitted. */
  readonly totalChunks: number;
  /** Aggregated fallbacks the scene recorded. */
  readonly warnings: readonly SceneWarning[];
}

/** Serialization failed; nothing may be published. */
export interface SvgWorkerError {
  /** Discriminator. */
  readonly type: 'error';
  /** Operation that failed. */
  readonly snapshotId: string;
  /** Technical message for logs — never shown to a user. */
  readonly reason: string;
}

/** Serialization stopped because the exporter cancelled it. */
export interface SvgWorkerCancelled {
  /** Discriminator. */
  readonly type: 'cancelled';
  /** Operation that was abandoned. */
  readonly snapshotId: string;
}

/** Every message the worker may send back. */
export type SvgWorkerEvent =
  | SvgWorkerChunk
  | SvgWorkerReadyToCommit
  | SvgWorkerError
  | SvgWorkerCancelled;

/** Acknowledgement gating the next chunk, enforcing `maxInFlight = 1`. */
export interface SvgWorkerAck {
  /** Discriminator. */
  readonly type: 'ack';
  /** Operation the acknowledged chunk belonged to. */
  readonly snapshotId: string;
  /** Sequence the sink accepted. */
  readonly sequence: number;
}

/** Every message the exporter may send once serialization is running. */
export type SvgWorkerReply = SvgWorkerAck | SvgWorkerCancel;
