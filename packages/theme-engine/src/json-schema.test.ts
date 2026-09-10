import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_STYLE_PARAMS } from './default-style';
import {
  buildVellumStyleSchema,
  caseFoldLiterals,
  COLOR_TOKEN_PATTERN,
  unanchor,
  VELLUMSTYLE_SCHEMA_ID,
} from './json-schema';
import { validateVellumStyle } from './validators/theme';
import { migrateTheme } from './schema-migration';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.resolve(HERE, '..', 'vellumstyle.schema.json');
const REPO_ROOT = path.resolve(HERE, '../../..');
/**
 * Ruta del artefacto relativa al root del repo, con separadores de URL. El `$id` publicado
 * es una URL de raw.githubusercontent apuntando a este archivo, así que atar una cosa a la
 * otra es lo que hace que mover el archivo rompa un test en vez de romper el `$schema` de
 * todos los temas ya publicados.
 */
const SCHEMA_PATH_IN_REPO = path
  .relative(REPO_ROOT, SCHEMA_FILE)
  .replaceAll(path.sep, '/');
const BUILTIN_THEMES_DIR = path.resolve(
  HERE,
  '../../../apps/desktop/src-tauri/resources/themes',
);
const REEMIT_COMMAND = 'pnpm --filter @vellum/theme-engine schema:emit';

/** A fresh 2020-12 Ajv compiled against the derived schema. */
function compiledValidator() {
  // `strict: false` — the schema is intentionally open (no `additionalProperties`), which
  // Ajv's strict mode flags as a "missing" keyword rather than the deliberate contract it is.
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  return ajv.compile(buildVellumStyleSchema());
}

/** Reads a built-in `.vellumstyle` from the Tauri resources directory. */
function readBuiltin(file: string): unknown {
  return JSON.parse(
    readFileSync(path.join(BUILTIN_THEMES_DIR, file), 'utf-8'),
  ) as unknown;
}

const BUILTIN_FILES = readdirSync(BUILTIN_THEMES_DIR)
  .filter((f: string) => f.endsWith('.vellumstyle'))
  .sort();

describe('vellumstyle.schema.json artifact', () => {
  it('matches the derived schema (re-emit if this fails)', () => {
    const committed: unknown = JSON.parse(readFileSync(SCHEMA_FILE, 'utf-8'));
    expect(
      committed,
      `vellumstyle.schema.json is out of date — run \`${REEMIT_COMMAND}\` and commit the result.`,
    ).toEqual(buildVellumStyleSchema());
  });

  it('declares the stable published $id', () => {
    expect(buildVellumStyleSchema().$id).toBe(VELLUMSTYLE_SCHEMA_ID);
    expect(VELLUMSTYLE_SCHEMA_ID).toBe(
      'https://raw.githubusercontent.com/sebas-tcotd/vellum/main/packages/theme-engine/vellumstyle.schema.json',
    );
  });

  it('points the published $id at where the artifact actually lives', () => {
    expect(SCHEMA_PATH_IN_REPO).toBe(
      'packages/theme-engine/vellumstyle.schema.json',
    );
    expect(
      VELLUMSTYLE_SCHEMA_ID,
      `mover ${SCHEMA_PATH_IN_REPO} rompe el \`$schema\` de todos los temas publicados — actualiza VELLUMSTYLE_SCHEMA_ID y avisa en el changelog.`,
    ).toMatch(new RegExp(`/${SCHEMA_PATH_IN_REPO}$`));
  });

  it('is a legitimate JSON Schema 2020-12 document that ajv can compile', () => {
    expect(() => compiledValidator()).not.toThrow();
  });

  it('requires only `name` at the root', () => {
    expect(buildVellumStyleSchema().required).toEqual(['name']);
  });

  it('never closes a level with additionalProperties (extension point)', () => {
    const seen: string[] = [];
    const walk = (node: unknown, at: string): void => {
      if (typeof node !== 'object' || node === null) return;
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${at}[${i}]`));
        return;
      }
      const record = node as Record<string, unknown>;
      if ('additionalProperties' in record) seen.push(at);
      if ('unevaluatedProperties' in record) seen.push(at);
      for (const key of Object.keys(record)) {
        walk(record[key], at ? `${at}.${key}` : key);
      }
    };
    walk(buildVellumStyleSchema(), '');
    expect(seen).toEqual([]);
  });

  it('carries no platform shell tokens', () => {
    const serialized = JSON.stringify(buildVellumStyleSchema()).toLowerCase();
    for (const token of ['fluent', 'liquid glass', 'liquidglass', 'shell']) {
      expect(serialized).not.toContain(token);
    }
  });

  it('derives the color pattern from the runtime color grammar', () => {
    const pattern = new RegExp(COLOR_TOKEN_PATTERN);
    for (const good of [
      '#fff',
      '#ffff',
      '#f7f6f1',
      '#f7f6f1cc',
      'hsl(210, 40%, 60%)',
      'HSL(210DEG 40% 60% / 0.5)',
    ]) {
      expect(pattern.test(good), good).toBe(true);
    }
    for (const bad of ['rojo', 'red', 'rgb(1,2,3)', '#ff', '#fffff']) {
      expect(pattern.test(bad), bad).toBe(false);
    }
  });

  it('offers the default palette value on every leaf', () => {
    const schema = buildVellumStyleSchema() as {
      properties: Record<string, Record<string, unknown>>;
    };
    const water = schema.properties.water as { default?: unknown };
    expect(water.default).toBe(DEFAULT_RENDER_STYLE_PARAMS.water);

    const grid = schema.properties.grid as {
      properties: Record<string, { default?: unknown }>;
    };
    expect(grid.properties.opacity.default).toBe(
      DEFAULT_RENDER_STYLE_PARAMS.grid.opacity,
    );
    expect(grid.properties.dasharray.default).toEqual(
      DEFAULT_RENDER_STYLE_PARAMS.grid.dasharray,
    );
  });
});

describe('caseFoldLiterals', () => {
  it('expands unescaped letters into a two-character class', () => {
    expect(caseFoldLiterals('hsl(')).toBe('[hH][sS][lL](');
  });

  it('copies escape sequences verbatim so their meaning survives', () => {
    expect(caseFoldLiterals('\\d+\\s*')).toBe('\\d+\\s*');
    // La letra escapada es parte de la secuencia, no un literal que expandir.
    expect(caseFoldLiterals('a\\w')).toBe('[aA]\\w');
  });

  it('leaves non-letters alone', () => {
    expect(caseFoldLiterals('-?\\d+(?:\\.\\d+)?%')).toBe('-?\\d+(?:\\.\\d+)?%');
  });

  it('copies a letter-free character class verbatim', () => {
    // Las que usa HSL_COLOR_PATTERN: sin letras, plegarlas sería un no-op.
    expect(caseFoldLiterals('[,\\s]')).toBe('[,\\s]');
    expect(caseFoldLiterals('a[,\\s/]b')).toBe('[aA][,\\s/][bB]');
  });

  it('throws on a character class with letters instead of mangling it', () => {
    // Enrutar HEX_COLOR_PATTERN por aquí produciría `[0-9[aA]-[fF]]`.
    expect(() => caseFoldLiterals('[0-9a-fA-F]{3}')).toThrow(
      /clase de caracteres con letras/,
    );
    expect(() => caseFoldLiterals('#[0-9a-f]')).toThrow(
      /clase de caracteres con letras/,
    );
  });

  it('throws on an unterminated character class', () => {
    expect(() => caseFoldLiterals('[,\\s')).toThrow(/sin cerrar/);
  });
});

describe('unanchor', () => {
  it('strips the outer ^ and $ anchors', () => {
    expect(unanchor('^abc$')).toBe('abc');
    expect(unanchor('^abc')).toBe('abc');
    expect(unanchor('abc$')).toBe('abc');
    expect(unanchor('abc')).toBe('abc');
  });

  it('keeps a trailing literal `\\$` intact', () => {
    // Quitarlo dejaría la barra colgando y escaparía al carácter siguiente al concatenar.
    expect(unanchor('^precio: \\$$')).toBe('precio: \\$');
    expect(unanchor('^precio: \\$')).toBe('precio: \\$');
  });
});

describe('built-in themes against the published schema', () => {
  // Derivado del directorio, no una lista fija: agregar un sexto tema es una operación
  // normal y no debería romper tests que no hablan de ese tema.
  it('finds the built-in themes on disk', () => {
    expect(
      BUILTIN_FILES.length,
      `no se encontró ningún .vellumstyle en ${BUILTIN_THEMES_DIR}`,
    ).toBeGreaterThan(0);
  });

  for (const file of BUILTIN_FILES) {
    it(`${file} passes ajv and the runtime validator`, () => {
      const validate = compiledValidator();
      const theme = readBuiltin(file);
      const ok = validate(theme);
      expect(validate.errors ?? [], file).toEqual([]);
      expect(ok, file).toBe(true);
      expect(validateVellumStyle(migrateTheme(theme)).valid, file).toBe(true);
    });
  }

  it('accepts the built-ins that omit the optional `parkAreas` key', () => {
    const withoutParkAreas = BUILTIN_FILES.filter(
      (file) => !('parkAreas' in (readBuiltin(file) as object)),
    );
    expect(
      withoutParkAreas.length,
      'ningún built-in omite `parkAreas`, así que este test ya no prueba que la clave sea opcional',
    ).toBeGreaterThan(0);
    const validate = compiledValidator();
    for (const file of withoutParkAreas) {
      expect(validate(readBuiltin(file)), file).toBe(true);
    }
  });
});

describe('schema I/O matrix', () => {
  const validTheme = {
    schemaVersion: 1,
    name: 'Day',
    ...DEFAULT_RENDER_STYLE_PARAMS,
  };

  it('accepts a theme with no `schemaVersion` (the runtime migrates it to 1)', () => {
    const { schemaVersion: _omitted, ...legacy } = validTheme;
    expect(compiledValidator()(legacy)).toBe(true);
    expect(migrateTheme(legacy).schemaVersion).toBe(1);
  });

  it('accepts unknown fields at the root and nested inside a group', () => {
    expect(
      compiledValidator()({ ...validTheme, miCampo: 1, _authorNotes: 'hi' }),
    ).toBe(true);
    expect(
      compiledValidator()({
        ...validTheme,
        roads: {
          ...validTheme.roads,
          highway: { ...validTheme.roads.highway, _extra: 'bar' },
        },
      }),
    ).toBe(true);
  });

  it('accepts a bare `{ name }` — every style group is optional', () => {
    expect(compiledValidator()({ name: 'x' })).toBe(true);
    expect(compiledValidator()({ name: 'x', miCampo: 1 })).toBe(true);
  });

  it('rejects an empty `name` and a missing `name`', () => {
    expect(compiledValidator()({ ...validTheme, name: '' })).toBe(false);
    const { name: _omitted, ...nameless } = validTheme;
    expect(compiledValidator()(nameless)).toBe(false);
  });

  it('rejects a malformed color, and the runtime names the path and rule', () => {
    const bad = {
      ...validTheme,
      roads: {
        ...validTheme.roads,
        highway: { generic: { fill: 'rojo', casing: '#7d748e' } },
      },
    };
    expect(compiledValidator()(bad)).toBe(false);
    expect(validateVellumStyle(migrateTheme(bad))).toEqual({
      valid: false,
      error: 'roads.highway.generic.fill',
      rule: 'color-token',
    });
  });

  it('rejects a provided group that is missing one of its leaves', () => {
    const { highway: _omitted, ...roadsWithoutHighway } = validTheme.roads;
    expect(
      compiledValidator()({ ...validTheme, roads: roadsWithoutHighway }),
    ).toBe(false);
  });

  it('rejects a non-integer `schemaVersion` and a `schemaVersion` below 1', () => {
    expect(compiledValidator()({ ...validTheme, schemaVersion: 1.5 })).toBe(
      false,
    );
    expect(compiledValidator()({ ...validTheme, schemaVersion: 0 })).toBe(
      false,
    );
  });

  it('validates numeric leaves the runtime validator leaves alone', () => {
    const badGrid = {
      ...validTheme,
      grid: { ...validTheme.grid, opacity: 'mucho' },
    };
    expect(compiledValidator()(badGrid)).toBe(false);
    // The runtime walk only inspects color leaves, so it still accepts this file.
    expect(validateVellumStyle(migrateTheme(badGrid)).valid).toBe(true);

    const badDasharray = {
      ...validTheme,
      grid: { ...validTheme.grid, dasharray: ['4', '4'] },
    };
    expect(compiledValidator()(badDasharray)).toBe(false);
  });

  it('rejects a non-object root', () => {
    expect(compiledValidator()([])).toBe(false);
    expect(compiledValidator()('texto')).toBe(false);
  });

  it('agrees with the runtime on a `name` of the wrong type', () => {
    const bad = { ...validTheme, name: 42 };
    expect(compiledValidator()(bad)).toBe(false);
    expect(validateVellumStyle(migrateTheme(bad))).toEqual({
      valid: false,
      error: 'name',
      rule: 'type',
    });
  });

  it('agrees with the runtime on a group passed as an array', () => {
    const bad = { ...validTheme, terrain: [] };
    expect(compiledValidator()(bad)).toBe(false);
    // El JSON Schema nombra `terrain` con tipo malo; el walk de runtime también, gracias
    // al guard de Array.isArray.
    expect(validateVellumStyle(migrateTheme(bad))).toEqual({
      valid: false,
      error: 'terrain',
      rule: 'type',
    });
  });

  it('reports `required` for a `schemaVersion` the migration did not add', () => {
    // `migrateTheme` siempre lo rellena, así que solo se ve saltando la migración —
    // pero `validateVellumStyle` es export público y alguien puede llamarlo directo.
    const { schemaVersion: _omitted, ...unmigrated } = validTheme;
    expect(validateVellumStyle(unmigrated)).toEqual({
      valid: false,
      error: 'schemaVersion',
      rule: 'required',
    });
  });
});
