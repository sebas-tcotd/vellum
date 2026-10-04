/**
 * Pins the Windows icon generator.
 *
 * Same circle as `build-brand-assets.test.mjs`: the generator writes both the
 * icon and the hashes that vouch for it, so the guardrail alone would stay
 * green over a broken encoder. These tests rebuild the icon from `brand/` and
 * hold it to the committed hashes, and check the ICO container by hand.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ICO_SIZES,
  MSIX_LOGOS,
  WINDOWS_ICON_MANIFEST,
  WINDOWS_ICON_SOURCE,
  buildWindowsIcon,
  encodeIco,
  windowsIconPngs,
} from './build-windows-icon.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

describe('build-windows-icon', () => {
  it('reproduces the committed icon byte for byte', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-winicon-'));
    try {
      const target = path.join(root, WINDOWS_ICON_SOURCE);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, WINDOWS_ICON_SOURCE), target);
      const manifest = await buildWindowsIcon(root);
      const committed = JSON.parse(
        fs.readFileSync(path.join(repoRoot, WINDOWS_ICON_MANIFEST), 'utf8'),
      );
      expect(manifest).toEqual(committed);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('gives every MSIX logo a scale-100 file, which package-msix.ps1 requires', () => {
    const files = windowsIconPngs().map(({ file }) => file);
    for (const logo of Object.keys(MSIX_LOGOS)) {
      expect(files).toContain(`${logo}.scale-100.png`);
    }
  });

  it('ships each taskbar size plated, unplated and light-unplated', () => {
    const files = windowsIconPngs().map(({ file }) => file);
    for (const size of [16, 24, 32, 48, 256]) {
      expect(files).toContain(`Square44x44Logo.targetsize-${size}.png`);
      expect(files).toContain(
        `Square44x44Logo.targetsize-${size}_altform-unplated.png`,
      );
      expect(files).toContain(
        `Square44x44Logo.targetsize-${size}_altform-lightunplated.png`,
      );
    }
  });

  describe('encodeIco', () => {
    const png = (length) => Buffer.alloc(length, 7);
    const ico = encodeIco([
      { size: 16, png: png(10) },
      { size: 256, png: png(20) },
    ]);

    it('writes an ICONDIR with one entry per image', () => {
      expect(ico.readUInt16LE(0)).toBe(0);
      expect(ico.readUInt16LE(2)).toBe(1);
      expect(ico.readUInt16LE(4)).toBe(2);
    });

    it('stores 256 as 0 and points each entry at its image', () => {
      expect(ico.readUInt8(6)).toBe(16);
      expect(ico.readUInt8(6 + 16)).toBe(0);
      expect(ico.readUInt16LE(6 + 6)).toBe(32);
      expect(ico.readUInt32LE(6 + 8)).toBe(10);
      expect(ico.readUInt32LE(6 + 12)).toBe(6 + 2 * 16);
      expect(ico.readUInt32LE(6 + 16 + 12)).toBe(6 + 2 * 16 + 10);
      expect(ico.length).toBe(6 + 2 * 16 + 30);
    });
  });

  it('puts 256 first: Tauri uses the first entry as the window icon', () => {
    expect(ICO_SIZES[0]).toBe(256);
    expect(Math.min(...ICO_SIZES)).toBe(16);
    const ico = fs.readFileSync(
      path.join(repoRoot, 'apps/desktop/src-tauri/icons/windows/icon.ico'),
    );
    // A width of 0 in an ICONDIRENTRY means 256.
    expect(ico.readUInt8(6)).toBe(0);
  });
});
