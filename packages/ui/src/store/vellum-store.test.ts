import { describe, it, expect, beforeAll } from 'vitest';
import { useVellumStore } from './vellum-store';
import { initI18n, i18n } from '../i18n/i18n-setup';

describe('vellum-store — setLanguage (NFR16 hot-swap)', () => {
  beforeAll(async () => {
    await initI18n();
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
