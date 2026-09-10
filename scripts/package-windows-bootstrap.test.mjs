/**
 * Pins `findNsisInstaller` against the failure modes that would otherwise only
 * surface on a Windows runner: no build yet, and a stale bundle directory with
 * more than one .exe left over from a previous version.
 *
 * `packageWindowsBootstrap` itself is not exercised here — it shells out to
 * `cargo build --release`, which belongs in a real Windows packaging run, not
 * a unit test.
 */

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findNsisInstaller } from './package-windows-bootstrap.mjs';

const roots = [];

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop(), { recursive: true, force: true });
  }
});

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'package-bootstrap-'));
  roots.push(root);
  return root;
}

describe('findNsisInstaller', () => {
  it('throws when the bundle directory does not exist', () => {
    const root = makeRoot();
    expect(() => findNsisInstaller(root)).toThrow(/pnpm tauri build/);
  });

  it('throws when the bundle directory has no .exe', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'target/release/bundle/nsis'), {
      recursive: true,
    });
    expect(() => findNsisInstaller(root)).toThrow(/No \.exe found/);
  });

  it('throws when more than one .exe is present', () => {
    const root = makeRoot();
    const dir = path.join(root, 'target/release/bundle/nsis');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Vellum_0.8.0_x64-setup.exe'), '');
    fs.writeFileSync(path.join(dir, 'Vellum_0.7.0_x64-setup.exe'), '');
    expect(() => findNsisInstaller(root)).toThrow(/found 2/);
  });

  it('finds the single installer .exe', () => {
    const root = makeRoot();
    const dir = path.join(root, 'target/release/bundle/nsis');
    fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, 'Vellum_0.8.0_x64-setup.exe');
    fs.writeFileSync(exe, '');
    expect(findNsisInstaller(root)).toBe(exe);
  });
});
