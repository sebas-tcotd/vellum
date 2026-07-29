import { invoke } from '@tauri-apps/api/core';
import {
  IPC_COMMANDS,
  type AppendAck,
  type ExportBeginMetadata,
  type ExportCancelReason,
  type ExportPngOptions,
  type ExportReceipt,
  type ExportResult,
  type ExportSession,
  type ExportSink,
  type RasterTileChunk,
} from '@vellum/core';

const MAX_LEGACY_CHUNK_BYTES = 256 * 1024 * 1024;
type LegacyInvoke = (
  command: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

interface LegacySessionState {
  readonly session: ExportSession;
  readonly metadata: ExportBeginMetadata;
  chunk: RasterTileChunk | null;
}

let sessionSequence = 0;

/** In-memory sink that adapts one complete PNG to the unchanged `export_png` IPC. */
export class LegacyExportSink implements ExportSink {
  private readonly invokeCommand: LegacyInvoke;
  private readonly sessions = new Map<string, LegacySessionState>();

  /**
   * Creates a sink backed by Tauri's invoke bridge.
   *
   * @param invokeCommand - Injectable bridge used by unit tests and the desktop root.
   */
  constructor(invokeCommand: LegacyInvoke = defaultInvoke) {
    this.invokeCommand = invokeCommand;
  }

  /** Opens one legacy-only in-memory session. */
  async begin(metadata: ExportBeginMetadata): Promise<ExportSession> {
    validateBeginMetadata(metadata);
    if (metadata.mode !== 'legacy-png') {
      throw new Error('LegacyExportSink only accepts legacy-png sessions');
    }
    const session: ExportSession = {
      sessionId: makeSessionId(),
      mode: metadata.mode,
      maxChunkBytes: MAX_LEGACY_CHUNK_BYTES,
      maxInFlight: 1,
    };
    this.sessions.set(session.sessionId, { session, metadata, chunk: null });
    return session;
  }

  /** Accepts the single PNG chunk representing the complete output. */
  async append(
    session: ExportSession,
    chunk: RasterTileChunk,
  ): Promise<AppendAck> {
    const state = this.requireSession(session);
    if (state.chunk !== null || !isCompleteLegacyChunk(state, chunk)) {
      throw new Error('Legacy sink accepts exactly one complete PNG chunk');
    }
    if (chunk.encodedPng.byteLength > session.maxChunkBytes) {
      throw new Error('Legacy PNG chunk exceeds its byte limit');
    }
    state.chunk = chunk;
    return {
      sessionId: session.sessionId,
      sequence: chunk.sequence,
      acceptedBytes: chunk.encodedPng.byteLength,
      completedUnits: 1,
    };
  }

  /** Invokes the unchanged Rust command only after the complete chunk exists. */
  async finish(session: ExportSession): Promise<ExportReceipt> {
    const state = this.requireSession(session);
    if (!state.chunk) {
      throw new Error('Legacy PNG session cannot finish before append');
    }
    this.sessions.delete(session.sessionId);
    const payload: ExportPngOptions = {
      format: state.metadata.request.format,
      area: state.metadata.request.area,
      background: state.metadata.request.background,
      fileName: state.metadata.request.fileName,
      pngBytes: Array.from(state.chunk.encodedPng),
    };
    const result = await this.invokeCommand(IPC_COMMANDS.EXPORT_PNG, {
      options: payload,
    });
    if (!isExportResult(result)) {
      throw new Error('Legacy PNG IPC returned an invalid receipt');
    }
    return result;
  }

  /** Drops the in-memory session without invoking Rust or publishing a file. */
  async cancel(
    session: ExportSession,
    _reason: ExportCancelReason,
  ): Promise<void> {
    this.sessions.delete(session.sessionId);
  }

  private requireSession(session: ExportSession): LegacySessionState {
    const state = this.sessions.get(session.sessionId);
    if (!state || state.session.mode !== session.mode) {
      throw new Error('Legacy PNG session is no longer active');
    }
    return state;
  }
}

function defaultInvoke(
  command: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return invoke(command, args);
}

function validateBeginMetadata(metadata: ExportBeginMetadata): void {
  if (metadata.expectedTiles !== 1) {
    throw new Error('Legacy PNG sessions require exactly one chunk');
  }
  if (
    !Number.isSafeInteger(metadata.outputWidth) ||
    !Number.isSafeInteger(metadata.outputHeight) ||
    metadata.outputWidth <= 0 ||
    metadata.outputHeight <= 0
  ) {
    throw new Error('Legacy PNG sessions require positive output dimensions');
  }
}

function isCompleteLegacyChunk(
  state: LegacySessionState,
  chunk: RasterTileChunk,
): boolean {
  const { outputWidth, outputHeight } = state.metadata;
  return (
    chunk.sequence === 0 &&
    chunk.tileX === 0 &&
    chunk.tileY === 0 &&
    chunk.encodedPng.byteLength > 0 &&
    matchesRect(chunk.usefulRect, outputWidth, outputHeight) &&
    matchesRect(chunk.renderRect, outputWidth, outputHeight)
  );
}

function matchesRect(
  rect: RasterTileChunk['usefulRect'],
  width: number,
  height: number,
): boolean {
  return (
    rect.x === 0 &&
    rect.y === 0 &&
    rect.width === width &&
    rect.height === height
  );
}

function isExportResult(value: unknown): value is ExportResult {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.filePath === 'string' && typeof record.folderPath === 'string'
  );
}

function makeSessionId(): string {
  sessionSequence += 1;
  const uuid = globalThis.crypto?.randomUUID?.();
  return `legacy-${sessionSequence}-${uuid ?? Math.random().toString(16).slice(2)}`;
}
