import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateManifest, validateSnapshot } from './corpus.mjs';
import { compareCity, reportMarkdown, summarize } from './compare.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const manifestPath = path.join(
  root,
  'research/vellum-bridge/corpus.manifest.json',
);
const fixtureDir = path.join(root, 'packages/parser-cslmap/fixtures');

describe('corpus de Vellum Bridge', () => {
  it('inventaría todos los fixtures y excluye los sintéticos con razón', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(validateManifest(manifest, manifestPath, fixtureDir)).toEqual([]);
    // Las capturas externas (p. ej. pares sincronizados) se suman aparte de los fixtures.
    const realFixtures = manifest.entries.filter(
      (e) =>
        e.kind === 'real' &&
        path.dirname(path.resolve(path.dirname(manifestPath), e.cslmap)) ===
          fixtureDir,
    );
    expect(realFixtures).toHaveLength(6);
  });

  it('rechaza manifest con exclusión sin razón o fixture faltante', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-corpus-test-'));
    try {
      const fixture = path.join(temp, 'sample.cslmap');
      fs.writeFileSync(fixture, '<City/>');
      const manifest = {
        version: 1,
        entries: [
          {
            id: 'sample',
            kind: 'synthetic',
            status: 'excluded-synthetic',
            cslmap: './sample.cslmap',
            origin: 'test',
          },
        ],
      };
      expect(
        validateManifest(manifest, path.join(temp, 'manifest.json'), temp),
      ).toContain('sample: exclusión sintética requiere estado y razón');
      manifest.entries[0].reason = 'test';
      expect(
        validateManifest(manifest, path.join(temp, 'manifest.json'), temp),
      ).toEqual([]);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it('tolera capturas locales ausentes, pero no fixtures versionados ausentes', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-corpus-test-'));
    try {
      const entry = {
        id: 'ciudad-2026-09-22',
        kind: 'real',
        status: 'captured',
        cslmap: 'cslmap/ciudad.cslmap',
        snapshot: 'snapshots/ciudad.json',
        origin: 'test',
      };
      const manifestFile = path.join(temp, 'manifest.json');
      const check = (e) =>
        validateManifest({ version: 1, entries: [e] }, manifestFile, null);
      expect(check({ ...entry, storage: 'local' })).toEqual([]);
      expect(check(entry)).toContain(
        'ciudad-2026-09-22: no existe cslmap/ciudad.cslmap',
      );
      expect(check({ ...entry, storage: 'nube' })).toContain(
        'ciudad-2026-09-22: storage inválido',
      );
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  it('rechaza envelopes incompatibles o engañosamente completos', () => {
    const raw = {
      kind: 'vellum-bridge-raw-snapshot',
      snapshotVersion: 1,
      bridgeVersion: 'test',
      capturedAt: '2026-09-22T00:00:00Z',
      payload: {},
      diagnostics: {
        complete: true,
        errors: ['roads failed'],
        unsupported: [],
      },
    };
    expect(validateSnapshot(raw)).toContain(
      'snapshot declara complete con errores o unsupported',
    );
    raw.diagnostics.complete = false;
    expect(validateSnapshot(raw)).toEqual([]);
    raw.snapshotVersion = 2;
    expect(validateSnapshot(raw)).toContain('snapshotVersion incompatible');
    raw.diagnostics = { complete: true };
    expect(validateSnapshot(raw)).toContain('diagnostics inválido');
  });

  it('clasifica presencia sin inventar paridad semántica y reporta pendientes', () => {
    const raw = {
      cityName: 'Test',
      diagnostics: { complete: false },
      payload: { roads: [{ id: 1 }], buildings: [] },
    };
    const baseline = {
      roadSegments: [{ id: '1' }],
      buildings: [],
      districts: [{ id: 'd' }],
    };
    const result = compareCity(raw, baseline);
    expect(result.domains.roads.category).toBe('unresolved');
    expect(result.domains.districts.category).toBe('cslmap-only');
    expect(result.domains.transit.category).toBe('not-observed');
    raw.diagnostics.unsupported = ['districts'];
    expect(compareCity(raw, baseline).domains.districts.category).toBe(
      'unresolved',
    );
    const entries = [
      {
        id: 'pending',
        status: 'ready-for-capture',
        snapshot: null,
        cslmap: 'x',
      },
    ];
    expect(reportMarkdown({ entries, summary: summarize(entries) })).toContain(
      'pendiente',
    );
  });
});
