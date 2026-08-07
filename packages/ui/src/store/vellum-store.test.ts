import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { useVellumStore } from './vellum-store';
import { initI18n, i18n } from '../i18n/i18n-setup';

describe('vellum-store — setLanguage (NFR16 hot-swap)', () => {
  beforeAll(async () => {
    await initI18n();
  });

  afterEach(async () => {
    // Restaura i18n, el store y localStorage al estado por defecto ('en') para que
    // este test no filtre estado hacia otros archivos de test que comparten el módulo.
    await i18n.changeLanguage('en');
    useVellumStore.setState({ activeLanguage: 'en' });
    localStorage.removeItem('preferredLanguage');
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
