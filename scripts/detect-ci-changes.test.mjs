import { describe, expect, it } from 'vitest';

import {
  CI_CATEGORIES,
  classifyPaths,
  parseNameStatus,
  resolveClassification,
} from './detect-ci-changes.mjs';

const all = (value) =>
  Object.fromEntries(CI_CATEGORIES.map((category) => [category, value]));

describe('clasificación de cambios de CI', () => {
  it('activa JS, frontend y E2E para la aplicación de escritorio', () => {
    expect(classifyPaths(['apps/desktop/src/main.tsx'])).toMatchObject({
      js: true,
      rust: false,
      frontend: true,
      e2e: true,
      compile: false,
      landing: false,
    });
  });

  it('activa Rust, checks nativos, frontend y E2E para el parser', () => {
    expect(classifyPaths(['packages/parser-cslmap/src/lib.rs'])).toMatchObject({
      rust: true,
      frontend: true,
      e2e: true,
      compile: true,
    });
  });

  it('mantiene un cambio de landing fuera del desktop', () => {
    expect(classifyPaths(['apps/landing/src/Hero.tsx'])).toEqual({
      ...all(false),
      landing: true,
    });
  });

  it('deja documentación y marca fuera de los jobs caros', () => {
    expect(classifyPaths(['docs/es/index.md', 'brand/logo.svg'])).toEqual(
      all(false),
    );
  });

  it('activa solo JS para la referencia del schema .vellumstyle', () => {
    for (const doc of [
      'docs/en/vellumstyle-schema.md',
      'docs/es/vellumstyle-schema.md',
    ]) {
      expect(classifyPaths([doc]), doc).toEqual({ ...all(false), js: true });
    }
    expect(classifyPaths(['docs/en/vellumstyle-schema-draft.md'])).toEqual(
      all(false),
    );
  });

  it('ejecuta todo ante cambios globales o de workflows', () => {
    expect(classifyPaths(['pnpm-lock.yaml'])).toEqual(all(true));
    expect(classifyPaths(['.github/workflows/ci.yml'])).toEqual(all(true));
  });

  it('activa landing y cada rama adicional en cambios mixtos', () => {
    expect(
      classifyPaths([
        'apps/landing/src/Hero.tsx',
        'apps/desktop/src/main.tsx',
        'apps/desktop/src-tauri/src/lib.rs',
      ]),
    ).toMatchObject({
      js: true,
      rust: true,
      frontend: true,
      e2e: true,
      compile: true,
      landing: true,
    });
  });

  it('marca manifests locales como cambios de dependencias', () => {
    expect(classifyPaths(['apps/landing/package.json'])).toMatchObject({
      js: false,
      landing: true,
      dependencies: true,
    });
  });

  it('activa la auditoría cuando cambia su implementación', () => {
    expect(classifyPaths(['scripts/audit-deps.mjs'])).toMatchObject({
      js: true,
      dependencies: true,
    });
  });

  it.each([
    'apps/desktop/src/main.tsx',
    'apps/desktop/src-tauri/src/lib.rs',
    'packages/parser-cslmap/src/lib.rs',
    'packages/ui/src/Button.tsx',
    '.github/workflows/ci.yml',
  ])('mantiene el invariante E2E implica frontend para %s', (path) => {
    const flags = classifyPaths([path]);
    expect(!flags.e2e || flags.frontend).toBe(true);
  });

  it('deja fuera de todo job caro al bootstrap dormido de ADR-0003', () => {
    expect(
      classifyPaths([
        'apps/desktop/src-tauri/installer-bootstrap/src/main.rs',
        'apps/desktop/src-tauri/installer-bootstrap/Cargo.toml',
      ]),
    ).toEqual(all(false));
  });

  it('sigue clasificando el resto de src-tauri como antes', () => {
    expect(classifyPaths(['apps/desktop/src-tauri/src/lib.rs'])).toMatchObject({
      rust: true,
      frontend: true,
      e2e: true,
      compile: true,
    });
  });

  it('rutea un tema built-in también a js (el schema solo lo valida Vitest)', () => {
    expect(
      classifyPaths([
        'apps/desktop/src-tauri/resources/themes/day.vellumstyle',
      ]),
    ).toMatchObject({
      js: true,
      rust: true,
      frontend: true,
      e2e: true,
      compile: true,
    });
  });

  it('falla cerrado para rutas nuevas desconocidas', () => {
    expect(classifyPaths(['tooling/new-system/config.toml'])).toEqual(
      all(true),
    );
  });
});

describe('resolución del diff', () => {
  it('usa merge-base para PR e incluye rutas eliminadas o renombradas', () => {
    const calls = [];
    const result = resolveClassification({
      base: 'base',
      head: 'head',
      mode: 'pull_request',
      runGit: (...args) => {
        calls.push(args);
        return {
          status: 0,
          stdout:
            'R100\0apps/desktop/src/old.tsx\0docs/old.tsx\0' +
            'A\0packages/ui/src/new.tsx\0',
          stderr: '',
        };
      },
    });

    expect(calls[0][1]).toContain('base...head');
    expect(calls[0][1]).toContain('--name-status');
    expect(calls[0][1]).toContain('-z');
    expect(calls[0][1]).toContain('--diff-filter=ACDMRTUXB');
    expect(result.paths).toHaveLength(3);
    expect(result.flags.e2e).toBe(true);
  });

  it('preserva nombres con saltos de línea y ambos lados de un rename', () => {
    expect(
      parseNameStatus(
        'R090\0apps/desktop/src/old.tsx\0docs/new\nname.tsx\0' +
          'D\0packages/ui/src/deleted.tsx\0',
      ),
    ).toEqual([
      'apps/desktop/src/old.tsx',
      'docs/new\nname.tsx',
      'packages/ui/src/deleted.tsx',
    ]);
  });

  it.each([
    ['apps/landing/src/old.tsx', 'docs/new.tsx'],
    ['docs/old.tsx', 'apps/landing/src/new.tsx'],
  ])('activa landing en un rename desde %s hacia %s', (from, to) => {
    const result = resolveClassification({
      base: 'base',
      head: 'head',
      mode: 'pull_request',
      runGit: () => ({
        status: 0,
        stdout: `R100\0${from}\0${to}\0`,
        stderr: '',
      }),
    });

    expect(result.flags.landing).toBe(true);
  });

  it('falla cerrado ante una salida name-status truncada', () => {
    const result = resolveClassification({
      base: 'base',
      head: 'head',
      mode: 'push',
      runGit: () => ({ status: 0, stdout: 'R100\0old.tsx\0', stderr: '' }),
    });
    expect(result.flags).toEqual(all(true));
    expect(result.fallbackReason).toContain('diff truncado');
  });

  it('activa todo cuando falta la revisión anterior de un push', () => {
    expect(
      resolveClassification({ base: '000000', head: 'head', mode: 'push' }),
    ).toMatchObject({ flags: all(true) });
  });

  it('activa todo cuando git diff falla', () => {
    const result = resolveClassification({
      base: 'base',
      head: 'head',
      mode: 'push',
      runGit: () => ({ status: 128, stdout: '', stderr: 'bad revision' }),
    });
    expect(result.flags).toEqual(all(true));
    expect(result.fallbackReason).toContain('bad revision');
  });

  it('no inventa cambios cuando un diff válido está vacío', () => {
    const result = resolveClassification({
      base: 'base',
      head: 'head',
      mode: 'push',
      runGit: () => ({ status: 0, stdout: '', stderr: '' }),
    });
    expect(result.flags).toEqual(all(false));
    expect(result.fallbackReason).toBe('');
  });
});
