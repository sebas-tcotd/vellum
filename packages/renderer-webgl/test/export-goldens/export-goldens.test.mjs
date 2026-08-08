import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANIFEST_PATH,
  buildBaselineReport,
  compareGoldenCase,
  compareRgbaPixels,
  validateManifest,
} from './harness.mjs';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  // CRC is never verified by our decoder, so any 4 bytes round-trip correctly.
  return Buffer.concat([
    length,
    Buffer.from(type, 'ascii'),
    data,
    Buffer.alloc(4),
  ]);
}

/** Builds a minimal 1x1 RGBA PNG, filter type None, for digest/decode tests. */
function build1x1Png([r, g, b, a]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  const raw = Buffer.from([0, r, g, b, a]);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const FIXTURES = [
  'packages/parser-cslmap/fixtures/altavento.cslmap',
  'packages/parser-cslmap/fixtures/aurelia-del-delta.cslmap',
];
const AREAS = ['viewport', 'full-map'];
const SCALES = ['1x', '2x', '4x'];
const BACKGROUNDS = ['white', 'dark', 'transparent'];

/** Builds the full 2 x 2 x 3 x 3 = 36 case cross product. */
function makeCases(overrides = () => ({})) {
  const cases = [];
  for (const fixture of FIXTURES) {
    for (const area of AREAS) {
      for (const scale of SCALES) {
        for (const background of BACKGROUNDS) {
          const name = `${fixture.split('/').pop().replace('.cslmap', '')}`;
          const entry = {
            fixture,
            area,
            scale,
            background,
            golden: `${name}/${area}-${scale}-${background}.png`,
            goldenMetadata: {
              dimensions: 'unknown',
              dimensionsReason: 'gpu-harness-not-run',
              format: 'png',
              scale,
              area,
              background,
              rendererVersion: '@vellum/renderer-webgl@0.1.0',
            },
            result: { status: 'unknown', reason: 'gpu-harness-not-run' },
          };
          cases.push({ ...entry, ...overrides(entry) });
        }
      }
    }
  }
  return cases;
}

function makeManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    story: '6.2A',
    rendererVersion: '@vellum/renderer-webgl@0.1.0',
    referenceCommit: 'abc1234',
    cases: makeCases(),
    ...overrides,
  };
}

describe('export goldens manifest validation', () => {
  it('accepts the full two-fixture cross product', () => {
    const manifest = makeManifest();
    expect(manifest.cases).toHaveLength(36);
    expect(() => validateManifest(manifest)).not.toThrow();
  });

  it('rejects a manifest that covers only one fixture', () => {
    const cases = makeCases().filter((entry) => entry.fixture === FIXTURES[0]);
    expect(cases).toHaveLength(18);
    expect(() => validateManifest(makeManifest({ cases }))).toThrow(
      'missing fixture',
    );
  });

  it('rejects an empty and a malformed manifest', () => {
    expect(() => validateManifest(makeManifest({ cases: [] }))).toThrow(
      'no cases',
    );
    expect(() => validateManifest(null)).toThrow('Invalid 6.2A baseline');
    expect(() => validateManifest(makeManifest({ cases: [null] }))).toThrow(
      'Invalid baseline case entry',
    );
  });

  it('rejects golden metadata that does not describe its own case', () => {
    const cases = makeCases();
    cases[0].goldenMetadata = { ...cases[0].goldenMetadata, scale: '4x' };
    expect(() => validateManifest(makeManifest({ cases }))).toThrow(
      'does not match case',
    );
  });

  it('rejects a golden captured with a different renderer build', () => {
    const cases = makeCases();
    cases[0].goldenMetadata = {
      ...cases[0].goldenMetadata,
      rendererVersion: '@vellum/renderer-webgl@9.9.9',
    };
    expect(() => validateManifest(makeManifest({ cases }))).toThrow(
      'rendererVersion does not match',
    );
  });

  it('rejects a wildcard sentinel in place of real metadata', () => {
    const cases = makeCases();
    cases[0].goldenMetadata = {
      ...cases[0].goldenMetadata,
      scale: 'case',
      area: 'case',
      background: 'case',
    };
    expect(() => validateManifest(makeManifest({ cases }))).toThrow(
      'does not match case',
    );
  });

  it('rejects absolute paths and directory traversal', () => {
    const absolute = makeCases();
    absolute[0].golden = '/tmp/goldens/leaked.png';
    expect(() => validateManifest(makeManifest({ cases: absolute }))).toThrow(
      'must be relative',
    );

    const traversal = makeCases();
    traversal[0].golden = '../../../etc/passwd';
    expect(() => validateManifest(makeManifest({ cases: traversal }))).toThrow(
      'must be relative',
    );
  });

  it('requires full evidence once a case is accepted', () => {
    const cases = makeCases();
    cases[0].result = { status: 'accepted' };
    expect(() => validateManifest(makeManifest({ cases }))).toThrow(
      'exact integers',
    );

    cases[0].goldenMetadata = {
      ...cases[0].goldenMetadata,
      dimensions: { width: 2, height: 1 },
    };
    expect(() => validateManifest(makeManifest({ cases }))).toThrow(
      'expectedSha256',
    );
  });

  it('requires a reason when dimensions are unknown', () => {
    const cases = makeCases();
    delete cases[0].goldenMetadata.dimensionsReason;
    expect(() => validateManifest(makeManifest({ cases }))).toThrow(
      'Unknown dimensions need a reason',
    );
  });
});

describe('export goldens pixel comparison', () => {
  const dimensions = { width: 2, height: 1 };

  it('accepts RGB drift within the threshold', () => {
    const actual = Uint8Array.from([10, 20, 30, 255, 40, 50, 60, 255]);
    const expected = Uint8Array.from([12, 22, 32, 255, 41, 51, 61, 255]);

    expect(compareRgbaPixels(actual, expected, { dimensions })).toMatchObject({
      differentPixels: 0,
      totalPixels: 2,
    });
  });

  it('rejects any alpha difference, on every background', () => {
    const opaque = Uint8Array.from([0, 0, 0, 255, 0, 0, 0, 255]);
    const transparentCapture = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() =>
      compareRgbaPixels(transparentCapture, opaque, { dimensions }),
    ).toThrow('alpha mismatch');

    // AC3 verifies alpha exactly: a single step is a mismatch, not noise.
    const offByOne = Uint8Array.from([0, 0, 0, 254, 0, 0, 0, 255]);
    expect(() => compareRgbaPixels(offByOne, opaque, { dimensions })).toThrow(
      'alpha mismatch',
    );
  });

  it('detects a transposed capture that byte length alone would miss', () => {
    const pixels = Uint8Array.from([1, 2, 3, 255, 4, 5, 6, 255]);

    expect(() =>
      compareRgbaPixels(pixels, pixels, {
        dimensions: { width: 1, height: 3 },
      }),
    ).toThrow('expected 12 for 1x3');
  });

  it('keeps the empty comparison finite', () => {
    expect(compareRgbaPixels(new Uint8Array(), new Uint8Array())).toEqual({
      differentPixels: 0,
      differentPixelRatio: 0,
      totalPixels: 0,
    });
  });

  it('fails an accepted golden whose digest no longer matches', async () => {
    const pixels = Uint8Array.from([1, 2, 3, 255]);
    const png = build1x1Png(pixels);
    const entry = {
      fixture: FIXTURES[0],
      area: 'viewport',
      scale: '1x',
      background: 'white',
      golden: 'altavento/viewport-1x-white.png',
      goldenMetadata: {
        dimensions: { width: 1, height: 1 },
        format: 'png',
        scale: '1x',
        area: 'viewport',
        background: 'white',
        rendererVersion: '@vellum/renderer-webgl@0.1.0',
      },
      result: { status: 'accepted' },
      expectedSha256: 'stale-digest',
    };
    const readPngBytes = async () => png;

    await expect(
      compareGoldenCase(entry, '/tmp/manifest.json', readPngBytes),
    ).rejects.toThrow('digest mismatch');

    entry.expectedSha256 = createHash('sha256').update(pixels).digest('hex');
    await expect(
      compareGoldenCase(entry, '/tmp/manifest.json', readPngBytes),
    ).resolves.toMatchObject({ status: 'accepted', differentPixels: 0 });
  });

  it('fails when the decoded PNG does not match the declared dimensions', async () => {
    const png = build1x1Png([1, 2, 3, 255]);
    const entry = {
      fixture: FIXTURES[0],
      area: 'viewport',
      scale: '1x',
      background: 'white',
      golden: 'altavento/viewport-1x-white.png',
      goldenMetadata: {
        dimensions: { width: 2, height: 2 },
        format: 'png',
        scale: '1x',
        area: 'viewport',
        background: 'white',
        rendererVersion: '@vellum/renderer-webgl@0.1.0',
      },
      result: { status: 'accepted' },
      expectedSha256: 'irrelevant',
    };

    await expect(
      compareGoldenCase(entry, '/tmp/manifest.json', async () => png),
    ).rejects.toThrow('dimensions mismatch');
  });
});

describe('export goldens report', () => {
  it('reports the manifest path and relative golden paths', () => {
    const report = buildBaselineReport(makeManifest(), {
      manifestPath: 'packages/renderer-webgl/test/export-goldens/manifest.json',
    });

    expect(report.reference.manifestPath).toBe(
      'packages/renderer-webgl/test/export-goldens/manifest.json',
    );
    expect(report.reference.commit).toBe('abc1234');
    expect(report.goldens.paths.every((path) => !path.startsWith('/'))).toBe(
      true,
    );
    expect(report.fixtures).toHaveLength(2);
  });

  it('surfaces the slow tail at p95 instead of hiding it', () => {
    // 18 measured cases, the last one slow. `floor((n - 1) * 0.95)` lands on
    // index 16 here and never reaches index 17, so the slowest case would be
    // invisible; nearest-rank `ceil(0.95 * n) - 1` reports it.
    const cases = makeCases();
    for (let index = 0; index < 18; index += 1) {
      cases[index].result = {
        ...cases[index].result,
        durationMs: index === 17 ? 9999 : 5,
      };
    }

    const report = buildBaselineReport(makeManifest({ cases }));

    expect(report.metrics.measuredCases).toBe(18);
    expect(report.metrics.totalCases).toBe(36);
    expect(report.metrics.p50DurationMs).toBe(5);
    expect(report.metrics.p95DurationMs).toBe(9999);
  });

  it('does not collapse p50 and p95 on a two-sample tail', () => {
    const cases = makeCases();
    cases[0].result = { ...cases[0].result, durationMs: 10 };
    cases[1].result = { ...cases[1].result, durationMs: 10_000 };

    const report = buildBaselineReport(makeManifest({ cases }));

    expect(report.metrics.p50DurationMs).toBe(10);
    expect(report.metrics.p95DurationMs).toBe(10_000);
  });

  it('records AC7 metrics rather than duration alone', () => {
    const report = buildBaselineReport(makeManifest());

    expect(report.metrics).toHaveProperty('tileBudget');
    expect(report.metrics).toHaveProperty('memoryAvailableBytes');
    expect(report.metrics.dimensions).toHaveLength(36);
    expect(report.metrics.dimensions[0]).toMatchObject({ scale: '1x' });
  });

  it('carries each comparison through to the report', () => {
    const cases = makeCases();
    cases[0].result = {
      status: 'accepted',
      comparison: { status: 'accepted', differentPixels: 7 },
    };

    const report = buildBaselineReport(makeManifest({ cases }));

    expect(report.goldens.comparisons[0].comparison).toMatchObject({
      differentPixels: 7,
    });
    expect(report.goldens.comparisons[1].comparison).toBe('not-compared');
  });

  it('does not share the budget constant between reports', () => {
    const first = buildBaselineReport(makeManifest({ budgets: undefined }));
    first.budgets.logicalPixels.value = 1;
    const second = buildBaselineReport(makeManifest({ budgets: undefined }));

    expect(second.budgets.logicalPixels.value).toBe(1_000_000_000);
  });

  it('survives a case with no result record', () => {
    const cases = makeCases();
    delete cases[0].result;

    expect(() => buildBaselineReport(makeManifest({ cases }))).not.toThrow();
  });
});

describe('shipped baseline manifest', () => {
  it('passes its own validation', async () => {
    const manifest = JSON.parse(await readFile(DEFAULT_MANIFEST_PATH, 'utf8'));

    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.cases).toHaveLength(36);
  });

  it('records a real reference commit for reproducibility', async () => {
    const manifest = JSON.parse(await readFile(DEFAULT_MANIFEST_PATH, 'utf8'));

    // AC10: the handoff is only reproducible if the commit is identified.
    expect(manifest.referenceCommit).not.toBe('unknown');
    expect(manifest.referenceCommit).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it('publishes the command and paths story 6.2B expects to consume', async () => {
    const manifest = JSON.parse(await readFile(DEFAULT_MANIFEST_PATH, 'utf8'));

    expect(manifest.harness.command).toBe(
      'pnpm --filter @vellum/renderer-webgl test -- export-goldens',
    );
    expect(manifest.harness.goldenRoot).toBe(
      'packages/renderer-webgl/test/export-goldens',
    );
  });

  it('decodes and verifies every accepted golden against its digest', async () => {
    // Regression: `validateManifest` only checks JSON shape. Without this,
    // the *published* command (this Vitest suite) never actually decodes a
    // single PNG or checks a digest — only `node harness.mjs` did, so anyone
    // running the documented command got a false sense of full coverage.
    const manifest = JSON.parse(await readFile(DEFAULT_MANIFEST_PATH, 'utf8'));
    const accepted = manifest.cases.filter(
      (entry) => entry.result.status === 'accepted',
    );
    expect(accepted.length).toBe(36);

    for (const entry of accepted) {
      const comparison = await compareGoldenCase(entry, DEFAULT_MANIFEST_PATH);
      expect(comparison).toMatchObject({
        status: 'accepted',
        differentPixels: 0,
      });
    }
    // Decoding 36 real PNGs (up to 4096x2621) takes longer than Vitest's 5s
    // default — allow slower CI runners enough headroom for the same work.
  }, 60_000);
});
