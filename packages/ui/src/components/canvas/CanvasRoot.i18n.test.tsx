// packages/ui/src/components/canvas/CanvasRoot.i18n.test.tsx
// Integración con i18next real (sin mock) — verifica el aria-label traducido en
// inglés y español, no solo la clave (complementa CanvasRoot.test.tsx).
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render } from '../../test-utils';
import { CanvasRoot } from './CanvasRoot';
import { initI18n, i18n } from '../../i18n/i18n-setup';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';

describe('CanvasRoot — aria-label traducido (i18n real)', () => {
  beforeAll(async () => {
    await initI18n();
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('usa el string en inglés cuando el idioma activo es en', async () => {
    await i18n.changeLanguage('en');
    const { container } = render(<CanvasRoot />);
    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute('aria-label')).toBe(en.a11y.mapCanvas);
  });

  it('usa el string en español cuando el idioma activo es es', async () => {
    await i18n.changeLanguage('es');
    const { container } = render(<CanvasRoot />);
    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute('aria-label')).toBe(es.a11y.mapCanvas);
  });
});
