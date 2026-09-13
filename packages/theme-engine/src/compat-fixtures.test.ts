import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawThemeFile } from '@vellum/core';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RENDER_STYLE_PARAMS } from './default-style';
import { buildVellumStyleSchema } from './json-schema';
import { loadThemes } from './loader';
import { CURRENT_SCHEMA_VERSION, migrateTheme } from './schema-migration';
import {
  THEME_VALIDATION_RULES,
  type ThemeValidationRule,
} from './validators/theme';

/**
 * Compatibilidad hacia atrás fijada con fixtures versionados. Cada fixture pasa por el
 * JSON Schema publicado (`ajv`), el migrador, el validador y el loader en el mismo test:
 * que el schema y el runtime acepten — o rechacen — el mismo archivo es la señal
 * anti-drift. Agregar un fixture a `fixtures/` lo mete aquí sin tocar este archivo
 * (salvo los inválidos, que exigen declarar su diagnóstico esperado).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(HERE, '..', 'fixtures');
const REPO_ROOT = path.resolve(HERE, '../../..');
const BUILTIN_THEMES_DIR = path.join(
  REPO_ROOT,
  'apps/desktop/src-tauri/resources/themes',
);
const DOC_FILES = ['en', 'es'].map((lang) =>
  path.join(REPO_ROOT, 'docs', lang, 'vellumstyle-schema.md'),
);
const GUIDE_FILES = ['en', 'es'].map((lang) =>
  path.join(REPO_ROOT, 'docs', lang, 'creating-themes.md'),
);
const EXAMPLES_DIR = path.resolve(HERE, '..', 'examples');
const LOCALES_DIR = path.join(REPO_ROOT, 'packages/ui/src/i18n/locales');

/** Claves de raíz que un ejemplo oficial puede declarar además de las cartográficas. */
const EXAMPLE_ROOT_KEYS = new Set(['name', 'schemaVersion', '$schema']);

/** Carpetas de fixtures que deben cargar tal cual (sin que el autor edite el archivo). */
const VALID_DIRS = ['v1', 'legacy'] as const;

/** Diagnóstico esperado por cada fixture inválido (id = nombre sin extensión). */
const INVALID_EXPECTATIONS: Record<
  string,
  { field: string; rule: ThemeValidationRule }
> = {
  'color-malformado': { field: 'water', rule: 'color-token' },
  'grupo-parcial': { field: 'roads.highway', rule: 'required' },
  'raiz-arreglo': { field: 'root', rule: 'type' },
};

function compiledValidator() {
  // `strict: false` — mismo motivo que en json-schema.test.ts: el schema es abierto a
  // propósito (sin `additionalProperties`).
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  return ajv.compile(buildVellumStyleSchema());
}

function listFixtures(dir: string): { id: string; rawJson: string }[] {
  const abs = path.join(FIXTURES_DIR, dir);
  return readdirSync(abs)
    .filter((f) => f.endsWith('.vellumstyle'))
    .sort()
    .map((f) => ({
      id: f.replace(/\.vellumstyle$/, ''),
      rawJson: readFileSync(path.join(abs, f), 'utf-8'),
    }));
}

/** El tema `classic` tal como se publicó en `e9792d7`, seleccionado por nombre. */
function historicFixture(): { id: string; rawJson: string } {
  const found = listFixtures('v1').find((f) => f.id === 'classic-2026-07-22');
  if (!found)
    throw new Error('falta fixtures/v1/classic-2026-07-22.vellumstyle');
  return found;
}

function userFile(id: string, rawJson: string): RawThemeFile {
  return { id, source: 'user', rawJson };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rutas de `theme` que no existen en `DEFAULT_RENDER_STYLE_PARAMS` (salvo las claves de
 * raíz permitidas). Cerrado solo para los ejemplos oficiales: el contrato sigue abierto
 * a extension points de terceros.
 */
function nonCartographicPaths(
  theme: Record<string, unknown>,
  reference: unknown = DEFAULT_RENDER_STYLE_PARAMS,
  prefix = '',
): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(theme)) {
    const at = prefix ? `${prefix}.${key}` : key;
    if (!prefix && EXAMPLE_ROOT_KEYS.has(key)) continue;
    if (!isPlainObject(reference) || !Object.hasOwn(reference, key)) {
      found.push(at);
      continue;
    }
    if (isPlainObject(value)) {
      found.push(...nonCartographicPaths(value, reference[key], at));
    }
  }
  return found;
}

/** Cada bloque ```json de `doc`, parseado; un bloque que no parsea falla nombrándolo. */
function jsonBlocks(
  rel: string,
  doc: string,
): { block: string; parsed: unknown }[] {
  return [...doc.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((m) => {
    const block = m[1] ?? '';
    try {
      return { block, parsed: JSON.parse(block) as unknown };
    } catch (error) {
      throw new Error(
        `${rel}: bloque json inválido (${String(error)}):\n${block}`,
      );
    }
  });
}

function expectThemeBlocksLoad(rel: string, doc: string) {
  // Solo los objetos con `name` son ejemplos de tema (el resto: settings de editor, etc.).
  const blocks = jsonBlocks(rel, doc).filter(
    ({ parsed }) => isPlainObject(parsed) && Object.hasOwn(parsed, 'name'),
  );
  for (const { block, parsed } of blocks) {
    const validate = compiledValidator();
    expect(
      validate(parsed),
      `${block}\n${JSON.stringify(validate.errors)}`,
    ).toBe(true);
    const { warnings } = loadThemes([userFile('doc', block)]);
    expect(warnings, block).toEqual([]);
  }
  expect(
    blocks.length,
    `${rel} no tiene ningún ejemplo de tema`,
  ).toBeGreaterThan(0);
}

/**
 * Slug de encabezado estilo GitHub: minúsculas, se quitan los caracteres que no son letra,
 * número, espacio, guion o guion bajo (conservando letras unicode) y los espacios pasan a `-`.
 */
function headingSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-');
}

/** Anclas de los encabezados markdown de `doc` (fuera de bloques de código). */
function headingAnchors(doc: string): Set<string> {
  const withoutCode = doc.replace(/```[\s\S]*?```/g, '');
  return new Set(
    [...withoutCode.matchAll(/^#{1,6} +(.+?) *$/gm)].map((m) =>
      headingSlug(m[1] ?? ''),
    ),
  );
}

/** Lee un valor anidado del JSON de locale por ruta (`toasts.themeRule.type`). */
function localeString(lang: string, keyPath: string): string {
  const locale: unknown = JSON.parse(
    readFileSync(path.join(LOCALES_DIR, `${lang}.json`), 'utf-8'),
  );
  const value = keyPath
    .split('.')
    .reduce<unknown>(
      (node, key) => (isPlainObject(node) ? node[key] : undefined),
      locale,
    );
  if (typeof value !== 'string') {
    throw new Error(`${lang}.json no tiene el texto ${keyPath}`);
  }
  return value;
}

function expectMentionsEveryRule(rel: string, doc: string) {
  for (const rule of THEME_VALIDATION_RULES) {
    expect(doc, `${rel} no documenta \`${rule}\``).toContain(`\`${rule}\``);
  }
}

describe('fixtures válidos (v1 histórico y legacy)', () => {
  for (const dir of VALID_DIRS) {
    const fixtures = listFixtures(dir);

    it(`fixtures/${dir} no está vacío`, () => {
      expect(fixtures.length).toBeGreaterThan(0);
    });

    for (const { id, rawJson } of fixtures) {
      describe(`${dir}/${id}`, () => {
        it('pasa ajv crudo y migrado', () => {
          const validate = compiledValidator();
          const raw: unknown = JSON.parse(rawJson);
          expect(validate(raw), JSON.stringify(validate.errors)).toBe(true);
          expect(
            validate(migrateTheme(raw)),
            JSON.stringify(validate.errors),
          ).toBe(true);
        });

        it('carga con loadThemes sin warnings', () => {
          const { themes, warnings } = loadThemes([userFile(id, rawJson)]);
          expect(warnings).toEqual([]);
          expect(themes.map((t) => t.id)).toEqual([id]);
          expect(themes[0]?.schemaVersion).toBe(1);
        });

        it('la migración no muta la entrada', () => {
          const raw = JSON.parse(rawJson) as Record<string, unknown>;
          const snapshot = structuredClone(raw);
          migrateTheme(raw);
          expect(raw).toEqual(snapshot);
        });

        it('preserva los campos desconocidos (extension points)', () => {
          const raw = JSON.parse(rawJson) as {
            roads?: { highway?: Record<string, unknown> };
          };
          const migrated = migrateTheme(raw) as unknown as typeof raw;
          // `roads.*.industrial` se eliminó del schema; si el fixture lo trae, debe
          // sobrevivir intacto.
          if (raw.roads?.highway?.industrial === undefined) return;
          expect(migrated.roads?.highway?.industrial).toEqual(
            raw.roads?.highway?.industrial,
          );
        });
      });
    }
  }

  it('el fixture legacy no declara schemaVersion y la migración lo fija a 1', () => {
    for (const { rawJson } of listFixtures('legacy')) {
      const raw = JSON.parse(rawJson) as Record<string, unknown>;
      expect(raw).not.toHaveProperty('schemaVersion');
      expect(migrateTheme(raw).schemaVersion).toBe(1);
    }
  });

  it('el fixture v1 histórico carece de los grupos añadidos después y los rellena', () => {
    const historic = historicFixture();
    const raw = JSON.parse(historic.rawJson) as Record<string, unknown>;
    for (const group of ['contourLine', 'grid', 'mapFrame', 'parkAreas']) {
      expect(raw, group).not.toHaveProperty(group);
      expect(migrateTheme(raw), group).toHaveProperty(group);
    }
  });

  it('una versión futura carga best-effort', () => {
    const future = {
      ...JSON.parse(historicFixture().rawJson),
      schemaVersion: 7,
    };
    const { themes, warnings } = loadThemes([
      userFile('futuro', JSON.stringify(future)),
    ]);
    expect(warnings).toEqual([]);
    expect(themes[0]?.schemaVersion).toBe(7);
  });
});

describe('fixtures inválidos', () => {
  const fixtures = listFixtures('invalid');

  it('cada fixture inválido declara su diagnóstico esperado', () => {
    expect(fixtures.map((f) => f.id).sort()).toEqual(
      Object.keys(INVALID_EXPECTATIONS).sort(),
    );
  });

  for (const { id, rawJson } of fixtures) {
    it(`${id}: loadThemes da field/rule esperados y ajv también rechaza`, () => {
      const expected = INVALID_EXPECTATIONS[id];
      expect(expected, id).toBeDefined();
      const { themes, warnings } = loadThemes([userFile(id, rawJson)]);
      expect(themes).toEqual([]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({ themeId: id, ...expected });
      expect(compiledValidator()(JSON.parse(rawJson))).toBe(false);
    });
  }

  it('un inválido no impide cargar los demás', () => {
    const files = [
      ...fixtures.map((f) => userFile(f.id, f.rawJson)),
      ...listFixtures('v1').map((f) => userFile(f.id, f.rawJson)),
    ];
    const { themes, warnings } = loadThemes(files);
    expect(themes).toHaveLength(1);
    expect(warnings).toHaveLength(fixtures.length);
  });

  it('un override inválido de un built-in conserva el built-in', () => {
    const builtinDay = readFileSync(
      path.join(BUILTIN_THEMES_DIR, 'day.vellumstyle'),
      'utf-8',
    );
    const [bad] = fixtures.filter((f) => f.id === 'color-malformado');
    const { themes, warnings } = loadThemes([
      { id: 'day', source: 'built-in', rawJson: builtinDay },
      userFile('day', bad!.rawJson),
    ]);
    expect(themes.map((t) => [t.id, t.source])).toEqual([['day', 'built-in']]);
    expect(themes[0]?.rawJson).toBe(builtinDay);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ themeId: 'day', rule: 'color-token' });
  });
});

describe('docs/*/vellumstyle-schema.md contra el contrato', () => {
  for (const docFile of DOC_FILES) {
    const rel = path.relative(REPO_ROOT, docFile);
    const doc = readFileSync(docFile, 'utf-8');

    it(`${rel}: cada bloque json de tema pasa ajv y loadThemes`, () => {
      expectThemeBlocksLoad(rel, doc);
    });

    it(`${rel}: menciona cada regla de diagnóstico`, () => {
      expectMentionsEveryRule(rel, doc);
    });

    it(`${rel}: el título declara la versión actual del schema`, () => {
      const title = doc.split('\n', 1)[0] ?? '';
      expect(title).toContain(`(v${CURRENT_SCHEMA_VERSION})`);
    });

    it(`${rel}: apunta a los fixtures de compatibilidad`, () => {
      expect(doc).toContain('packages/theme-engine/fixtures');
    });
  }
});

describe('ejemplos oficiales (packages/theme-engine/examples)', () => {
  const examples = readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith('.vellumstyle'))
    .sort()
    .map((f) => ({
      id: f.replace(/\.vellumstyle$/, ''),
      rawJson: readFileSync(path.join(EXAMPLES_DIR, f), 'utf-8'),
    }));

  it('examples/ no está vacío', () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  function example(name: string): Record<string, unknown> {
    const found = examples.find((e) => e.id === name);
    if (!found) throw new Error(`falta examples/${name}.vellumstyle`);
    return JSON.parse(found.rawJson) as Record<string, unknown>;
  }

  /** El tema cargado sin los campos que dependen del texto crudo del archivo. */
  function comparable(rawJson: string, id: string) {
    const { themes, warnings } = loadThemes([userFile(id, rawJson)]);
    expect(warnings).toEqual([]);
    expect(themes).toHaveLength(1);
    const { rawJson: _raw, ...rest } = themes[0]! as unknown as Record<
      string,
      unknown
    >;
    delete rest.$schema;
    return rest;
  }

  for (const { id, rawJson } of examples) {
    describe(id, () => {
      const raw = JSON.parse(rawJson) as Record<string, unknown>;

      it('declara $schema y pasa ajv', () => {
        expect(raw.$schema).toBe(
          'https://raw.githubusercontent.com/sebas-tcotd/vellum/main/packages/theme-engine/vellumstyle.schema.json',
        );
        const validate = compiledValidator();
        expect(validate(raw), JSON.stringify(validate.errors)).toBe(true);
      });

      it('carga con loadThemes sin warnings, y quitar $schema no cambia el tema', () => {
        const withSchema = comparable(rawJson, id);
        const { $schema: _schema, ...withoutSchemaRaw } = raw;
        const withoutSchema = comparable(JSON.stringify(withoutSchemaRaw), id);
        expect(withoutSchema).toEqual(withSchema);
      });

      it('solo usa claves del contrato cartográfico', () => {
        expect(nonCartographicPaths(raw)).toEqual([]);
      });
    });
  }

  it('complete reproduce el tema Day con todos sus grupos', () => {
    const { name: _n, $schema: _s, ...complete } = example('complete');
    const { name: _dn, ...day } = JSON.parse(
      readFileSync(path.join(BUILTIN_THEMES_DIR, 'day.vellumstyle'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(complete).toEqual(day);
  });

  it('la comprobación "solo cartográfico" nombra la ruta ajena', () => {
    const paths = nonCartographicPaths({
      $schema: 'x',
      schemaVersion: 1,
      name: 'x',
      water: '#000',
      shell: { accent: '#ff0000' },
      roads: { highway: { generic: { fill: '#000', glow: '#fff' } } },
    });
    expect([...paths].sort()).toEqual(
      ['roads.highway.generic.glow', 'shell'].sort(),
    );
  });
});

describe('docs/*/creating-themes.md contra el contrato', () => {
  for (const guideFile of GUIDE_FILES) {
    const rel = path.relative(REPO_ROOT, guideFile);
    const doc = readFileSync(guideFile, 'utf-8');

    it(`${rel}: cada bloque json de tema pasa ajv y loadThemes`, () => {
      expectThemeBlocksLoad(rel, doc);
    });

    it(`${rel}: menciona cada regla de diagnóstico`, () => {
      expectMentionsEveryRule(rel, doc);
    });

    it(`${rel}: cita los textos del toast de su idioma`, () => {
      const lang = path.basename(path.dirname(guideFile));
      const quoted = [
        ...THEME_VALIDATION_RULES.map((rule) =>
          localeString(lang, `toasts.themeRule.${rule}`),
        ),
        // Solo el motivo: `{{file}}` varía y el prefijo es el mismo que `invalidTheme`.
        localeString(lang, 'toasts.invalidThemeJson').split(': ').at(-1) ?? '',
      ];
      for (const text of quoted) {
        expect(doc, `${rel} no cita «${text}»`).toContain(text);
      }
    });

    it(`${rel}: sus anclas apuntan a encabezados existentes`, () => {
      const reference = readFileSync(
        path.join(path.dirname(guideFile), 'vellumstyle-schema.md'),
        'utf-8',
      );
      const targets = {
        'vellumstyle-schema.md': headingAnchors(reference),
        '': headingAnchors(doc),
      };
      const links = [
        ...doc.matchAll(/\]\(((?:vellumstyle-schema\.md)?)#([^)\s]+)\)/g),
      ];
      expect(links.length).toBeGreaterThan(0);
      for (const [link, file, anchor] of links) {
        const anchors = targets[file as keyof typeof targets];
        expect(
          anchors.has(decodeURIComponent(anchor ?? '')),
          `${rel}: ${link} no apunta a ningún encabezado`,
        ).toBe(true);
      }
    });

    it(`${rel}: enlaza al schema, a los ejemplos y a la referencia`, () => {
      for (const needle of [
        'vellumstyle.schema.json',
        'packages/theme-engine/examples',
        'vellumstyle-schema.md',
      ]) {
        expect(doc, `${rel} no menciona ${needle}`).toContain(needle);
      }
    });
  }
});
