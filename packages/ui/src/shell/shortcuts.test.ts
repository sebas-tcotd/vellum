import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { SHORTCUTS, matchShortcut } from './shortcuts';

const menuRs = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../apps/desktop/src-tauri/src/menu.rs',
  ),
  'utf-8',
);

// Exit is the OS's Quit key (Windows/Linux only); the webview never handles it.
const OS_OWNED = new Set(['CmdOrCtrl+Q']);

/** Every accelerator string `menu.rs` declares outside its own tests. */
function menuAccelerators(): Set<string> {
  const source = menuRs.slice(0, menuRs.indexOf('#[cfg(test)]'));
  const found = source.matchAll(
    /"((?:(?:CmdOrCtrl|Shift|Alt)\+)*(?:Key[A-Z]|Digit\d|Equal|Minus|Comma|Arrow(?:Left|Right|Up|Down)|[A-Z]))"/g,
  );
  return new Set([...found].map((m) => m[1]!).filter((a) => !OS_OWNED.has(a)));
}

const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('SHORTCUTS', () => {
  it('declares exactly the accelerators of the native menu', () => {
    const table = new Set(
      SHORTCUTS.flatMap((s) => (s.accelerator ? [s.accelerator] : [])),
    );
    expect([...table].sort()).toEqual([...menuAccelerators()].sort());
  });

  it('gives every shortcut a unique id', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('matches Shift+digit from the main row, where Shift rewrites the key', () => {
    expect(
      matchShortcut(press({ key: '!', code: 'Digit1', shiftKey: true }))?.id,
    ).toBe('layer.detail.terrain');
    expect(
      matchShortcut(press({ key: '1', code: 'Numpad1', shiftKey: true }))?.id,
    ).toBe('layer.detail.terrain');
    expect(matchShortcut(press({ key: '&', code: 'Digit1' }))?.id).toBe(
      'layer.toggle.terrain',
    );
  });

  it('matches Option+Z on macOS, where Option rewrites the key', () => {
    expect(
      matchShortcut(
        press({ key: 'Ω', code: 'KeyZ', metaKey: true, altKey: true }),
      )?.id,
    ).toBe('preciseZoom');
  });

  it('does not match when an extra modifier is held', () => {
    expect(matchShortcut(press({ key: 'h', ctrlKey: true }))).toBeUndefined();
    expect(
      matchShortcut(press({ key: 'o', ctrlKey: true, shiftKey: true })),
    ).toBeUndefined();
  });
});
