import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { detectInitialLanguage, i18n, initI18n } from './i18n-setup';
import { useVellumStore } from '../store/vellum-store';

describe('detectInitialLanguage (FR42)', () => {
  let navigatorLanguageSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    // setLanguage() internamente llama i18n.changeLanguage(), que requiere init previo.
    await initI18n();
  });

  beforeEach(() => {
    localStorage.clear();
    navigatorLanguageSpy = vi.spyOn(navigator, 'language', 'get');
  });

  afterEach(() => {
    navigatorLanguageSpy.mockRestore();
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
    useVellumStore.setState({ activeLanguage: 'en' });
    localStorage.removeItem('preferredLanguage');
  });

  it('prioriza la selección manual guardada sobre el locale del OS', async () => {
    localStorage.setItem('preferredLanguage', 'es');
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

  it('la selección manual vía setLanguage() prevalece tras un "reinicio" simulado con otro locale de OS', async () => {
    // Simula un reinicio: el usuario eligió 'es' manualmente en una sesión previa.
    navigatorLanguageSpy.mockReturnValue('en-US');
    useVellumStore.getState().setLanguage('es');

    // "Reinicio": initI18n() se re-ejecuta con un locale de OS distinto ('fr-FR').
    navigatorLanguageSpy.mockReturnValue('fr-FR');

    await expect(initI18n()).resolves.toBe('es');
    expect(i18n.language).toBe('es');
  });
});
