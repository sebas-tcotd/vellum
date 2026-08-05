import type { PixelRect, RasterTileChunk, SvgTextChunk } from '@vellum/core';

/** ASCII magic identifying a Vellum export wire frame. */
export const EXPORT_FRAME_MAGIC = 'VEXP';
/** Wire format version encoded in every frame header. */
export const EXPORT_FRAME_VERSION = 1;
/** `kind` value for a PNG tile chunk. */
export const EXPORT_FRAME_KIND_PNG_TILE = 1;
/**
 * `kind` value for a UTF-8 SVG text chunk.
 *
 * @remarks
 * Reuses the same fixed 76-byte header rather than adding a second wire
 * layout. A text fragment has no tile or rectangle geometry, so those fields
 * are written as zeroes — and Rust *rejects* a non-zero one, so a frame can
 * never carry raster geometry the SVG writer would quietly discard.
 */
export const EXPORT_FRAME_KIND_SVG_CHUNK = 2;
/** Fixed size in bytes of the v1 header, before the encoded PNG payload. */
export const EXPORT_FRAME_HEADER_BYTES = 76;
/**
 * Whole wire-frame ceiling per AD-10 ("64 MiB máximos pendientes entre
 * frontend e IPC") — the complete frame crossing IPC, header included.
 * Enforced independently of the session's reported `maxChunkBytes` so a
 * misreported ceiling can never build an over-budget frame.
 *
 * Mirrored by `MAX_PENDING_FRAME_BYTES` in
 * `apps/desktop/src-tauri/src/export/session.rs` — no codegen ties the two
 * together, so a change here must be applied there too in the same commit.
 */
export const EXPORT_FRAME_MAX_TOTAL_BYTES = 64 * 1024 * 1024;

const SESSION_ID_BYTES = 16;
const SESSION_ID_HEX_PATTERN = /^[0-9a-f]{32}$/;
const U32_MAX = 0xffffffff;
const MAGIC_BYTES = Uint8Array.from(EXPORT_FRAME_MAGIC, (char) =>
  char.charCodeAt(0),
);

/** Input to {@link encodeExportFrame}. */
export interface ExportFrameInput {
  /** Opaque session id — 32 lowercase hex characters encoding the 16-byte wire token. */
  readonly sessionId: string;
  /** Chunk produced by the exporter and destined for the active session. */
  readonly chunk: RasterTileChunk;
}

/** Result of decoding one wire frame — used by round-trip tests. */
export interface DecodedExportFrame {
  /** Payload discriminator recovered from the header. */
  readonly kind: number;
  /** Session id recovered from the header, re-encoded as 32 lowercase hex characters. */
  readonly sessionId: string;
  /** Strictly increasing chunk sequence. */
  readonly sequence: number;
  /** Tile column. */
  readonly tileX: number;
  /** Tile row. */
  readonly tileY: number;
  /** Useful output rectangle covered by the encoded bytes. */
  readonly usefulRect: PixelRect;
  /** Render rectangle represented by the encoded bytes. */
  readonly renderRect: PixelRect;
  /** Encoded PNG bytes, sliced out of the wire frame. */
  readonly encodedPng: Uint8Array;
}

/**
 * Encodes one raster tile chunk into the fixed 76-byte v1 wire frame Rust parses
 * by explicit offset.
 *
 * @remarks
 * This is anticipatory validation only — Rust remains the security authority and
 * re-validates every field independently. Throws a plain `Error` (not
 * `VellumError`, which is reserved for values that cross the IPC boundary) on any
 * field that would not round-trip through the fixed layout.
 *
 * @param input - Session id and chunk to encode.
 * @param maxChunkBytes - Session-reported ceiling for `chunk.encodedPng.byteLength`.
 * @returns The raw frame bytes, ready to pass directly to `invoke()` as the body.
 */
export function encodeExportFrame(
  input: ExportFrameInput,
  maxChunkBytes: number,
): Uint8Array {
  const sessionIdBytes = decodeSessionIdHex(input.sessionId);
  const { chunk } = input;
  const encodedLength = chunk.encodedPng.byteLength;
  if (encodedLength <= 0) {
    throw new Error('Export frame requires a non-empty encoded payload');
  }
  if (encodedLength > maxChunkBytes) {
    throw new Error(
      `Export frame encoded payload (${encodedLength} bytes) exceeds maxChunkBytes (${maxChunkBytes})`,
    );
  }
  const totalBytes = EXPORT_FRAME_HEADER_BYTES + encodedLength;
  if (totalBytes > EXPORT_FRAME_MAX_TOTAL_BYTES) {
    throw new Error(
      `Export frame total size (${totalBytes} bytes) exceeds the ${EXPORT_FRAME_MAX_TOTAL_BYTES}-byte IPC pending budget`,
    );
  }
  assertSequence(chunk.sequence);
  assertU32(chunk.tileX, 'tileX');
  assertU32(chunk.tileY, 'tileY');
  assertRect(chunk.usefulRect, 'usefulRect');
  assertRect(chunk.renderRect, 'renderRect');

  const buffer = new ArrayBuffer(totalBytes);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes.set(MAGIC_BYTES, 0);
  view.setUint16(4, EXPORT_FRAME_VERSION, true);
  view.setUint8(6, EXPORT_FRAME_KIND_PNG_TILE);
  view.setUint8(7, 0);
  bytes.set(sessionIdBytes, 8);
  view.setBigUint64(24, BigInt(chunk.sequence), true);
  view.setUint32(32, chunk.tileX, true);
  view.setUint32(36, chunk.tileY, true);
  writeRect(view, 40, chunk.usefulRect);
  writeRect(view, 56, chunk.renderRect);
  view.setUint32(72, encodedLength, true);
  bytes.set(chunk.encodedPng, EXPORT_FRAME_HEADER_BYTES);

  return bytes;
}

/**
 * Encodes one SVG text chunk into the same fixed 76-byte v1 wire frame.
 *
 * @remarks
 * Anticipatory validation only — Rust re-validates every field, including that
 * the zeroed raster fields really are zero. The text is encoded as UTF-8 here
 * and never re-encoded downstream, so a chunk's on-wire size is its byte
 * length, not its character count.
 *
 * @param sessionId - Session id as 32 lowercase hex characters.
 * @param chunk - Sequence and XML fragment to encode.
 * @param maxChunkBytes - Session-reported ceiling for the encoded payload.
 * @returns The raw frame bytes, ready to pass directly to `invoke()`.
 */
export function encodeSvgExportFrame(
  sessionId: string,
  chunk: SvgTextChunk,
  maxChunkBytes: number,
): Uint8Array {
  const sessionIdBytes = decodeSessionIdHex(sessionId);
  const payload = new TextEncoder().encode(chunk.text);
  const encodedLength = payload.byteLength;
  if (encodedLength <= 0) {
    throw new Error('Export frame requires a non-empty encoded payload');
  }
  if (encodedLength > maxChunkBytes) {
    throw new Error(
      `Export frame encoded payload (${encodedLength} bytes) exceeds maxChunkBytes (${maxChunkBytes})`,
    );
  }
  const totalBytes = EXPORT_FRAME_HEADER_BYTES + encodedLength;
  if (totalBytes > EXPORT_FRAME_MAX_TOTAL_BYTES) {
    throw new Error(
      `Export frame total size (${totalBytes} bytes) exceeds the ${EXPORT_FRAME_MAX_TOTAL_BYTES}-byte IPC pending budget`,
    );
  }
  assertSequence(chunk.sequence);

  const buffer = new ArrayBuffer(totalBytes);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes.set(MAGIC_BYTES, 0);
  view.setUint16(4, EXPORT_FRAME_VERSION, true);
  view.setUint8(6, EXPORT_FRAME_KIND_SVG_CHUNK);
  view.setUint8(7, 0);
  bytes.set(sessionIdBytes, 8);
  view.setBigUint64(24, BigInt(chunk.sequence), true);
  // Offsets 32..72 (tileX, tileY, usefulRect, renderRect) stay zero — the
  // ArrayBuffer is already zero-filled, and Rust requires exactly that.
  view.setUint32(72, encodedLength, true);
  bytes.set(payload, EXPORT_FRAME_HEADER_BYTES);

  return bytes;
}

/**
 * Decodes and validates one wire frame produced by {@link encodeExportFrame}.
 *
 * @remarks
 * Rust owns the authoritative decode path; this exists so TypeScript tests can
 * prove the encoder round-trips without depending on the Rust binary.
 *
 * @param bytes - Raw frame bytes, as sent to `append_export_chunk`.
 * @returns The decoded frame fields.
 */
export function decodeExportFrame(bytes: Uint8Array): DecodedExportFrame {
  if (bytes.byteLength < EXPORT_FRAME_HEADER_BYTES) {
    throw new Error('Export frame is truncated before the fixed header');
  }
  for (let i = 0; i < MAGIC_BYTES.length; i += 1) {
    if (bytes[i] !== MAGIC_BYTES[i]) {
      throw new Error('Export frame magic mismatch');
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, true);
  if (version !== EXPORT_FRAME_VERSION) {
    throw new Error(`Unsupported export frame version: ${version}`);
  }
  const kind = view.getUint8(6);
  if (
    kind !== EXPORT_FRAME_KIND_PNG_TILE &&
    kind !== EXPORT_FRAME_KIND_SVG_CHUNK
  ) {
    throw new Error(`Unsupported export frame kind: ${kind}`);
  }
  const reserved = view.getUint8(7);
  if (reserved !== 0) {
    throw new Error('Export frame reserved byte must be zero');
  }

  const sessionId = encodeSessionIdHex(bytes.subarray(8, 8 + SESSION_ID_BYTES));
  const sequence = Number(view.getBigUint64(24, true));
  const tileX = view.getUint32(32, true);
  const tileY = view.getUint32(36, true);
  const usefulRect = readRect(view, 40);
  const renderRect = readRect(view, 56);
  const encodedLength = view.getUint32(72, true);

  // Rust rejects an empty payload outright; accepting it here would let a
  // round-trip test pass over a frame the real decoder refuses.
  if (encodedLength === 0) {
    throw new Error('Export frame encoded payload must not be empty');
  }
  const expectedTotal = EXPORT_FRAME_HEADER_BYTES + encodedLength;
  if (bytes.byteLength < expectedTotal) {
    throw new Error('Export frame is truncated after the header');
  }
  if (bytes.byteLength > expectedTotal) {
    throw new Error('Export frame has trailing bytes past its declared length');
  }
  if (
    kind === EXPORT_FRAME_KIND_SVG_CHUNK &&
    (tileX !== 0 ||
      tileY !== 0 ||
      !isZeroRect(usefulRect) ||
      !isZeroRect(renderRect))
  ) {
    throw new Error('Export frame svg chunk must zero every raster field');
  }

  return {
    kind,
    sessionId,
    sequence,
    tileX,
    tileY,
    usefulRect,
    renderRect,
    encodedPng: bytes.slice(EXPORT_FRAME_HEADER_BYTES, expectedTotal),
  };
}

function isZeroRect(rect: PixelRect): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === 0 && rect.height === 0;
}

function writeRect(view: DataView, offset: number, rect: PixelRect): void {
  view.setUint32(offset, rect.x, true);
  view.setUint32(offset + 4, rect.y, true);
  view.setUint32(offset + 8, rect.width, true);
  view.setUint32(offset + 12, rect.height, true);
}

function readRect(view: DataView, offset: number): PixelRect {
  return {
    x: view.getUint32(offset, true),
    y: view.getUint32(offset + 4, true),
    width: view.getUint32(offset + 8, true),
    height: view.getUint32(offset + 12, true),
  };
}

function decodeSessionIdHex(sessionId: string): Uint8Array {
  if (!SESSION_ID_HEX_PATTERN.test(sessionId)) {
    throw new Error(
      'Export session id must be exactly 32 lowercase hex characters',
    );
  }
  const out = new Uint8Array(SESSION_ID_BYTES);
  for (let i = 0; i < SESSION_ID_BYTES; i += 1) {
    out[i] = Number.parseInt(sessionId.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function encodeSessionIdHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function assertSequence(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      'Export frame field "sequence" must be a safe non-negative integer',
    );
  }
}

function assertU32(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > U32_MAX) {
    throw new Error(
      `Export frame field "${label}" must fit in an unsigned 32-bit integer`,
    );
  }
}

function assertRect(rect: PixelRect, label: string): void {
  assertU32(rect.x, `${label}.x`);
  assertU32(rect.y, `${label}.y`);
  assertU32(rect.width, `${label}.width`);
  assertU32(rect.height, `${label}.height`);
  if (rect.width === 0 || rect.height === 0) {
    throw new Error(
      `Export frame rect "${label}" must have positive dimensions`,
    );
  }
}
