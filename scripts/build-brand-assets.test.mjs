/**
 * Pins the artwork generator (Story 1.9).
 *
 * The identity guardrail compares each committed file against a hash recorded
 * by this script — but the script writes both, so the comparison is circular:
 * swap the channel order in `encodeBmp` and `pnpm brand:build` happily writes
 * red-for-blue bitmaps *and* the hashes that vouch for them, leaving
 * `check:installer` green and every installer wrong. These tests close the
 * circle by running the generator against `brand/` and holding its output to
 * the hashes already committed.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BRAND_SOURCES,
  DERIVED_ASSETS,
  DMG_LAYOUT,
  MANIFEST_FILE,
  assertDmgLayout,
  buildBrandAssets,
  encodeBmp,
  readMarkPaths,
} from './build-brand-assets.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function seededRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-brand-'));
  for (const relative of BRAND_SOURCES) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, relative), target);
  }
  return root;
}

describe('build-brand-assets', () => {
  it('reproduces the committed artwork byte for byte', async () => {
    const root = seededRoot();
    try {
      const manifest = await buildBrandAssets(root);
      const committed = JSON.parse(
        fs.readFileSync(path.join(repoRoot, MANIFEST_FILE), 'utf8'),
      );
      for (const asset of DERIVED_ASSETS) {
        expect(
          manifest.assets[asset.file].sha256,
          `${asset.file} no longer matches the committed artwork — either brand/ changed and the derivatives were not rebuilt, or the generator itself regressed`,
        ).toBe(committed.assets[asset.file].sha256);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  describe('the DMG arrow and the icons are one layout', () => {
    it('accepts the committed layout', () => {
      expect(() => assertDmgLayout()).not.toThrow();
    });

    it('rejects icons on different rows', () => {
      expect(() =>
        assertDmgLayout({
          ...DMG_LAYOUT,
          applicationFolderPosition: { x: 480, y: 40 },
        }),
      ).toThrow(/share a row/);
    });

    it('rejects an arrow that does not run between the icons', () => {
      expect(() =>
        assertDmgLayout({ ...DMG_LAYOUT, arrow: { fromX: 20, toX: 60 } }),
      ).toThrow(/between the two icons/);
    });
  });

  describe('readMarkPaths', () => {
    const mark = fs.readFileSync(
      path.join(repoRoot, 'brand/vellum-mark.svg'),
      'utf8',
    );

    it('pulls the disc and the glyph out of the canonical mark', () => {
      const { disc, glyph, extent } = readMarkPaths(mark);
      expect(disc).not.toBe(glyph);
      expect(extent).toBeGreaterThan(0);
    });

    it('refuses a mark that is not exactly two paths', () => {
      expect(() =>
        readMarkPaths(mark.replace('</svg>', '<path d="M0 0 H 1"/></svg>')),
      ).toThrow(/exactly two paths/);
    });

    it('refuses a non-square viewBox', () => {
      expect(() =>
        readMarkPaths(
          mark.replace(/viewBox="0 0 \d+ \d+"/, 'viewBox="0 0 236 100"'),
        ),
      ).toThrow(/square viewBox/);
    });
  });

  describe('encodeBmp', () => {
    // Two pixels, opaque: red then green, left to right on a single row.
    const pixels = Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]);
    const background = { r: 0, g: 0, b: 0 };

    it('writes a 24-bit BI_RGB header with the right dimensions', () => {
      const bmp = encodeBmp(pixels, 2, 1, background);
      expect(bmp.subarray(0, 2).toString('ascii')).toBe('BM');
      expect(bmp.readInt32LE(18)).toBe(2);
      expect(Math.abs(bmp.readInt32LE(22))).toBe(1);
      expect(bmp.readUInt16LE(28)).toBe(24);
      expect(bmp.readUInt32LE(30)).toBe(0);
    });

    it('writes BGR, not RGB — the swap that the hash manifest cannot catch', () => {
      const bmp = encodeBmp(pixels, 2, 1, background);
      const offset = bmp.readUInt32LE(10);
      expect([bmp[offset], bmp[offset + 1], bmp[offset + 2]]).toEqual([
        0, 0, 255,
      ]);
      expect([bmp[offset + 3], bmp[offset + 4], bmp[offset + 5]]).toEqual([
        0, 255, 0,
      ]);
    });

    it('pads each row to a four-byte boundary', () => {
      const bmp = encodeBmp(pixels, 2, 1, background);
      expect(bmp.length - bmp.readUInt32LE(10)).toBe(8);
    });
  });
});
