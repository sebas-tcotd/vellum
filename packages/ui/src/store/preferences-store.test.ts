import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeMock = {
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
};
const loadMock = vi.fn();

vi.mock('@tauri-apps/plugin-store', () => ({
  load: (...args: unknown[]) => loadMock(...args),
}));

describe('preferences-store', () => {
  beforeEach(() => {
    vi.resetModules();
    storeMock.get.mockReset();
    storeMock.set.mockReset();
    storeMock.save.mockReset();
    loadMock.mockReset();
    loadMock.mockResolvedValue(storeMock);
  });

  it('returns all four keys when present and valid', async () => {
    storeMock.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        selectedTheme: 'night',
        activeLayers: {
          terrain: true,
          basemap: true,
          roads: false,
          transit: true,
          buildings: true,
          forests: true,
          districts: true,
        },
        preferredLanguage: 'es',
        autoUpdateEnabled: true,
      };
      return Promise.resolve(values[key]);
    });

    const { loadPersistedPreferences } = await import('./preferences-store');
    const prefs = await loadPersistedPreferences();

    expect(prefs.selectedTheme).toBe('night');
    expect(prefs.activeLayers?.roads).toBe(false);
    expect(prefs.preferredLanguage).toBe('es');
    expect(prefs.autoUpdateEnabled).toBe(true);
  });

  it('omits a key with an invalid type without affecting the others', async () => {
    storeMock.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        selectedTheme: 'day',
        autoUpdateEnabled: 'yes', // invalid: should be boolean
      };
      return Promise.resolve(values[key]);
    });

    const { loadPersistedPreferences } = await import('./preferences-store');
    const prefs = await loadPersistedPreferences();

    expect(prefs.selectedTheme).toBe('day');
    expect(prefs.autoUpdateEnabled).toBeUndefined();
  });

  it('returns {} without throwing when the store fails to load, and persistPreference does not throw either', async () => {
    loadMock.mockRejectedValue(new Error('corrupted file'));

    const { loadPersistedPreferences, persistPreference } =
      await import('./preferences-store');

    await expect(loadPersistedPreferences()).resolves.toEqual({});
    await expect(
      persistPreference('selectedTheme', 'day'),
    ).resolves.toBeUndefined();
  });

  it('persistPreference calls store.set() followed by store.save()', async () => {
    const calls: string[] = [];
    storeMock.set.mockImplementation(() => {
      calls.push('set');
      return Promise.resolve();
    });
    storeMock.save.mockImplementation(() => {
      calls.push('save');
      return Promise.resolve();
    });

    const { persistPreference } = await import('./preferences-store');
    await persistPreference('selectedTheme', 'night');

    expect(storeMock.set).toHaveBeenCalledWith('selectedTheme', 'night');
    expect(calls).toEqual(['set', 'save']);
  });
});
