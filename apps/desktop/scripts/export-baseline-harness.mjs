#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const DEFAULT_MANIFEST_PATH =
  '_bmad-output/implementation-artifacts/6-2a-baseline-manifest.json';
const REQUIRED_AREAS = new Set(['viewport', 'full-map']);
const REQUIRED_SCALES = new Set(['1x', '2x', '4x']);
const REQUIRED_BACKGROUNDS = new Set(['white', 'dark', 'transparent']);
const INITIAL_BUDGETS = {
  rgbaTileBytes: { status: 'initial-budget', value: 32 * 1024 * 1024 },
  frontendIpcBytes: { status: 'initial-budget', value: 64 * 1024 * 1024 },
  rustBuffersBytes: { status: 'initial-budget', value: 256 * 1024 * 1024 },
  logicalPixels: { status: 'initial-budget', value: 1_000_000_000 },
  maxInFlight: { status: 'initial-budget', value: 1 },
};

function validateGoldenMetadata(entry, manifest) {
  const metadata = entry.goldenMetadata ?? manifest.goldenMetadata;
  if (!metadata || typeof metadata !== 'object') {
    throw new Error(`Missing golden metadata: ${entry.fixture}`);
  }
  const dimensions = metadata.dimensions;
  const hasDimensions =
    dimensions === 'unknown' ||
    (dimensions &&
      Number.isInteger(dimensions.width) &&
      dimensions.width > 0 &&
      Number.isInteger(dimensions.height) &&
      dimensions.height > 0);
  if (!hasDimensions || metadata.format !== 'png') {
    throw new Error(`Invalid golden metadata: ${entry.fixture}`);
  }
  if (
    !['case', entry.scale].includes(metadata.scale) ||
    !['case', entry.area].includes(metadata.area)
  ) {
    throw new Error(`Golden metadata does not match case: ${entry.fixture}`);
  }
  if (!['case', entry.background].includes(metadata.background)) {
    throw new Error(`Golden background does not match case: ${entry.fixture}`);
  }
}

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases)) {
    throw new Error('Invalid 6.2A baseline manifest');
  }
  const seen = new Set();
  for (const entry of manifest.cases) {
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
    if (typeof entry.golden !== 'string' || !entry.result) {
      throw new Error(`Incomplete case: ${key}`);
    }
    validateGoldenMetadata(entry, manifest);
  }
  const fixtures = new Set(manifest.cases.map((entry) => entry.fixture));
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

/** Compares RGBA pixel buffers using the 6.2A RGB threshold and alpha rule. */
export function compareRgbaPixels(
  actual,
  expectedPixels,
  { transparent = false, maxDifferentPixelRatio = 0.005 } = {},
) {
  if (actual.length !== expectedPixels.length || actual.length % 4 !== 0) {
    throw new Error('Golden pixel buffers have incompatible dimensions');
  }
  let differentPixels = 0;
  for (let offset = 0; offset < actual.length; offset += 4) {
    const rgbDifferent =
      Math.abs(actual[offset] - expectedPixels[offset]) > 2 ||
      Math.abs(actual[offset + 1] - expectedPixels[offset + 1]) > 2 ||
      Math.abs(actual[offset + 2] - expectedPixels[offset + 2]) > 2;
    if (rgbDifferent) differentPixels += 1;
    if (
      transparent &&
      Math.abs(actual[offset + 3] - expectedPixels[offset + 3]) > 0
    ) {
      throw new Error(`Golden alpha mismatch at pixel ${offset / 4}`);
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
  return { differentPixels, differentPixelRatio };
}

/** Builds the versioned, privacy-safe report emitted by the baseline harness. */
export function buildBaselineReport(manifest) {
  const results = manifest.cases.map((entry) => entry.result);
  const durations = results
    .map((result) => result.durationMs)
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b);
  const percentile = (ratio) =>
    durations.length === 0
      ? 'unknown'
      : durations[
          Math.min(
            durations.length - 1,
            Math.floor((durations.length - 1) * ratio),
          )
        ];
  const peakMemory = results
    .map((result) => result.peakMemoryBytes)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  return {
    schemaVersion: 1,
    story: manifest.story,
    reference: {
      commit: manifest.referenceCommit ?? 'unknown',
      rendererVersion: manifest.rendererVersion ?? 'unknown',
      harnessCommand: manifest.harness?.command ?? 'unknown',
    },
    fixtures: [...new Set(manifest.cases.map((entry) => entry.fixture))],
    platform: manifest.platform ?? {
      os: 'unknown',
      gpu: 'unknown',
      gpuReason: 'not measured',
    },
    limits: manifest.capabilities ?? 'unknown',
    goldens: {
      total: manifest.cases.length,
      accepted: results.filter((result) => result.status === 'accepted').length,
      unknown: results.filter((result) => result.status === 'unknown').length,
      paths: manifest.cases.map((entry) => entry.golden),
    },
    metrics: {
      p50DurationMs: percentile(0.5),
      p95DurationMs: percentile(0.95),
      peakMemoryBytes:
        peakMemory.length > 0 ? Math.max(...peakMemory) : 'unknown',
    },
    budgets: manifest.budgets ?? INITIAL_BUDGETS,
  };
}

async function main() {
  const requestedManifestPath = process.argv[2]?.trim();
  const manifestPath = requestedManifestPath || DEFAULT_MANIFEST_PATH;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateManifest(manifest);
  console.log(JSON.stringify(buildBaselineReport(manifest), null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
