import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { TOGGLABLE_TRANSIT_MODES } from '@vellum/core';

const menuRs = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../apps/desktop/src-tauri/src/menu.rs',
  ),
  'utf-8',
);

/** The transit option ids of one language's advanced-options table in `menu.rs`. */
function menuTransitIds(language: 'en' | 'es'): string[] {
  const source = menuRs.slice(0, menuRs.indexOf('#[cfg(test)]'));
  const start = source.indexOf(`"${language}" => vec![`);
  const block = source.slice(start, source.indexOf('],', start));
  return [...block.matchAll(/\("transit", "(\w+)", "[^"]*"\)/g)].map(
    (m) => m[1]!,
  );
}

// `isTransitMode` (use-menu-action.ts) drops an id it does not know without a
// word, so a typo in `menu.rs` would leave that checkbox doing nothing.
describe('native menu transit options', () => {
  it.each(['en', 'es'] as const)(
    'the %s menu offers exactly the togglable modes',
    (language) => {
      expect([...menuTransitIds(language)].sort()).toEqual(
        [...TOGGLABLE_TRANSIT_MODES].sort(),
      );
    },
  );
});
