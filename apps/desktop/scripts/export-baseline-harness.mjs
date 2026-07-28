#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const manifestPath =
  process.argv[2] ??
  '_bmad-output/implementation-artifacts/6-2a-baseline-manifest.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const requiredAreas = new Set(['viewport', 'full-map']);
const requiredScales = new Set(['1x', '2x', '4x']);
const requiredBackgrounds = new Set(['white', 'dark', 'transparent']);

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases)) {
  throw new Error('Invalid 6.2A baseline manifest');
}

const seen = new Set();
for (const entry of manifest.cases) {
  const key = `${entry.fixture}|${entry.area}|${entry.scale}|${entry.background}`;
  if (seen.has(key)) throw new Error(`Duplicate baseline case: ${key}`);
  seen.add(key);
  if (!requiredAreas.has(entry.area))
    throw new Error(`Invalid area: ${entry.area}`);
  if (!requiredScales.has(entry.scale))
    throw new Error(`Invalid scale: ${entry.scale}`);
  if (!requiredBackgrounds.has(entry.background)) {
    throw new Error(`Invalid background: ${entry.background}`);
  }
  if (!entry.golden || !entry.result)
    throw new Error(`Incomplete case: ${key}`);
}

const expected =
  2 * requiredAreas.size * requiredScales.size * requiredBackgrounds.size;
if (manifest.cases.length !== expected) {
  throw new Error(`Expected ${expected} cases, found ${manifest.cases.length}`);
}

console.log(
  JSON.stringify(
    {
      manifest: manifestPath,
      cases: manifest.cases.length,
      executable: manifest.harness.command,
      results: [...new Set(manifest.cases.map((entry) => entry.result.status))],
    },
    null,
    2,
  ),
);
