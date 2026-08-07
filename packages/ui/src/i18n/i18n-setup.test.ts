import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

const loadPersistedPreferencesMock = vi.fn();
vi.mock('../store/preferences-store', () => ({
  loadPersistedPreferences: () => loadPersistedPreferencesMock(),
}));

import { detectInitialLanguage, i18n, initI18n } from './i18n-setup';

describe('detectInitialLanguage (FR42)', () => {
  let navigatorLanguageSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    loadPersistedPreferencesMock.mockResolvedValue({});
    await initI18n();
  });

  beforeEach(() => {
    loadPersistedPreferencesMock.mockReset();
    loadPersistedPreferencesMock.mockResolvedValue({});
    navigatorLanguageSpy = vi.spyOn(navigator, 'language', 'get');
  });

  afterEach(() => {
    navigatorLanguageSpy.mockRestore();
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('prioriza la selección manual guardada sobre el locale del OS', async () => {
    loadPersistedPreferencesMock.mockResolvedValue({ preferredLanguage: 'es' });
    navigatorLanguageSpy.mockReturnValue('en-US');

    await expect(detectInitialLanguage()).resolves.toBe('es');
  });

  it('sin preferencia guardada, usa el locale del OS cuando es español', async () => {
    navigatorLanguageSpy.mockReturnValue('es-MX');

    await expect(detectInitialLanguage()).resolves.toBe('es');
  });

  it('sin preferencia guardada y OS en otro idioma, usa el default en', async () => {
    navigatorLanguageSpy.mockReturnValue('fr-FR');

    await expect(detectInitialLanguage()).resolves.toBe('en');
  });
});
