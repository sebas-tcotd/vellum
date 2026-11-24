import assert from 'node:assert/strict';
import { describe, it, afterEach, vi } from 'vitest';

const persistPreferenceMock = vi.fn();
vi.mock('./preferences-store', () => ({
  persistPreference: (...args: unknown[]) => persistPreferenceMock(...args),
  loadPersistedPreferences: () => Promise.resolve({}),
}));

import { useVellumStore } from './vellum-store';

describe('vellum-store — startup theme hydration ordering', () => {
  afterEach(() => {
    useVellumStore.setState({
      activeTheme: 'day',
      availableThemes: [],
    });
  });

  it('falls back when a deleted persisted theme is hydrated after themes load', () => {
    const themes = [
      { id: 'day', name: 'Day' },
      { id: 'night', name: 'Night' },
    ] as Parameters<
      ReturnType<typeof useVellumStore.getState>['setAvailableThemes']
    >[0];

    useVellumStore.setState({ activeTheme: 'day', availableThemes: [] });
    useVellumStore.getState().setAvailableThemes(themes);
    useVellumStore.getState().hydratePreferences({
      selectedTheme: 'deleted-theme',
    });

    const { activeTheme, availableThemes } = useVellumStore.getState();
    assert.ok(
      availableThemes.some((theme) => theme.id === activeTheme),
      'Hydration must keep the active theme within the loaded theme list',
    );
  });
});
