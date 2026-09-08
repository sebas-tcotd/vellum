/**
 * Pins the two audit outcomes of the Story 1.8 matrix — a clean run and a run
 * with findings — plus the signing policy of AC3, which lives in YAML and has
 * no other guard.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReport, countBySeverity, renderSection } from './audit-deps.mjs';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const finding = (severity, pkg) => ({
  severity,
  package: pkg,
  title: `${pkg} advisory`,
  url: `https://example.test/${pkg}`,
  patched: '>=1.0.0',
});

describe('audit report', () => {
  it('states plainly that nothing applies when there are no findings', () => {
    const report = buildReport([
      { name: 'JavaScript (pnpm-lock.yaml)', findings: [] },
    ]);
    expect(report).toContain('No high or critical advisories.');
    expect(report).toContain('No advisories apply.');
    expect(report).not.toContain('[!IMPORTANT]');
  });

  it('surfaces high and critical findings up front, with their packages', () => {
    const report = buildReport([
      {
        name: 'JavaScript (pnpm-lock.yaml)',
        findings: [finding('high', 'vite'), finding('moderate', 'postcss')],
      },
      { name: 'Rust (Cargo.lock)', findings: [finding('critical', 'openssl')] },
    ]);
    expect(report).toContain('[!IMPORTANT]');
    expect(report).toContain('2 high/critical advisory(ies)');
    expect(report).toContain('`vite`');
    expect(report).toContain('`openssl`');
    // The moderate one is still listed, just not promoted to the banner.
    expect(report).toContain('`postcss`');
  });

  it('says so when a tool could not run, instead of reporting a clean audit', () => {
    const report = buildReport([
      {
        name: 'Rust (Cargo.lock)',
        unavailable: 'cargo-deny is not installed.',
        findings: [],
      },
    ]);
    expect(report).toContain('Audit unavailable');
    expect(report).not.toContain('No high or critical advisories.');
  });

  it('always declares itself informative, so a red-looking report is not read as a gate', () => {
    expect(
      buildReport([
        {
          name: 'JavaScript (pnpm-lock.yaml)',
          findings: [finding('critical', 'x')],
        },
      ]),
    ).toContain('**informative**');
  });

  it('counts by severity and orders the table most severe first', () => {
    expect(
      countBySeverity([
        finding('high', 'a'),
        finding('high', 'b'),
        finding('low', 'c'),
      ]),
    ).toMatchObject({ high: 2, low: 1 });
    const rows = renderSection({
      name: 'JavaScript (pnpm-lock.yaml)',
      findings: [finding('low', 'a'), finding('critical', 'b')],
    }).filter((line) => line.startsWith('| c') || line.startsWith('| l'));
    expect(rows[0]).toContain('critical');
  });

  it('ranks an unrecognised severity last instead of above critical', () => {
    const rows = renderSection({
      name: 'Rust (Cargo.lock)',
      findings: [
        { ...finding('critical', 'a'), severity: 'weird' },
        finding('critical', 'b'),
      ],
    }).filter((line) => line.startsWith('| '));
    // Row 0 is the header separator's neighbour; the first data row is `b`.
    expect(rows.at(-2)).toContain('`b`');
    expect(rows.at(-1)).toContain('weird');
  });

  it('escapes pipes in every cell, so an "a || b" fix range cannot break the table', () => {
    const row = renderSection({
      name: 'JavaScript (pnpm-lock.yaml)',
      findings: [
        { ...finding('high', 'extract-zip'), patched: '>=1.0.0 || >=2.0.0' },
      ],
    }).find((line) => line.includes('extract-zip'));
    expect(row).toContain('>=1.0.0 \\|\\| >=2.0.0');
    // Only the four real cell separators survive unescaped.
    expect(row.replace(/\\\|/g, '').split('|').length).toBe(6);
  });
});

describe('release signing policy (AC3)', () => {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, '.github/workflows/publish-release.yml'),
    'utf8',
  );

  it('never refuses to publish for a missing platform code-signing certificate', () => {
    const refuses = workflow
      .split('\n')
      .some(
        (line) =>
          /WINDOWS_CERTIFICATE|APPLE_(CERTIFICATE|SIGNING_IDENTITY)/.test(
            line,
          ) && /exit 1/.test(line),
      );
    expect(refuses).toBe(false);
    expect(workflow).not.toContain('Refusing to build an unsigned MSI');
  });

  it('keeps the updater signing key blocking — without it latest.json cannot validate', () => {
    // Anchored to the guard itself: an unanchored window would have been
    // satisfied by the secret name sitting near any unrelated `exit 1`.
    expect(workflow).toMatch(
      /if \[ -z "\$TAURI_SIGNING_PRIVATE_KEY" \]; then\n(?:.*\n)*?\s*exit 1\n/,
    );
  });

  it('never derives the macOS signing claim from a secret nothing acts on', () => {
    expect(workflow).toMatch(/^\s*MACOS_SIGNING=false$/m);
    expect(workflow).not.toMatch(/MACOS_SIGNING=true/);
  });

  it('replaces a previous evidence asset instead of failing the re-run', () => {
    expect(workflow).toMatch(/--method DELETE[\s\S]{0,200}releases\/assets/);
  });

  it('produces the traceable evidence asset instead of a log-only warning', () => {
    expect(workflow).toContain('signing-evidence.md');
    expect(workflow).toMatch(/windows-signing/);
    expect(workflow).toMatch(/macos-signing/);
  });
});
