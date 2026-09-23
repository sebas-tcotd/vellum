import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

/**
 * Anti-drift del contrato `.vellummap`. Los mismos ejemplos de `schema/examples/`
 * los deserializa el reader de Rust (`src/vellummap/tests.rs`): que ajv y serde
 * acepten — y rechacen — los mismos archivos es la señal de que el schema publicado
 * y el reader no se separaron. El nombre de cada ejemplo empieza por el `$defs` que
 * lo valida (`transit.bridge.json` → `#/$defs/transit`).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(HERE, '..', 'schema');
const SCHEMA_PATH = path.join(SCHEMA_DIR, 'vellummap.schema.json');
const EXAMPLES_DIR = path.join(SCHEMA_DIR, 'examples');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8')) as {
  $id: string;
};

// Una sola instancia compilada. `strict: true`: el schema no usa keywords
// desconocidas ni `format`, así que un error de autoría falla aquí en vez de
// ignorarse.
// `format: "date-time"` es una anotación para editores: sin ajv-formats (no es
// dependencia del repo) se registra como conocida y sin validar, y quien exige
// RFC 3339 UTC es el `pattern` de `exportedAtUtc`.
const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  formats: { 'date-time': true },
});
ajv.addSchema(schema);

function validatorFor(def: string) {
  const validate = ajv.getSchema(`${schema.$id}#/$defs/${def}`);
  if (!validate) throw new Error(`el schema no define $defs/${def}`);
  return validate;
}

function examples(kind: 'valid' | 'invalid') {
  const dir = path.join(EXAMPLES_DIR, kind);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      def: file.split('.')[0] ?? '',
      data: JSON.parse(readFileSync(path.join(dir, file), 'utf-8')) as unknown,
    }));
}

describe('vellummap.schema.json', () => {
  it('compila en modo estricto y su raíz valida el manifest', () => {
    const validate = ajv.getSchema(schema.$id);
    if (!validate) throw new Error('el schema no se registró');
    const manifest = examples('valid').find(
      (e) => e.file === 'manifest.bridge.json',
    );
    expect(manifest).toBeDefined();
    expect(validate(manifest?.data)).toBe(true);
  });

  it.each(examples('valid'))('acepta el ejemplo $file', ({ def, data }) => {
    const validate = validatorFor(def);
    const ok = validate(data);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it.each(examples('invalid'))('rechaza el ejemplo $file', ({ def, data }) => {
    expect(validatorFor(def)(data)).toBe(false);
  });

  it('rechaza un campo desconocido en el manifest', () => {
    const validate = validatorFor('manifest');
    const example = examples('invalid').find(
      (e) => e.file === 'manifest.unknown-field.json',
    );
    expect(validate(example?.data)).toBe(false);
    expect(validate.errors).toContainEqual(
      expect.objectContaining({ keyword: 'additionalProperties' }),
    );
  });

  it('rechaza un documento de major 2', () => {
    const validate = validatorFor('manifest');
    const example = examples('invalid').find(
      (e) => e.file === 'manifest.major-2.json',
    );
    expect(validate(example?.data)).toBe(false);
    expect(validate.errors).toContainEqual(
      expect.objectContaining({
        instancePath: '/exportSchemaVersion',
        keyword: 'pattern',
      }),
    );
  });

  // Reglas solo del reader (documentadas en docs/es/vellummap-format.md): JSON
  // Schema no puede expresarlas, así que ajv acepta estas entradas y los tests de
  // Rust asertan que el reader las rechaza. Si un día ajv las rechaza, hay que
  // moverlas a `schema/examples/invalid/`.
  it.each([
    [
      'sourceId con parte decimal',
      'districts',
      {
        districts: [
          { sourceId: 1.0, name: 'a', labelPosition: { x: 0, y: 0, z: 0 } },
        ],
      },
    ],
    [
      'sourceId duplicado',
      'districts',
      {
        districts: [
          { sourceId: 1, name: 'a', labelPosition: { x: 0, y: 0, z: 0 } },
          { sourceId: 1, name: 'b', labelPosition: { x: 0, y: 0, z: 0 } },
        ],
      },
    ],
    [
      'segmento con nodo inexistente',
      'roads',
      {
        nodes: [],
        segments: [
          {
            sourceId: 7,
            startNodeSourceId: 1,
            endNodeSourceId: 2,
            itemClass: 'Medium Road',
            width: 24,
            points: [],
          },
        ],
      },
    ],
  ])('ajv acepta %s (regla solo del reader)', (_, def, data) => {
    expect(validatorFor(def)(data)).toBe(true);
  });
});
