// packages/ui/src/components/overlays/ErrorToast.i18n.test.tsx
// Integración con i18next real (sin mock) — ErrorToast.test.tsx sólo verifica
// qué clave se elige, así que una clave ausente en es.json caería al inglés sin
// que nada fallara: sólo en.json está tipado por i18n/types.ts.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen } from '../../test-utils';
import { ErrorToast } from './ErrorToast';
import { initI18n, i18n } from '../../i18n/i18n-setup';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';

describe('ErrorToast — mensajes de versión traducidos (i18n real)', () => {
  beforeAll(async () => {
    await initI18n();
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('resuelve MissingVersion en ambos idiomas cuando found viene vacío', async () => {
    const { rerender } = render(
      <ErrorToast
        error={{ type: 'UnsupportedVersion', found: '' }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      en.errors.MissingVersion,
    );

    await i18n.changeLanguage('es');
    rerender(
      <ErrorToast
        error={{ type: 'UnsupportedVersion', found: '' }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      es.errors.MissingVersion,
    );
    expect(es.errors.MissingVersion).not.toBe(en.errors.MissingVersion);
  });

  it('interpola la versión encontrada cuando sí viene declarada', () => {
    render(
      <ErrorToast
        error={{ type: 'UnsupportedVersion', found: '3.0' }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('3.0');
    expect(screen.getByRole('alert').textContent).not.toContain('{{found}}');
  });
});
