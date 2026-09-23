import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const STATES = new Set([
  'discovered',
  'ready-for-capture',
  'captured',
  'comparison-ready',
  'comparison-complete',
  'capture-failed',
  'not-comparable',
  'excluded-synthetic',
]);

export function fileHash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function resolveEntryPath(manifestPath, value) {
  return value ? path.resolve(path.dirname(manifestPath), value) : null;
}

export function validateManifest(manifest, manifestPath, fixtureDir) {
  const errors = [];
  if (manifest?.version !== 1 || !Array.isArray(manifest.entries))
    return ['Manifest: version=1 y entries[] son obligatorios.'];
  const ids = new Set();
  const listed = new Set();
  for (const entry of manifest.entries) {
    if (typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id))
      errors.push(`ID duplicado o inválido: ${entry.id}`);
    ids.add(entry.id);
    if (!['real', 'synthetic'].includes(entry.kind))
      errors.push(`${entry.id}: kind inválido`);
    if (!STATES.has(entry.status)) errors.push(`${entry.id}: status inválido`);
    if (typeof entry.origin !== 'string' || !entry.origin.trim())
      errors.push(`${entry.id}: origin obligatorio`);
    if (
      entry.cityName != null &&
      (typeof entry.cityName !== 'string' || !entry.cityName.trim())
    )
      errors.push(`${entry.id}: cityName inválido`);
    if (
      entry.kind === 'synthetic' &&
      (entry.status !== 'excluded-synthetic' || !entry.reason)
    )
      errors.push(`${entry.id}: exclusión sintética requiere estado y razón`);
    if (entry.kind === 'real' && entry.status === 'excluded-synthetic')
      errors.push(`${entry.id}: ciudad real marcada sintética`);
    if (typeof entry.cslmap !== 'string' || !entry.cslmap.endsWith('.cslmap')) {
      errors.push(`${entry.id}: cslmap inválido`);
      continue;
    }
    if (entry.storage !== undefined && entry.storage !== 'local')
      errors.push(`${entry.id}: storage inválido`);
    const file = resolveEntryPath(manifestPath, entry.cslmap);
    // Las capturas locales viven fuera de Git; su ausencia se reporta en el análisis.
    if (!fs.existsSync(file) && entry.storage !== 'local')
      errors.push(`${entry.id}: no existe ${entry.cslmap}`);
    if (listed.has(file)) errors.push(`${entry.id}: CSLMap duplicado`);
    listed.add(file);
    if (
      entry.snapshot != null &&
      (typeof entry.snapshot !== 'string' || !entry.snapshot.endsWith('.json'))
    )
      errors.push(`${entry.id}: snapshot inválido`);
    if (
      ['captured', 'comparison-ready', 'comparison-complete'].includes(
        entry.status,
      ) &&
      !entry.snapshot
    )
      errors.push(`${entry.id}: estado requiere snapshot`);
  }
  if (fixtureDir && fs.existsSync(fixtureDir))
    for (const name of fs
      .readdirSync(fixtureDir)
      .filter((n) => n.endsWith('.cslmap'))) {
      if (!listed.has(path.resolve(fixtureDir, name)))
        errors.push(`Fixture sin inventariar: ${name}`);
    }
  return errors;
}

export function validateSnapshot(value) {
  const errors = [];
  if (value?.kind !== 'vellum-bridge-raw-snapshot')
    errors.push('kind inválido');
  if (value?.snapshotVersion !== 1) errors.push('snapshotVersion incompatible');
  if (typeof value?.bridgeVersion !== 'string' || !value.bridgeVersion)
    errors.push('bridgeVersion ausente');
  if (
    typeof value?.capturedAt !== 'string' ||
    Number.isNaN(Date.parse(value.capturedAt))
  )
    errors.push('capturedAt inválido');
  if (
    !value?.payload ||
    typeof value.payload !== 'object' ||
    Array.isArray(value.payload)
  )
    errors.push('payload inválido');
  if (
    !value?.diagnostics ||
    typeof value.diagnostics.complete !== 'boolean' ||
    !Array.isArray(value.diagnostics.errors) ||
    !Array.isArray(value.diagnostics.unsupported)
  )
    errors.push('diagnostics inválido');
  if (
    value?.diagnostics?.complete &&
    (value.diagnostics.errors?.length || value.diagnostics.unsupported?.length)
  )
    errors.push('snapshot declara complete con errores o unsupported');
  return errors;
}
