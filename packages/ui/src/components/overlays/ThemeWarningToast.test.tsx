import {
  THEME_VALIDATION_RULES,
  type ThemeWarning,
} from '@vellum/theme-engine';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '../../test-utils';
import { ThemeWarningToast } from './ThemeWarningToast';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const fieldWarning: ThemeWarning = {
  themeId: 'grayscale-water',
  themeName: 'Grayscale + Water',
  field: 'roads.highway.generic.fill',
  rule: 'color-token',
};

const jsonWarning: ThemeWarning = {
  themeId: 'garbage',
  themeName: 'garbage',
  field: 'JSON',
};

describe('ThemeWarningToast', () => {
  it('usa la plantilla toasts.invalidTheme para un campo inválido (AC #5)', () => {
    render(<ThemeWarningToast warnings={[fieldWarning]} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain(
      'toasts.invalidTheme',
    );
  });

  it('pasa archivo, ruta y la regla localizada a la plantilla', () => {
    render(<ThemeWarningToast warnings={[fieldWarning]} onDismiss={vi.fn()} />);
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain('"file":"grayscale-water.vellumstyle"');
    expect(text).toContain('"field":"roads.highway.generic.fill"');
    expect(text).toContain('"reason":"toasts.themeRule.color-token"');
  });

  it('usa una razón genérica si el warning no trae regla', () => {
    const { rule: _omitted, ...withoutRule } = fieldWarning;
    render(<ThemeWarningToast warnings={[withoutRule]} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain(
      '"reason":"toasts.themeRule.unknown"',
    );
  });

  it('usa la plantilla toasts.invalidThemeJson para JSON malformado', () => {
    render(<ThemeWarningToast warnings={[jsonWarning]} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain(
      'toasts.invalidThemeJson {"file":"garbage.vellumstyle"}',
    );
  });

  it('renderiza una línea por cada warning', () => {
    render(
      <ThemeWarningToast
        warnings={[fieldWarning, jsonWarning]}
        onDismiss={vi.fn()}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.querySelectorAll('span:not([aria-hidden])')).toHaveLength(2);
  });

  it('auto-dismiss llama onDismiss después de 6 segundos', () => {
    const onDismiss = vi.fn();
    render(
      <ThemeWarningToast warnings={[fieldWarning]} onDismiss={onDismiss} />,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('botón de cierre manual llama onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      <ThemeWarningToast warnings={[fieldWarning]} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('el glyph de cierre es aria-hidden — el botón se anuncia solo por su aria-label', () => {
    render(<ThemeWarningToast warnings={[fieldWarning]} onDismiss={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'common.close' });
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('toasts.themeRule — paridad con THEME_VALIDATION_RULES', () => {
  for (const [lang, locale] of [
    ['en', en],
    ['es', es],
  ] as const) {
    it(`${lang} tiene una razón para cada regla del validador`, () => {
      const rules = locale.toasts.themeRule as Record<string, string>;
      for (const rule of THEME_VALIDATION_RULES) {
        expect(rules[rule], `${lang}: toasts.themeRule.${rule}`).toBeTruthy();
      }
    });

    it(`${lang} usa {{file}}, {{field}} y {{reason}} en toasts.invalidTheme`, () => {
      expect(locale.toasts.invalidTheme).toContain('{{field}}');
      expect(locale.toasts.invalidTheme).toContain('{{reason}}');
      expect(locale.toasts.invalidTheme).toContain('{{file}}');
      expect(locale.toasts.invalidThemeJson).toContain('{{file}}');
    });
  }
});
