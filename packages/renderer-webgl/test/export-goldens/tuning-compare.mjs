#!/usr/bin/env node

/**
 * Node-only comparator for Story 6.2H candidate PNGs.
 *
 * It never creates a canvas or runs MapLibre. A desktop/WebView capture
 * adapter writes candidate files to a temporary directory; this module only
 * decodes those files and compares them with the accepted 6.2A goldens.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { decodePngToRgba } from './png-to-rgba.mjs';
import { compareRgbaPixels, DEFAULT_MANIFEST_PATH } from './harness.mjs';

const FIXTURES = [
  'packages/parser-cslmap/fixtures/altavento.cslmap',
  'packages/parser-cslmap/fixtures/aurelia-del-delta.cslmap',
];
const AREAS = ['viewport', 'full-map'];
const SCALES = ['1x', '2x', '4x'];
const BACKGROUNDS = ['white', 'dark', 'transparent'];
const TECHNIQUES = ['base', 'ssaa-2x', 'ssaa-4x', 'box-3x3'];
const METRIC_FIELDS = [
  'durationMs',
  'peakMemoryBytes',
  'fileBytes',
  'frontendIpcBytes',
  'rustSessionBytes',
];

/** Builds one complete 6.2A-compatible matrix per requested technique. */
export function buildTuningMatrix(techniques = ['base']) {
  return techniques.flatMap((technique) =>
    FIXTURES.flatMap((fixture) =>
      AREAS.flatMap((area) =>
        SCALES.flatMap((scale) =>
          BACKGROUNDS.map((background) => ({
            technique,
            fixture,
            area,
            scale,
            background,
            candidate: null,
            eligibility: 'unknown',
            metrics: Object.fromEntries(
              METRIC_FIELDS.map((field) => [field, 'unknown']),
            ),
            dimensions: 'unknown',
            alpha: 'unknown',
            visual: 'unknown',
            platform: 'unknown',
          })),
        ),
      ),
    ),
  );
}

/** Validates matrix cardinality and ensures missing measurements remain unknown. */
export function validateTuningManifest(manifest) {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.cases)
  ) {
    throw new Error('Invalid 6.2H tuning manifest');
  }
  const techniques = new Set(manifest.cases.map((entry) => entry?.technique));
  const expected =
    techniques.size *
    FIXTURES.length *
    AREAS.length *
    SCALES.length *
    BACKGROUNDS.length;
  if (techniques.size === 0 || manifest.cases.length !== expected)
    throw new Error('Tuning manifest does not contain a complete matrix');
  for (const entry of manifest.cases) validateCase(entry);
}

/** Compares one candidate against its accepted 6.2A golden. */
export async function compareTuningCase(
  entry,
  goldenEntry,
  readPngBytes = readFile,
) {
  if (goldenEntry?.golden?.result?.status !== 'accepted')
    return { status: 'unknown', reason: 'accepted-golden-not-available' };
  if (entry.eligibility !== 'eligible' || typeof entry.candidate !== 'string')
    return { status: 'unknown', reason: 'candidate-not-captured' };
  try {
    const candidate = decodePngToRgba(await readPngBytes(entry.candidate));
    const golden = decodePngToRgba(await readPngBytes(goldenEntry.golden.path));
    const comparison = compareRgbaPixels(candidate.pixels, golden.pixels, {
      dimensions: { width: golden.width, height: golden.height },
    });
    return {
      status: 'pass',
      dimensions: { width: candidate.width, height: candidate.height },
      alpha: 'exact',
      comparison,
    };
  } catch (error) {
    return {
      status: 'fail',
      reason: error instanceof Error ? error.message : 'comparison-failed',
    };
  }
}

/** Finds the accepted golden matching a candidate's matrix coordinates. */
export function findGoldenCase(goldenCases, entry) {
  return goldenCases.find(
    (candidate) =>
      candidate.fixture === entry.fixture &&
      candidate.area === entry.area &&
      candidate.scale === entry.scale &&
      candidate.background === entry.background &&
      (candidate.technique === undefined ||
        candidate.technique === entry.technique),
  );
}

/** Runs the comparator from a temporary candidate manifest. */
export async function compareTuningManifest(
  manifest,
  goldenManifest,
  manifestPath = DEFAULT_MANIFEST_PATH,
) {
  validateTuningManifest(manifest);
  const results = [];
  for (const entry of manifest.cases) {
    const golden = findGoldenCase(goldenManifest.cases, entry);
    const goldenPath = golden
      ? { ...golden, path: resolve(dirname(manifestPath), golden.golden) }
      : undefined;
    results.push({
      ...entry,
      visual: await compareTuningCase(entry, { golden: goldenPath }),
    });
  }
  return results;
}

function validateCase(entry) {
  if (!entry || !TECHNIQUES.includes(entry.technique))
    throw new Error('Invalid tuning technique');
  for (const field of ['fixture', 'area', 'scale', 'background']) {
    if (typeof entry[field] !== 'string' || entry[field].length === 0)
      throw new Error('Invalid tuning matrix case');
  }
  if (!['eligible', 'ineligible', 'unknown'].includes(entry.eligibility))
    throw new Error('Invalid tuning eligibility');
  if (!entry.metrics || typeof entry.metrics !== 'object')
    throw new Error('Tuning case is missing metrics');
  for (const field of METRIC_FIELDS) {
    const value = entry.metrics[field];
    if (
      value !== 'unknown' &&
      !(typeof value === 'number' && Number.isFinite(value))
    )
      throw new Error('Tuning metrics must be numeric or unknown');
  }
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) {
  const manifestPath = process.argv[2];
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateTuningManifest(manifest);
  console.log(JSON.stringify(manifest, null, 2));
}
