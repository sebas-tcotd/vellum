import { invoke } from '@tauri-apps/api/core';
import {
  IPC_COMMANDS,
  type AppendAck,
  type ExportBeginMetadata,
  type ExportCancelReason,
  type ExportReceipt,
  type ExportSession,
  type ExportSink,
  type RasterTileChunk,
} from '@vellum/core';
import { encodeExportFrame } from './export-frame';

type TiledInvokeArgs = Record<string, unknown> | Uint8Array;
type TiledInvoke = (command: string, args: TiledInvokeArgs) => Promise<unknown>;

interface TiledSessionState {
  readonly session: ExportSession;
  expectedSequence: number;
  inFlight: boolean;
  finished: boolean;
}

/**
 * Sink that carries tiled PNG chunks through the binary transactional session
 * (`begin_export` / `append_export_chunk` / `finish_export` / `cancel_export`).
 *
 * @remarks
 * Not wired into {@link ExportCoordinator} yet — legacy remains the only active
 * route. This sink exists so the tiled exporters landing in 6.2D–6.2F have a
 * transactional persistence port to target.
 */
export class TauriExportSink implements ExportSink {
  private readonly invokeCommand: TiledInvoke;
  private readonly sessions = new Map<string, TiledSessionState>();

  /**
   * Creates a sink backed by Tauri's invoke bridge.
   *
   * @param invokeCommand - Injectable bridge used by unit tests and the desktop root.
   */
  constructor(invokeCommand: TiledInvoke = defaultInvoke) {
    this.invokeCommand = invokeCommand;
  }

  /** Opens one tiled-png session and records its client-side sequencing state. */
  async begin(metadata: ExportBeginMetadata): Promise<ExportSession> {
    if (metadata.mode !== 'tiled-png') {
      throw new Error('TauriExportSink only accepts tiled-png sessions');
    }
    const result = await this.invokeCommand(IPC_COMMANDS.BEGIN_EXPORT, {
      metadata,
    });
    const session = asExportSession(result);
    this.sessions.set(session.sessionId, {
      session,
      expectedSequence: 0,
      inFlight: false,
      finished: false,
    });
    return session;
  }

  /** Encodes and appends one chunk as a raw binary frame; enforces maxInFlight = 1. */
  async append(
    session: ExportSession,
    chunk: RasterTileChunk,
  ): Promise<AppendAck> {
    const state = this.requireSession(session);
    if (state.inFlight) {
      throw new Error(
        'TauriExportSink allows only one chunk in flight (maxInFlight = 1)',
      );
    }
    if (chunk.sequence !== state.expectedSequence) {
      throw new Error(
        `TauriExportSink expected sequence ${state.expectedSequence}, received ${chunk.sequence}`,
      );
    }
    const frame = encodeExportFrame(
      { sessionId: session.sessionId, chunk },
      session.maxChunkBytes,
    );
    state.inFlight = true;
    try {
      const result = await this.invokeCommand(
        IPC_COMMANDS.APPEND_EXPORT_CHUNK,
        frame,
      );
      const ack = asAppendAck(result);
      if (
        ack.sessionId !== session.sessionId ||
        ack.sequence !== chunk.sequence
      ) {
        throw new Error(
          'TauriExportSink received an ack for a different session or sequence',
        );
      }
      state.expectedSequence += 1;
      return ack;
    } finally {
      state.inFlight = false;
    }
  }

  /**
   * Requests the atomic publish. The local session is only forgotten once the
   * outcome is confirmed — on success, or on failure after best-effort
   * cancelling the Rust session so its `.part` file never lingers unattended.
   */
  async finish(session: ExportSession): Promise<ExportReceipt> {
    const state = this.requireSession(session);
    if (state.finished) {
      throw new Error('TauriExportSink session has already finished');
    }
    state.finished = true;
    try {
      const result = await this.invokeCommand(IPC_COMMANDS.FINISH_EXPORT, {
        sessionId: session.sessionId,
      });
      this.sessions.delete(session.sessionId);
      return asExportReceipt(result);
    } catch (error) {
      try {
        await this.invokeCommand(IPC_COMMANDS.CANCEL_EXPORT, {
          sessionId: session.sessionId,
        });
        this.sessions.delete(session.sessionId);
      } catch {
        // Best-effort cleanup failed too — keep the local session rather
        // than forgetting it outright, so a caller can still retry cancel()
        // instead of losing track of it. Worst case, the startup sweep
        // reclaims the orphaned `.part` on next launch.
      }
      throw error;
    }
  }

  /** Forgets the local session and asks Rust to clean up; safe to call repeatedly. */
  async cancel(
    session: ExportSession,
    _reason: ExportCancelReason,
  ): Promise<void> {
    this.sessions.delete(session.sessionId);
    await this.invokeCommand(IPC_COMMANDS.CANCEL_EXPORT, {
      sessionId: session.sessionId,
    });
  }

  private requireSession(session: ExportSession): TiledSessionState {
    const state = this.sessions.get(session.sessionId);
    if (!state || state.session.mode !== session.mode) {
      throw new Error('Tiled export session is no longer active');
    }
    return state;
  }
}

function defaultInvoke(
  command: string,
  args: TiledInvokeArgs,
): Promise<unknown> {
  return invoke(command, args);
}

function asExportSession(value: unknown): ExportSession {
  if (typeof value !== 'object' || value === null) {
    throw new Error('begin_export returned an invalid session');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.sessionId !== 'string' ||
    record.mode !== 'tiled-png' ||
    typeof record.maxChunkBytes !== 'number' ||
    record.maxInFlight !== 1
  ) {
    throw new Error('begin_export returned an invalid session');
  }
  return {
    sessionId: record.sessionId,
    mode: 'tiled-png',
    maxChunkBytes: record.maxChunkBytes,
    maxInFlight: 1,
  };
}

function asAppendAck(value: unknown): AppendAck {
  if (typeof value !== 'object' || value === null) {
    throw new Error('append_export_chunk returned an invalid ack');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.sessionId !== 'string' ||
    typeof record.sequence !== 'number' ||
    typeof record.acceptedBytes !== 'number' ||
    typeof record.completedUnits !== 'number'
  ) {
    throw new Error('append_export_chunk returned an invalid ack');
  }
  return {
    sessionId: record.sessionId,
    sequence: record.sequence,
    acceptedBytes: record.acceptedBytes,
    completedUnits: record.completedUnits,
  };
}

function asExportReceipt(value: unknown): ExportReceipt {
  if (typeof value !== 'object' || value === null) {
    throw new Error('finish_export returned an invalid receipt');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.filePath !== 'string' ||
    typeof record.folderPath !== 'string'
  ) {
    throw new Error('finish_export returned an invalid receipt');
  }
  return { filePath: record.filePath, folderPath: record.folderPath };
}
