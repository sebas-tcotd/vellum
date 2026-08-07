import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

const persistPreferenceMock = vi.fn();
vi.mock('./preferences-store', () => ({
  persistPreference: (...args: unknown[]) => persistPreferenceMock(...args),
  loadPersistedPreferences: () => Promise.resolve({}),
}));

import { useVellumStore } from './vellum-store';
import { initI18n, i18n } from '../i18n/i18n-setup';

describe('vellum-store — setLanguage (NFR16 hot-swap)', () => {
  beforeAll(async () => {
    await initI18n();
  });

  afterEach(async () => {
    // Restaura i18n y el store al estado por defecto ('en') para que este test
    // no filtre estado hacia otros archivos de test que comparten el módulo.
    await i18n.changeLanguage('en');
    useVellumStore.setState({ activeLanguage: 'en' });
  });

  it('cambia i18next.language de forma inmediata y sincroniza activeLanguage', () => {
    useVellumStore.getState().setLanguage('es');

    expect(i18n.language).toBe('es');
    expect(useVellumStore.getState().activeLanguage).toBe('es');

    useVellumStore.getState().setLanguage('en');

    expect(i18n.language).toBe('en');
    expect(useVellumStore.getState().activeLanguage).toBe('en');
  });
});

describe('vellum-store — persistencia de preferencias (Story 7.2)', () => {
  beforeEach(() => {
    persistPreferenceMock.mockReset();
  });

  it('setActiveTheme persiste selectedTheme con la key y valor correctos', () => {
    useVellumStore.getState().setActiveTheme('night');

    expect(persistPreferenceMock).toHaveBeenCalledWith(
      'selectedTheme',
      'night',
    );
    expect(useVellumStore.getState().activeTheme).toBe('night');
  });

  it('toggleLayer persiste activeLayers con la key y valor correctos', () => {
    const before = useVellumStore.getState().activeLayers;
    useVellumStore.getState().toggleLayer('roads');
    const after = useVellumStore.getState().activeLayers;

    expect(after.roads).toBe(!before.roads);
    expect(persistPreferenceMock).toHaveBeenCalledWith('activeLayers', after);
  });

  it('setAutoUpdateEnabled persiste autoUpdateEnabled con la key y valor correctos', () => {
    useVellumStore.getState().setAutoUpdateEnabled(true);

    expect(persistPreferenceMock).toHaveBeenCalledWith(
      'autoUpdateEnabled',
      true,
    );
    expect(useVellumStore.getState().autoUpdateEnabled).toBe(true);
  });

  it('hydratePreferences actualiza el estado sin invocar persistPreference', () => {
    useVellumStore.getState().hydratePreferences({
      selectedTheme: 'transit',
      autoUpdateEnabled: true,
    });

    expect(useVellumStore.getState().activeTheme).toBe('transit');
    expect(useVellumStore.getState().autoUpdateEnabled).toBe(true);
    expect(persistPreferenceMock).not.toHaveBeenCalled();
  });
});
