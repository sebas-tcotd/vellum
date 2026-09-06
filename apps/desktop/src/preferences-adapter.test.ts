import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPreferencesAdapter,
  type PreferencesStoreLike,
} from './preferences-adapter';

/**
 * Construye un store en memoria con las tres operaciones espiadas.
 *
 * @returns El store y sus spies.
 */
function fakeStore() {
  const values = new Map<string, unknown>([['selectedTheme', 'night']]);
  const store: PreferencesStoreLike = {
    get: <T>(key: string): Promise<T | undefined> =>
      Promise.resolve(values.get(key) as T | undefined),
    set: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    save: () => Promise.resolve(),
  };
  return { store, values };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createPreferencesAdapter — con store disponible', () => {
  it('lee, escribe y vuelca contra el store cargado', async () => {
    const { store, values } = fakeStore();
    const port = createPreferencesAdapter(() => Promise.resolve(store));

    await expect(port.get<string>('selectedTheme')).resolves.toBe('night');
    await port.set('preferredLanguage', 'es');
    await port.save();

    expect(values.get('preferredLanguage')).toBe('es');
  });

  it('carga el store una sola vez, por muchas operaciones que haya', async () => {
    const { store } = fakeStore();
    const load = vi.fn(() => Promise.resolve(store));
    const port = createPreferencesAdapter(load);

    await port.get('selectedTheme');
    await port.set('selectedTheme', 'day');
    await port.save();

    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('createPreferencesAdapter — carga fallida (NFR9)', () => {
  it('deja un puerto inerte: las lecturas resuelven undefined', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const port = createPreferencesAdapter(() =>
      Promise.reject(new Error('preferences.json corrupto')),
    );

    await expect(port.get<string>('selectedTheme')).resolves.toBeUndefined();
  });

  it('las escrituras y el volcado no lanzan', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const port = createPreferencesAdapter(() =>
      Promise.reject(new Error('preferences.json corrupto')),
    );

    await expect(port.set('preferredLanguage', 'es')).resolves.toBeUndefined();
    await expect(port.save()).resolves.toBeUndefined();
  });

  it('loguea el fallo una sola vez, aunque se opere muchas veces', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const port = createPreferencesAdapter(() =>
      Promise.reject(new Error('preferences.json corrupto')),
    );

    await port.get('selectedTheme');
    await port.set('selectedTheme', 'day');
    await port.save();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
