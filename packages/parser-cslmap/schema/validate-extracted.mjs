// Validates extracted `.vellummap` documents against the published JSON Schema.
//
// Usage: node schema/validate-extracted.mjs <dir> [<dir> …]
// Each <dir> is one unzipped `.vellummap`: its `manifest.json` is checked against
// the schema root and every JSON module the manifest lists against the `$defs`
// named after the module id. CI runs it on the Bridge harness output, so the C#
// writer is held to the schema as well as to the Rust reader.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(path.join(HERE, 'vellummap.schema.json'), 'utf-8'),
);

// Same options as `src/vellummap.schema.test.ts`.
const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  formats: { 'date-time': true },
});
ajv.addSchema(schema);

const readJson = (file) => JSON.parse(readFileSync(file, 'utf-8'));

/** Every schema violation in one extracted document, as `file: message` lines. */
export function documentErrors(dir) {
  const errors = [];
  const check = (validate, data, file) => {
    if (validate(data)) return;
    for (const error of validate.errors ?? []) {
      errors.push(`${file}: ${error.instancePath || '/'} ${error.message}`);
    }
  };

  const manifest = readJson(path.join(dir, 'manifest.json'));
  check(ajv.getSchema(schema.$id), manifest, 'manifest.json');
  for (const module of manifest.modules ?? []) {
    if (!module.path?.endsWith('.json')) continue;
    const validate = ajv.getSchema(`${schema.$id}#/$defs/${module.id}`);
    if (!validate) {
      errors.push(`${module.path}: the schema has no $defs/${module.id}`);
      continue;
    }
    check(validate, readJson(path.join(dir, module.path)), module.path);
  }
  return errors;
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]))
) {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error('usage: validate-extracted.mjs <dir> [<dir> …]');
    process.exit(2);
  }
  let failed = false;
  for (const dir of dirs) {
    const errors = documentErrors(dir);
    console.log(`${errors.length === 0 ? 'ok  ' : 'FAIL'} ${dir}`);
    for (const error of errors) console.log(`  ${error}`);
    failed ||= errors.length > 0;
  }
  if (failed) process.exitCode = 1;
}
