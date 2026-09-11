import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawThemeFile } from '@vellum/core';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
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
      const blocks = [...doc.matchAll(/```json\r?\n([\s\S]*?)```/g)].map(
        (m) => m[1]!,
      );
      let themeBlocks = 0;
      for (const block of blocks) {
        const parsed: unknown = JSON.parse(block);
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed) ||
          !('name' in parsed)
        ) {
          continue;
        }
        themeBlocks++;
        const validate = compiledValidator();
        expect(
          validate(parsed),
          `${block}\n${JSON.stringify(validate.errors)}`,
        ).toBe(true);
        const { warnings } = loadThemes([userFile('doc', block)]);
        expect(warnings, block).toEqual([]);
      }
      expect(
        themeBlocks,
        `${rel} no tiene ningún ejemplo de tema`,
      ).toBeGreaterThan(0);
    });

    it(`${rel}: menciona cada regla de diagnóstico`, () => {
      for (const rule of THEME_VALIDATION_RULES) {
        expect(doc, `${rel} no documenta \`${rule}\``).toContain(`\`${rule}\``);
      }
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
