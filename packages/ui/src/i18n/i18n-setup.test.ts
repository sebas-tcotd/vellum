import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectInitialLanguage } from './i18n-setup';

describe('detectInitialLanguage (FR42)', () => {
  let navigatorLanguageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    navigatorLanguageSpy = vi.spyOn(navigator, 'language', 'get');
  });

  afterEach(() => {
    navigatorLanguageSpy.mockRestore();
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
});
