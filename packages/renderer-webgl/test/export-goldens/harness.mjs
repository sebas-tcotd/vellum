#!/usr/bin/env node

/**
 * Story 6.2A baseline golden harness.
 *
 * Validates the golden manifest and compares captured RGBA buffers against the
 * recorded references. Lives inside `@vellum/renderer-webgl` because the
 * goldens belong to the renderer that produces them, and because story 6.2B
 * consumes this exact path and command.
 *
 * Run standalone (emits the versioned report on stdout):
 *   node packages/renderer-webgl/test/export-goldens/harness.mjs [manifest.json]
 *
 * Run as part of the package suite:
 *   pnpm --filter @vellum/renderer-webgl test -- export-goldens
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');

/** Resolved against this file, not the caller's cwd. */
export const DEFAULT_MANIFEST_PATH = resolve(HERE, 'manifest.json');

/**
 * Renders a path for publication in the report.
 *
 * AC7 forbids recording absolute paths: they leak the home directory and the
 * username of whoever ran the harness into a committed artifact.
 */
export function repoRelativePath(absolutePath) {
  const rendered = relative(REPO_ROOT, resolve(absolutePath));
  return rendered.startsWith('..') ? 'outside-repo' : rendered;
}

/** AC3 requires both real fixtures; a single-fixture baseline is not a baseline. */
const REQUIRED_FIXTURES = new Set([
  'packages/parser-cslmap/fixtures/altavento.cslmap',
  'packages/parser-cslmap/fixtures/aurelia-del-delta.cslmap',
]);
const REQUIRED_AREAS = new Set(['viewport', 'full-map']);
const REQUIRED_SCALES = new Set(['1x', '2x', '4x']);
const REQUIRED_BACKGROUNDS = new Set(['white', 'dark', 'transparent']);

/** Exclusive RGB channel delta tolerated per pixel. */
export const RGB_CHANNEL_DELTA_EXCLUSIVE = 2;
/** Fraction of pixels allowed to exceed the RGB delta. */
export const MAX_DIFFERENT_PIXEL_RATIO = 0.005;

const INITIAL_BUDGETS = {
  rgbaTileBytes: { status: 'initial-budget', value: 32 * 1024 * 1024 },
  frontendIpcBytes: { status: 'initial-budget', value: 64 * 1024 * 1024 },
  rustBuffersBytes: { status: 'initial-budget', value: 256 * 1024 * 1024 },
  logicalPixels: { status: 'initial-budget', value: 1_000_000_000 },
  maxInFlight: { status: 'initial-budget', value: 1 },
};

function assertRelativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing relative path: ${label}`);
  }
  // AC7 forbids recording absolute paths, which leak home directories and
  // usernames into a report that is committed to the repo.
  if (isAbsolute(value) || value.includes('..')) {
    throw new Error(`Path must be relative and contained: ${label}`);
  }
  return value;
}

function resolveWithin(baseDirectory, relativePath, label) {
  assertRelativePath(relativePath, label);
  const target = resolve(baseDirectory, relativePath);
  if (target !== baseDirectory && !target.startsWith(baseDirectory + sep)) {
    throw new Error(`Path escapes the manifest directory: ${label}`);
  }
  return target;
}

function validateDimensions(dimensions, key) {
  if (
    !dimensions ||
    typeof dimensions !== 'object' ||
    !Number.isInteger(dimensions.width) ||
    dimensions.width <= 0 ||
    !Number.isInteger(dimensions.height) ||
    dimensions.height <= 0
  ) {
    throw new Error(`Golden dimensions must be exact integers: ${key}`);
  }
  return dimensions;
}

/**
 * Validates a golden's metadata against the case it claims to describe.
 *
 * Strictness follows the result status: an `accepted` golden carries full
 * evidence (exact dimensions, RGBA sidecar, digest), while a not-yet-measured
 * `unknown` case still has to declare its scale/area/background precisely.
 */
export function validateGoldenMetadata(entry, key) {
  const metadata = entry.goldenMetadata;
  if (!metadata || typeof metadata !== 'object') {
    throw new Error(`Missing golden metadata: ${key}`);
  }
  if (metadata.format !== 'png') {
    throw new Error(`Golden format must be png: ${key}`);
  }
  if (typeof metadata.rendererVersion !== 'string') {
    throw new Error(`Golden metadata needs a rendererVersion: ${key}`);
  }
  // No wildcard sentinel: metadata that can match anything validates nothing.
  if (
    metadata.scale !== entry.scale ||
    metadata.area !== entry.area ||
    metadata.background !== entry.background
  ) {
    throw new Error(`Golden metadata does not match case: ${key}`);
  }
  if (entry.result.status === 'accepted') {
    validateDimensions(metadata.dimensions, key);
    assertRelativePath(entry.actualRgbaPath, `${key}.actualRgbaPath`);
    assertRelativePath(entry.expectedRgbaPath, `${key}.expectedRgbaPath`);
    if (typeof entry.expectedSha256 !== 'string') {
      throw new Error(`Accepted golden needs expectedSha256: ${key}`);
    }
    return;
  }
  if (metadata.dimensions !== 'unknown') {
    validateDimensions(metadata.dimensions, key);
  } else if (typeof metadata.dimensionsReason !== 'string') {
    throw new Error(`Unknown dimensions need a reason: ${key}`);
  }
}

function validateResult(result, key) {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`Invalid result: ${key}`);
  }
  if (!['accepted', 'unknown'].includes(result.status)) {
    throw new Error(`Invalid result: ${key}`);
  }
  if (result.status === 'unknown' && typeof result.reason !== 'string') {
    throw new Error(`Invalid result: ${key}`);
  }
}

/** Validates the manifest shape, case matrix and path hygiene. */
export function validateManifest(manifest) {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.cases)
  ) {
    throw new Error('Invalid 6.2A baseline manifest');
  }
  if (manifest.cases.length === 0) {
    throw new Error('Baseline manifest has no cases');
  }
  const seen = new Set();
  for (const entry of manifest.cases) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Invalid baseline case entry');
    }
    const key = `${entry.fixture}|${entry.area}|${entry.scale}|${entry.background}`;
    if (seen.has(key)) throw new Error(`Duplicate baseline case: ${key}`);
    seen.add(key);
    if (!REQUIRED_AREAS.has(entry.area))
      throw new Error(`Invalid area: ${entry.area}`);
    if (!REQUIRED_SCALES.has(entry.scale))
      throw new Error(`Invalid scale: ${entry.scale}`);
    if (!REQUIRED_BACKGROUNDS.has(entry.background)) {
      throw new Error(`Invalid background: ${entry.background}`);
    }
    assertRelativePath(entry.fixture, `${key}.fixture`);
    assertRelativePath(entry.golden, `${key}.golden`);
    validateResult(entry.result, key);
    validateGoldenMetadata(entry, key);
  }
  const fixtures = new Set(manifest.cases.map((entry) => entry.fixture));
  for (const required of REQUIRED_FIXTURES) {
    if (!fixtures.has(required)) {
      throw new Error(`Baseline manifest is missing fixture: ${required}`);
    }
  }
  const expected =
    fixtures.size *
    REQUIRED_AREAS.size *
    REQUIRED_SCALES.size *
    REQUIRED_BACKGROUNDS.size;
  if (manifest.cases.length !== expected) {
    throw new Error(
      `Expected ${expected} cases, found ${manifest.cases.length}`,
    );
  }
}

/**
 * Compares RGBA pixel buffers using the 6.2A RGB threshold and exact alpha rule.
 *
 * `dimensions` is required: byte length alone cannot tell an 800x600 buffer
 * from a 600x800 one, so a transposed capture would compare clean without it.
 */
export function compareRgbaPixels(
  actual,
  expectedPixels,
  { dimensions, maxDifferentPixelRatio = MAX_DIFFERENT_PIXEL_RATIO } = {},
) {
  if (actual.length !== expectedPixels.length || actual.length % 4 !== 0) {
    throw new Error('Golden pixel buffers have incompatible byte lengths');
  }
  if (dimensions) {
    const expectedBytes = dimensions.width * dimensions.height * 4;
    if (actual.length !== expectedBytes) {
      throw new Error(
        `Golden buffer is ${actual.length} bytes, expected ${expectedBytes} for ${dimensions.width}x${dimensions.height}`,
      );
    }
  }
  let differentPixels = 0;
  for (let offset = 0; offset < actual.length; offset += 4) {
    const rgbDifferent =
      Math.abs(actual[offset] - expectedPixels[offset]) >
        RGB_CHANNEL_DELTA_EXCLUSIVE ||
      Math.abs(actual[offset + 1] - expectedPixels[offset + 1]) >
        RGB_CHANNEL_DELTA_EXCLUSIVE ||
      Math.abs(actual[offset + 2] - expectedPixels[offset + 2]) >
        RGB_CHANNEL_DELTA_EXCLUSIVE;
    if (rgbDifferent) differentPixels += 1;
    // AC3: alpha is verified exactly, on every background. Skipping opaque
    // backgrounds would let a fully transparent capture match a white golden.
    if (actual[offset + 3] !== expectedPixels[offset + 3]) {
      throw new Error(
        `Golden alpha mismatch at pixel ${offset / 4}: ${actual[offset + 3]} vs ${expectedPixels[offset + 3]}`,
      );
    }
  }
  const totalPixels = actual.length / 4;
  const differentPixelRatio =
    totalPixels === 0 ? 0 : differentPixels / totalPixels;
  if (differentPixelRatio > maxDifferentPixelRatio) {
    throw new Error(
      `Golden RGB difference ${differentPixelRatio} exceeds ${maxDifferentPixelRatio}`,
    );
  }
  return { differentPixels, differentPixelRatio, totalPixels };
}

/** Compares the captured and reference RGBA files for an accepted case. */
export async function compareGoldenCase(
  entry,
  manifestPath,
  readPixels = readFile,
) {
  if (entry.result?.status !== 'accepted') {
    return { status: entry.result?.status ?? 'unknown' };
  }
  const baseDirectory = dirname(resolve(manifestPath));
  const key = `${entry.fixture}|${entry.area}|${entry.scale}|${entry.background}`;
  const [actual, expected] = await Promise.all([
    readPixels(
      resolveWithin(
        baseDirectory,
        entry.actualRgbaPath,
        `${key}.actualRgbaPath`,
      ),
    ),
    readPixels(
      resolveWithin(
        baseDirectory,
        entry.expectedRgbaPath,
        `${key}.expectedRgbaPath`,
      ),
    ),
  ]);
  // AC10: a golden regenerated without updating its digest must not pass
  // silently as the accepted reference.
  const digest = createHash('sha256').update(expected).digest('hex');
  if (digest !== entry.expectedSha256) {
    throw new Error(
      `Golden digest mismatch for ${key}: reference was regenerated without updating expectedSha256`,
    );
  }
  const comparison = compareRgbaPixels(actual, expected, {
    dimensions: entry.goldenMetadata.dimensions,
  });
  return { status: 'accepted', ...comparison };
}

function nearestRank(sorted, ratio) {
  if (sorted.length === 0) return 'unknown';
  // Nearest-rank: ceil(ratio * n) - 1. `floor((n - 1) * ratio)` cannot reach the
  // last element for n = 18, so the slowest case would be invisible at p95.
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(ratio * sorted.length) - 1),
  );
  return sorted[index];
}

function numericField(results, field) {
  return results
    .map((result) => result?.[field])
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
}

/** Builds the versioned, privacy-safe report emitted by the baseline harness. */
export function buildBaselineReport(
  manifest,
  { manifestPath = 'unknown' } = {},
) {
  const results = manifest.cases.map((entry) => entry.result ?? {});
  const durations = numericField(results, 'durationMs').sort((a, b) => a - b);
  const peakMemory = numericField(results, 'peakMemoryBytes');
  const tileBudgets = numericField(results, 'tileBudget');
  return {
    schemaVersion: 1,
    story: manifest.story ?? 'unknown',
    reference: {
      commit: manifest.referenceCommit ?? 'unknown',
      rendererVersion: manifest.rendererVersion ?? 'unknown',
      harnessCommand: manifest.harness?.command ?? 'unknown',
      manifestPath,
    },
    fixtures: [...new Set(manifest.cases.map((entry) => entry.fixture))],
    platform: manifest.platform ?? {
      os: 'unknown',
      osReason: 'not measured',
      gpu: 'unknown',
      gpuReason: 'not measured',
    },
    limits: manifest.capabilities ?? 'unknown',
    goldens: {
      total: manifest.cases.length,
      accepted: results.filter((result) => result.status === 'accepted').length,
      unknown: results.filter((result) => result.status === 'unknown').length,
      paths: manifest.cases.map((entry) => entry.golden),
      comparisons: manifest.cases.map((entry) => ({
        golden: entry.golden,
        // Without this the comparison computed by `main()` is thrown away and
        // drifting goldens look pixel-perfect in the report.
        comparison: entry.result?.comparison ?? 'not-compared',
      })),
    },
    metrics: {
      status: durations.length > 0 ? 'measured' : 'unknown',
      measuredCases: durations.length,
      totalCases: results.length,
      p50DurationMs: nearestRank(durations, 0.5),
      p95DurationMs: nearestRank(durations, 0.95),
      peakMemoryBytes:
        peakMemory.length > 0 ? Math.max(...peakMemory) : 'unknown',
      memoryAvailableBytes:
        manifest.capabilities?.memoryAvailableBytes ?? 'unknown',
      tileBudget: tileBudgets.length > 0 ? Math.max(...tileBudgets) : 'unknown',
      dimensions: manifest.cases.map((entry) => ({
        golden: entry.golden,
        scale: entry.scale,
        dimensions: entry.goldenMetadata?.dimensions ?? 'unknown',
      })),
    },
    // A shared module constant would let one consumer's mutation corrupt every
    // later report.
    budgets: structuredClone(manifest.budgets ?? INITIAL_BUDGETS),
  };
}

async function main() {
  const requestedManifestPath = process.argv[2]?.trim();
  const manifestPath = requestedManifestPath || DEFAULT_MANIFEST_PATH;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateManifest(manifest);
  for (const entry of manifest.cases) {
    if (entry.result.status !== 'accepted') continue;
    try {
      entry.result = {
        ...entry.result,
        comparison: await compareGoldenCase(entry, manifestPath),
      };
    } catch (error) {
      // One failing case must not abort the run: the report is the evidence.
      entry.result = {
        ...entry.result,
        comparison: { status: 'failed', reason: error.message },
      };
    }
  }
  const report = buildBaselineReport(manifest, {
    manifestPath: repoRelativePath(manifestPath),
  });
  console.log(JSON.stringify(report, null, 2));
  const failed = manifest.cases.filter(
    (entry) => entry.result.comparison?.status === 'failed',
  );
  if (failed.length > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
