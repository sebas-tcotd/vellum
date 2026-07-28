import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePngToRgba } from './png-to-rgba.mjs';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  // CRC is never checked by our decoder (see the ponytail note in
  // png-to-rgba.mjs), so any 4 bytes here round-trip correctly.
  return Buffer.concat([
    length,
    Buffer.from(type, 'ascii'),
    data,
    Buffer.alloc(4),
  ]);
}

function buildPng({
  width,
  height,
  colorType,
  rows,
  interlace = 0,
  bitDepth = 8,
}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(bitDepth, 8);
  ihdr.writeUInt8(colorType, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(interlace, 12);
  const raw = Buffer.concat(rows.map((row) => Buffer.from(row)));
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('decodePngToRgba', () => {
  it('decodes filter type None (0) and Up (2) back to exact RGBA', () => {
    // 2x2 RGBA. Row 0 is stored unfiltered; row 1 is stored with the Up
    // filter, exercising the "use the row above" branch.
    const png = buildPng({
      width: 2,
      height: 2,
      colorType: 6,
      rows: [
        [0, 255, 0, 0, 255, 0, 255, 0, 128],
        [2, 1, 0, 255, 0, 10, 21, 30, 127],
      ],
    });

    const { width, height, pixels } = decodePngToRgba(png);

    expect(width).toBe(2);
    expect(height).toBe(2);
    expect(Array.from(pixels)).toEqual([
      255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 10, 20, 30, 255,
    ]);
  });

  it('decodes the Paeth filter (4) using the row above when there is no left pixel', () => {
    // 1x2 RGBA: width 1 means every "left" byte is out of bounds (0), so the
    // Paeth predictor degenerates to the row above — the branch most likely
    // to hide an off-by-one against the "Up" filter case above.
    const png = buildPng({
      width: 1,
      height: 2,
      colorType: 6,
      rows: [
        [0, 10, 20, 30, 255],
        [4, 5, 5, 246, 0],
      ],
    });

    const { pixels } = decodePngToRgba(png);

    expect(Array.from(pixels)).toEqual([10, 20, 30, 255, 15, 25, 20, 255]);
  });

  it('expands RGB (color type 2) to RGBA with full opacity', () => {
    const png = buildPng({
      width: 1,
      height: 1,
      colorType: 2,
      rows: [[0, 12, 34, 56]],
    });

    const { pixels } = decodePngToRgba(png);

    expect(Array.from(pixels)).toEqual([12, 34, 56, 255]);
  });

  it('rejects what this tool does not claim to support', () => {
    const opaquePixel = buildPng({
      width: 1,
      height: 1,
      colorType: 2,
      rows: [[0, 1, 2, 3]],
    });
    expect(() => decodePngToRgba(Buffer.from('not a png'))).toThrow(
      'signature',
    );
    expect(() =>
      decodePngToRgba(
        buildPng({
          width: 1,
          height: 1,
          colorType: 2,
          rows: [[0, 1, 2, 3]],
          interlace: 1,
        }),
      ),
    ).toThrow('Interlaced');
    expect(() =>
      decodePngToRgba(
        buildPng({
          width: 1,
          height: 1,
          colorType: 2,
          rows: [[0, 1, 2, 3]],
          bitDepth: 16,
        }),
      ),
    ).toThrow('bit depth');
    expect(opaquePixel).toBeInstanceOf(Buffer);
  });
});
