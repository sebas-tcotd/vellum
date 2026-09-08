/**
 * La garantía de privacidad de la Story 1.8 (AC4) se apoya en que dos lados
 * nombren lo mismo: Rust lee `autoUpdateEnabled` de `preferences.json` antes de
 * abrir la única conexión de la app, y el frontend escribe esa clave en ese
 * archivo. Los tests de cada lado usan su propia constante, así que un rename
 * en uno dejaba al otro leyendo `None` —y `None` significa "sí, comprobá"—:
 * el switch se apagaba y la conexión seguía abriéndose, sin ningún check rojo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const read = (relative: string) =>
  readFileSync(path.join(REPO_ROOT, relative), 'utf8');

describe('contrato de preferencias entre Rust y el frontend', () => {
  const lib = read('apps/desktop/src-tauri/src/lib.rs');

  it('Rust lee la misma clave que el store persiste', () => {
    const key = lib.match(
      /const AUTO_UPDATE_PREFERENCE_KEY: &str = "([^"]+)"/,
    )?.[1];
    expect(key).toBe('autoUpdateEnabled');
    expect(read('packages/ui/src/store/vellum-store.ts')).toContain(
      "persistPreference('autoUpdateEnabled'",
    );
  });

  it('Rust abre el mismo archivo de store que el adapter del frontend', () => {
    const file = lib.match(/store_builder\("([^"]+)"\)/)?.[1];
    expect(file).toBe('preferences.json');
    expect(read('apps/desktop/src/main.tsx')).toContain(
      "load('preferences.json'",
    );
  });

  it('el store de Rust no auto-guarda, para no ganarle a las opciones del frontend', () => {
    // `StoreBuilder::build` devuelve un store ya registrado tal cual: un
    // auto_save distinto acá se impondría en silencio sobre `{ autoSave: false }`.
    expect(lib).toMatch(
      /store_builder\("preferences\.json"\)[\s\S]{0,120}disable_auto_save\(\)/,
    );
  });

  it('la comprobación de arranque está condicionada, no incondicional', () => {
    expect(lib).toMatch(/if startup_update_check_enabled\(app\.handle\(\)\)/);
  });
});
