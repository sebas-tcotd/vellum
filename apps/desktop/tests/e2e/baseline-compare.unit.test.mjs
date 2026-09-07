/**
 * Pins the baseline policy rows of the story's edge-case matrix.
 *
 * @remarks
 * Deliberately driver-free: it builds synthetic PNGs instead of screenshots,
 * so it runs on every developer machine — including macOS, where
 * `tauri-driver` cannot run at all. Without it, "never autogenerates a
 * baseline" would be a claim no test on this repository ever checks.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decodePngToRgba } from '../../../../packages/renderer-webgl/test/export-goldens/png-to-rgba.mjs';
import { compareAgainstBaseline } from './baseline-compare.mjs';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  // The decoder never verifies CRC, so any four bytes round-trip correctly.
  return Buffer.concat([
    length,
    Buffer.from(type, 'ascii'),
    data,
    Buffer.alloc(4),
  ]);
}

/** Builds a solid `width` x `height` RGBA PNG, filter type None. */
function solidPng(width, height, [r, g, b, a]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      row.set([r, g, b, a], 1 + x * 4);
    }
    rows.push(row);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function capture(png) {
  return { ...decodePngToRgba(png), bytes: png };
}

let dir;
let baselinePath;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vellum-baseline-'));
  baselinePath = join(dir, 'shell-linux.png');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const OPTIONS = { maxDifferentPixelRatio: 0.005 };

describe('baseline policy', () => {
  it('passes when the capture is within the channel delta', async () => {
    await writeFile(baselinePath, solidPng(4, 4, [100, 100, 100, 255]));
    // Delta of 2 is the inclusive limit the goldens version.
    const drifted = capture(solidPng(4, 4, [102, 100, 100, 255]));

    await expect(
      compareAgainstBaseline({ capture: drifted, baselinePath, ...OPTIONS }),
    ).resolves.toBeUndefined();
    expect(existsSync(baselinePath.replace('.png', '.actual.png'))).toBe(false);
  });

  it('fails and writes the capture when the delta exceeds the threshold', async () => {
    await writeFile(baselinePath, solidPng(4, 4, [100, 100, 100, 255]));
    const changed = capture(solidPng(4, 4, [200, 100, 100, 255]));

    await expect(
      compareAgainstBaseline({ capture: changed, baselinePath, ...OPTIONS }),
    ).rejects.toThrow(/differs from/);

    const actualPath = baselinePath.replace('.png', '.actual.png');
    expect(await readFile(actualPath)).toEqual(changed.bytes);
  });

  it('fails and writes the capture when the dimensions changed', async () => {
    await writeFile(baselinePath, solidPng(4, 4, [100, 100, 100, 255]));
    const resized = capture(solidPng(8, 4, [100, 100, 100, 255]));

    await expect(
      compareAgainstBaseline({ capture: resized, baselinePath, ...OPTIONS }),
    ).rejects.toThrow(/8x4 but .* is 4x4/);
  });

  it('never autogenerates a missing baseline', async () => {
    const fresh = capture(solidPng(4, 4, [100, 100, 100, 255]));

    await expect(
      compareAgainstBaseline({ capture: fresh, baselinePath, ...OPTIONS }),
    ).rejects.toThrow(/Missing baseline .*VELLUM_E2E_UPDATE_BASELINES=1/s);
    expect(existsSync(baselinePath)).toBe(false);
  });

  it('writes but still fails when regeneration is requested', async () => {
    const fresh = capture(solidPng(4, 4, [100, 100, 100, 255]));

    // A regenerating run that went green could approve its own baseline.
    await expect(
      compareAgainstBaseline({
        capture: fresh,
        baselinePath,
        updateBaselines: true,
        ...OPTIONS,
      }),
    ).rejects.toThrow(/Baseline written to/);
    expect(await readFile(baselinePath)).toEqual(fresh.bytes);
  });
});
