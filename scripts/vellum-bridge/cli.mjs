import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  fileHash,
  resolveEntryPath,
  validateManifest,
  validateSnapshot,
} from './corpus.mjs';
import {
  compareCity,
  corpusSummary,
  parseCslmapTerrain,
  reportMarkdown,
  summarize,
} from './compare.mjs';
import { areasGeoJson } from './grid.mjs';

const repo = path.resolve(import.meta.dirname, '../..');
const fixtureDir = path.join(repo, 'packages/parser-cslmap/fixtures');
const manifestPath = path.resolve(
  process.argv[3] ??
    path.join(repo, 'research/vellum-bridge/corpus.manifest.json'),
);
const command = process.argv[2] ?? 'validate';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const errors = validateManifest(manifest, manifestPath, fixtureDir);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
if (command === 'validate') {
  console.log(`Manifest válido: ${manifest.entries.length} entradas.`);
  process.exit(0);
}
if (command !== 'analyze') {
  console.error(
    'Uso: node scripts/vellum-bridge/cli.mjs validate|analyze [manifest] [outputDir]',
  );
  process.exit(2);
}

const outputDir = path.resolve(
  process.argv[4] ?? path.join(repo, 'research/vellum-bridge/reports'),
);
const entries = [];
const geometries = [];
for (const entry of manifest.entries) {
  const cslmap = resolveEntryPath(manifestPath, entry.cslmap);
  const item = {
    id: entry.id,
    status: entry.status,
    cslmap: entry.cslmap,
    cslmapSha256: fs.existsSync(cslmap) ? fileHash(cslmap) : null,
    snapshot: entry.snapshot,
  };
  const snapshotFile = resolveEntryPath(manifestPath, entry.snapshot);
  if (
    entry.storage === 'local' &&
    (!fs.existsSync(cslmap) || (snapshotFile && !fs.existsSync(snapshotFile)))
  ) {
    item.status = 'not-comparable';
    item.error =
      'Archivos locales ausentes: copiar .cslmap y snapshot desde el almacenamiento compartido';
    entries.push(item);
    continue;
  }
  if (entry.kind === 'synthetic') {
    item.reason = entry.reason;
    entries.push(item);
    continue;
  }
  if (!entry.snapshot) {
    // Un fallo declarado en el manifest no se degrada a captura pendiente.
    if (!['capture-failed', 'not-comparable'].includes(entry.status))
      item.status = 'ready-for-capture';
    entries.push(item);
    continue;
  }
  const snapshotPath = resolveEntryPath(manifestPath, entry.snapshot);
  if (!fs.existsSync(snapshotPath)) {
    item.status = 'not-comparable';
    item.error = 'Snapshot no encontrado';
    entries.push(item);
    continue;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const problems = validateSnapshot(raw);
    if (problems.length) throw new Error(problems.join('; '));
    if (entry.cityName && raw.cityName !== entry.cityName)
      throw new Error(
        `Ciudad distinta: snapshot '${raw.cityName}', manifest '${entry.cityName}'`,
      );
    item.diagnostics = raw.diagnostics;
    item.gameVersion = raw.gameVersion ?? null;
    item.bridgeVersion = raw.bridgeVersion;
    item.snapshotSha256 = fileHash(snapshotPath);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vellum-bridge-'));
    try {
      const baselinePath = path.join(temp, 'baseline.json');
      const parsed = spawnSync(
        'cargo',
        [
          'run',
          '--quiet',
          '--example',
          'dump_city',
          '--package',
          'parser-cslmap',
          '--',
          cslmap,
          baselinePath,
        ],
        { cwd: repo, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
      );
      if (parsed.status !== 0)
        throw new Error(`Parser CSLMap: ${parsed.stderr.trim()}`);
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      item.comparison = compareCity(
        raw,
        baseline,
        parseCslmapTerrain(fs.readFileSync(cslmap, 'utf8')),
      );
      item.status = 'comparison-complete';
      geometries.push({ id: entry.id, raw });
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  } catch (error) {
    item.status = 'not-comparable';
    item.error = String(error);
  }
  entries.push(item);
}
const report = {
  formatVersion: 1,
  summary: summarize(entries),
  corpus: corpusSummary(entries),
  entries,
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, 'comparison.json'),
  JSON.stringify(report, null, 2) + '\n',
);
fs.writeFileSync(path.join(outputDir, 'comparison.md'), reportMarkdown(report));
// Polígonos derivados de las grillas crudas, para inspección visual (metros de CS1).
for (const { id, raw } of geometries) {
  const features = [];
  for (const [kind, grid, records] of [
    ['district', raw.payload.districtGrid, raw.payload.districts],
    ['park', raw.payload.parkGrid, raw.payload.parks],
  ]) {
    if (!grid) continue;
    try {
      features.push(...areasGeoJson(kind, grid, records).features);
    } catch (error) {
      console.error(`${id}: geometría de ${kind} omitida: ${error}`);
    }
  }
  fs.writeFileSync(
    path.join(outputDir, `${id}.areas.geojson`),
    JSON.stringify({ type: 'FeatureCollection', features }) + '\n',
  );
}
console.log(
  `Reporte: ${outputDir} (${report.summary.comparado} pares comparados).`,
);
