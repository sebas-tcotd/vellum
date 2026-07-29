#!/usr/bin/env node

/**
 * Decodes a PNG exported by the app, printing the `dimensions`/`sha256` the
 * 6.2A golden manifest needs when accepting a case. Deliberately dependency-
 * free — this decoder (`decodePngToRgba`) is also imported directly by
 * `harness.mjs`, which decodes the committed `.png` on demand rather than
 * reading a persisted RGBA sidecar (that sidecar used to be written to disk
 * here too, but nothing reads it any more — for 36 cases across two fixtures
 * that was over 1 GiB nobody needed committed to the repo).
 *
 * Supports the 8-bit, non-interlaced subset (grayscale, RGB, grayscale+alpha,
 * RGBA) that `canvas.toBlob('image/png')` always produces in every browser —
 * this is not a general-purpose PNG decoder.
 *
 * Usage:
 *   node png-to-rgba.mjs golden.png
 *   → prints { dimensions, sha256 }, the values to paste into manifest.json
 */

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** Decodes PNG bytes into `{ width, height, pixels }`, always as RGBA. */
export function decodePngToRgba(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Not a PNG file (bad signature)');
  }
  let offset = 8;
  let header = null;
  const idatChunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    // ponytail: CRC is skipped, not verified — this is a local dev tool for
    // goldens we just exported ourselves, not a parser for adversarial input.
    offset += 8 + length + 4;
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data.readUInt8(8),
        colorType: data.readUInt8(9),
        interlace: data.readUInt8(12),
      };
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!header) throw new Error('Missing IHDR chunk');
  if (header.bitDepth !== 8) {
    throw new Error(`Unsupported bit depth: ${header.bitDepth} (need 8-bit)`);
  }
  if (header.interlace !== 0) {
    throw new Error('Interlaced PNGs are not supported');
  }
  const channels = CHANNELS_BY_COLOR_TYPE[header.colorType];
  if (!channels) {
    throw new Error(`Unsupported color type: ${header.colorType}`);
  }

  const { width, height } = header;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(width * height * 4);
  const previousRow = new Uint8Array(stride);
  const currentRow = new Uint8Array(stride);

  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const filtered = raw[rawOffset + x];
      const left = x >= channels ? currentRow[x - channels] : 0;
      const above = previousRow[x];
      const aboveLeft = x >= channels ? previousRow[x - channels] : 0;
      currentRow[x] = unfilterByte(
        filterType,
        filtered,
        left,
        above,
        aboveLeft,
      );
    }
    rawOffset += stride;
    writeRowAsRgba(pixels, y, width, channels, currentRow);
    previousRow.set(currentRow);
  }
  return { width, height, pixels };
}

function unfilterByte(filterType, filtered, left, above, aboveLeft) {
  switch (filterType) {
    case 0:
      return filtered;
    case 1:
      return (filtered + left) & 0xff;
    case 2:
      return (filtered + above) & 0xff;
    case 3:
      return (filtered + ((left + above) >> 1)) & 0xff;
    case 4:
      return (filtered + paethPredictor(left, above, aboveLeft)) & 0xff;
    default:
      throw new Error(`Unsupported scanline filter type: ${filterType}`);
  }
}

function paethPredictor(left, above, aboveLeft) {
  const estimate = left + above - aboveLeft;
  const distanceToLeft = Math.abs(estimate - left);
  const distanceToAbove = Math.abs(estimate - above);
  const distanceToAboveLeft = Math.abs(estimate - aboveLeft);
  if (
    distanceToLeft <= distanceToAbove &&
    distanceToLeft <= distanceToAboveLeft
  ) {
    return left;
  }
  return distanceToAbove <= distanceToAboveLeft ? above : aboveLeft;
}

function writeRowAsRgba(pixels, y, width, channels, row) {
  const rowStart = y * width * 4;
  for (let x = 0; x < width; x += 1) {
    const src = x * channels;
    const dst = rowStart + x * 4;
    if (channels === 4) {
      pixels.set(row.subarray(src, src + 4), dst);
    } else if (channels === 3) {
      pixels.set(row.subarray(src, src + 3), dst);
      pixels[dst + 3] = 255;
    } else if (channels === 2) {
      pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = row[src];
      pixels[dst + 3] = row[src + 1];
    } else {
      pixels[dst] = pixels[dst + 1] = pixels[dst + 2] = row[src];
      pixels[dst + 3] = 255;
    }
  }
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node png-to-rgba.mjs <golden.png>');
    process.exitCode = 1;
    return;
  }
  const buffer = await readFile(inputPath);
  const { width, height, pixels } = decodePngToRgba(buffer);
  console.log(
    JSON.stringify(
      {
        dimensions: { width, height },
        sha256: createHash('sha256').update(pixels).digest('hex'),
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
