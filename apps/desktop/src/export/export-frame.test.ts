import type { RasterTileChunk } from '@vellum/core';
import { describe, expect, it } from 'vitest';
import {
  decodeExportFrame,
  encodeExportFrame,
  EXPORT_FRAME_HEADER_BYTES,
  EXPORT_FRAME_MAX_TOTAL_BYTES,
} from './export-frame';

const SESSION_ID = '0102030405060708090a0b0c0d0e0f10';
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

const chunk: RasterTileChunk = {
  sequence: 5,
  tileX: 2,
  tileY: 3,
  usefulRect: { x: 0, y: 0, width: 100, height: 50 },
  renderRect: { x: 0, y: 0, width: 110, height: 60 },
  encodedPng: new Uint8Array([0xaa, 0xbb, 0xcc]),
};

// Hand-derived from the spec (offset table in the story), independent of the
// encoder implementation — this is the cross-language layout contract that the
// Rust-side fixture in `framing.rs` must also reproduce byte-for-byte.
const EXPECTED_FRAME = Uint8Array.from([
  0x56,
  0x45,
  0x58,
  0x50, // magic "VEXP"
  0x01,
  0x00, // version = 1 (u16 LE)
  0x01, // kind = 1 (PNG tile)
  0x00, // reserved = 0
  0x01,
  0x02,
  0x03,
  0x04,
  0x05,
  0x06,
  0x07,
  0x08,
  0x09,
  0x0a,
  0x0b,
  0x0c,
  0x0d,
  0x0e,
  0x0f,
  0x10, // sessionId (16 bytes)
  0x05,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00, // sequence = 5 (u64 LE)
  0x02,
  0x00,
  0x00,
  0x00, // tileX = 2 (u32 LE)
  0x03,
  0x00,
  0x00,
  0x00, // tileY = 3 (u32 LE)
  0x00,
  0x00,
  0x00,
  0x00, // usefulRect.x = 0
  0x00,
  0x00,
  0x00,
  0x00, // usefulRect.y = 0
  0x64,
  0x00,
  0x00,
  0x00, // usefulRect.width = 100
  0x32,
  0x00,
  0x00,
  0x00, // usefulRect.height = 50
  0x00,
  0x00,
  0x00,
  0x00, // renderRect.x = 0
  0x00,
  0x00,
  0x00,
  0x00, // renderRect.y = 0
  0x6e,
  0x00,
  0x00,
  0x00, // renderRect.width = 110
  0x3c,
  0x00,
  0x00,
  0x00, // renderRect.height = 60
  0x03,
  0x00,
  0x00,
  0x00, // encodedLength = 3 (u32 LE)
  0xaa,
  0xbb,
  0xcc, // PNG payload
]);

describe('encodeExportFrame', () => {
  it('produce el vector fijo de 76+N bytes little-endian', () => {
    const frame = encodeExportFrame(
      { sessionId: SESSION_ID, chunk },
      MAX_CHUNK_BYTES,
    );
    expect(frame).toEqual(EXPECTED_FRAME);
    expect(frame.byteLength).toBe(EXPORT_FRAME_HEADER_BYTES + 3);
  });

  it('rechaza un chunk que excede maxChunkBytes', () => {
    expect(() =>
      encodeExportFrame({ sessionId: SESSION_ID, chunk }, 2),
    ).toThrow('maxChunkBytes');
  });

  it('rechaza un frame que excede el presupuesto de 64 MiB aunque maxChunkBytes lo permita', () => {
    const oversizedChunk = {
      ...chunk,
      // One byte over what the 76-byte header leaves inside the 64 MiB IPC
      // pending budget — the total-frame check must catch this even though
      // maxChunkBytes below is deliberately set far above it.
      encodedPng: new Uint8Array(
        EXPORT_FRAME_MAX_TOTAL_BYTES - EXPORT_FRAME_HEADER_BYTES + 1,
      ),
    };
    expect(() =>
      encodeExportFrame(
        { sessionId: SESSION_ID, chunk: oversizedChunk },
        Number.MAX_SAFE_INTEGER,
      ),
    ).toThrow('IPC pending budget');
  });

  it('rechaza un id de sesión que no es hex de 32 caracteres', () => {
    expect(() =>
      encodeExportFrame({ sessionId: 'not-hex', chunk }, MAX_CHUNK_BYTES),
    ).toThrow('32 lowercase hex');
  });

  it('rechaza rectángulos con dimensión cero o negativa', () => {
    expect(() =>
      encodeExportFrame(
        {
          sessionId: SESSION_ID,
          chunk: { ...chunk, usefulRect: { x: 0, y: 0, width: 0, height: 50 } },
        },
        MAX_CHUNK_BYTES,
      ),
    ).toThrow('positive dimensions');
  });

  it('rechaza enteros fuera de rango u32', () => {
    expect(() =>
      encodeExportFrame(
        { ...{ sessionId: SESSION_ID }, chunk: { ...chunk, tileX: -1 } },
        MAX_CHUNK_BYTES,
      ),
    ).toThrow('tileX');
    expect(() =>
      encodeExportFrame(
        { sessionId: SESSION_ID, chunk: { ...chunk, tileY: 2 ** 32 } },
        MAX_CHUNK_BYTES,
      ),
    ).toThrow('tileY');
  });

  it('rechaza un payload PNG vacío', () => {
    expect(() =>
      encodeExportFrame(
        {
          sessionId: SESSION_ID,
          chunk: { ...chunk, encodedPng: new Uint8Array() },
        },
        MAX_CHUNK_BYTES,
      ),
    ).toThrow('non-empty');
  });
});

describe('decodeExportFrame', () => {
  it('hace round-trip exacto con encodeExportFrame', () => {
    const frame = encodeExportFrame(
      { sessionId: SESSION_ID, chunk },
      MAX_CHUNK_BYTES,
    );
    const decoded = decodeExportFrame(frame);
    expect(decoded).toEqual({
      sessionId: SESSION_ID,
      sequence: chunk.sequence,
      tileX: chunk.tileX,
      tileY: chunk.tileY,
      usefulRect: chunk.usefulRect,
      renderRect: chunk.renderRect,
      encodedPng: chunk.encodedPng,
    });
  });

  it('decodifica el vector fijo esperado', () => {
    expect(decodeExportFrame(EXPECTED_FRAME)).toEqual({
      sessionId: SESSION_ID,
      sequence: 5,
      tileX: 2,
      tileY: 3,
      usefulRect: { x: 0, y: 0, width: 100, height: 50 },
      renderRect: { x: 0, y: 0, width: 110, height: 60 },
      encodedPng: Uint8Array.from([0xaa, 0xbb, 0xcc]),
    });
  });

  it('rechaza magic incorrecto', () => {
    const bad = EXPECTED_FRAME.slice();
    bad[0] = 0x00;
    expect(() => decodeExportFrame(bad)).toThrow('magic');
  });

  it('rechaza version desconocida', () => {
    const bad = EXPECTED_FRAME.slice();
    bad[4] = 0x02;
    expect(() => decodeExportFrame(bad)).toThrow('version');
  });

  it('rechaza kind desconocido', () => {
    const bad = EXPECTED_FRAME.slice();
    bad[6] = 0x02;
    expect(() => decodeExportFrame(bad)).toThrow('kind');
  });

  it('rechaza reserved distinto de cero', () => {
    const bad = EXPECTED_FRAME.slice();
    bad[7] = 0x01;
    expect(() => decodeExportFrame(bad)).toThrow('reserved');
  });

  it('rechaza un frame truncado', () => {
    expect(() => decodeExportFrame(EXPECTED_FRAME.slice(0, 78))).toThrow(
      'truncated',
    );
    expect(() => decodeExportFrame(EXPECTED_FRAME.slice(0, 10))).toThrow(
      'truncated',
    );
  });

  it('rechaza bytes sobrantes tras el payload declarado', () => {
    const withTrailing = new Uint8Array(EXPECTED_FRAME.length + 1);
    withTrailing.set(EXPECTED_FRAME, 0);
    withTrailing[EXPECTED_FRAME.length] = 0xff;
    expect(() => decodeExportFrame(withTrailing)).toThrow('trailing bytes');
  });

  it('nunca usa Base64 ni number[] — el frame es binario puro', () => {
    const frame = encodeExportFrame(
      { sessionId: SESSION_ID, chunk },
      MAX_CHUNK_BYTES,
    );
    expect(frame).toBeInstanceOf(Uint8Array);
    expect(Array.isArray(frame)).toBe(false);
  });
});
