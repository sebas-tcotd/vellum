import type { ThemeWarning } from '@vellum/theme-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '../../test-utils';
import { ThemeWarningToast } from './ThemeWarningToast';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

  it('usa la plantilla toasts.invalidThemeJson para JSON malformado', () => {
    render(<ThemeWarningToast warnings={[jsonWarning]} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain(
      'toasts.invalidThemeJson',
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
