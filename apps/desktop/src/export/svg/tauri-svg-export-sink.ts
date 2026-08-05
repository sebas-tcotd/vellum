import { invoke } from '@tauri-apps/api/core';
import {
  IPC_COMMANDS,
  type AppendAck,
  type ExportBeginMetadata,
  type ExportCancelReason,
  type ExportReceipt,
  type ExportSession,
  type SvgExportSink,
  type SvgTextChunk,
} from '@vellum/core';
import { encodeSvgExportFrame } from '../export-frame';

type SvgInvokeArgs = Record<string, unknown> | Uint8Array;
type SvgInvoke = (command: string, args: SvgInvokeArgs) => Promise<unknown>;

interface SvgSessionState {
  readonly session: ExportSession;
  expectedSequence: number;
  inFlight: boolean;
  finished: boolean;
}

/**
 * Carries SVG text chunks through the same transactional session commands the
 * tiled raster route uses.
 *
 * @remarks
 * AD-11 pairs an exporter with a sink by session mode: this one accepts only
 * `streaming-svg`, so it can never be handed raster tiles and `TauriExportSink`
 * can never be handed XML.
 */
export class TauriSvgExportSink implements SvgExportSink {
  private readonly invokeCommand: SvgInvoke;
  private readonly sessions = new Map<string, SvgSessionState>();

  /**
   * Creates a sink backed by Tauri's invoke bridge.
   *
   * @param invokeCommand - Injectable bridge used by unit tests and the desktop root.
   */
  constructor(invokeCommand: SvgInvoke = defaultInvoke) {
    this.invokeCommand = invokeCommand;
  }

  /** Opens one streaming-svg session and records its sequencing state. */
  async begin(metadata: ExportBeginMetadata): Promise<ExportSession> {
    if (metadata.mode !== 'streaming-svg') {
      throw new Error('TauriSvgExportSink only accepts streaming-svg sessions');
    }
    const result = await this.invokeCommand(IPC_COMMANDS.BEGIN_EXPORT, {
      metadata,
    });
    const session = asSvgSession(result);
    this.sessions.set(session.sessionId, {
      session,
      expectedSequence: 0,
      inFlight: false,
      finished: false,
    });
    return session;
  }

  /** Encodes and appends one XML fragment; enforces maxInFlight = 1. */
  async append(
    session: ExportSession,
    chunk: SvgTextChunk,
  ): Promise<AppendAck> {
    const state = this.requireSession(session);
    if (state.inFlight) {
      throw new Error(
        'TauriSvgExportSink allows only one chunk in flight (maxInFlight = 1)',
      );
    }
    if (chunk.sequence !== state.expectedSequence) {
      throw new Error(
        `TauriSvgExportSink expected sequence ${state.expectedSequence}, received ${chunk.sequence}`,
      );
    }
    const frame = encodeSvgExportFrame(
      session.sessionId,
      chunk,
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
          'TauriSvgExportSink received an ack for a different session or sequence',
        );
      }
      state.expectedSequence += 1;
      return ack;
    } finally {
      state.inFlight = false;
    }
  }

  /**
   * Requests the atomic publish. The local session is forgotten only once the
   * outcome is known — on failure after best-effort cancelling the Rust
   * session, so its `.part` never lingers unattended.
   */
  async finish(session: ExportSession): Promise<ExportReceipt> {
    const state = this.requireSession(session);
    if (state.finished) {
      throw new Error('TauriSvgExportSink session has already finished');
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
        // Cleanup failed too — keep the local session so a caller can retry
        // cancel(). Worst case the startup sweep reclaims the `.part`.
      }
      throw error;
    }
  }

  /** Forgets the local session and asks Rust to clean up; safe to repeat. */
  async cancel(
    session: ExportSession,
    _reason: ExportCancelReason,
  ): Promise<void> {
    this.sessions.delete(session.sessionId);
    await this.invokeCommand(IPC_COMMANDS.CANCEL_EXPORT, {
      sessionId: session.sessionId,
    });
  }

  private requireSession(session: ExportSession): SvgSessionState {
    const state = this.sessions.get(session.sessionId);
    if (!state || state.session.mode !== session.mode) {
      throw new Error('SVG export session is no longer active');
    }
    return state;
  }
}

function defaultInvoke(command: string, args: SvgInvokeArgs): Promise<unknown> {
  return invoke(command, args);
}

function asSvgSession(value: unknown): ExportSession {
  if (typeof value !== 'object' || value === null) {
    throw new Error('begin_export returned an invalid session');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.sessionId !== 'string' ||
    record.mode !== 'streaming-svg' ||
    typeof record.maxChunkBytes !== 'number' ||
    record.maxInFlight !== 1
  ) {
    throw new Error('begin_export returned an invalid session');
  }
  return {
    sessionId: record.sessionId,
    mode: 'streaming-svg',
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
