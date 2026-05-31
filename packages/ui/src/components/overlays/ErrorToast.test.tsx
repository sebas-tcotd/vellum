import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test-utils';
import { ErrorToast } from './ErrorToast';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (opts?.found) return `${key}:${opts.found}`;
      return key;
    },
  }),
}));

describe('ErrorToast', () => {
  it('muestra clave i18n localizada para InvalidFile (no reason crudo)', () => {
    render(
      <ErrorToast
        error={{ type: 'InvalidFile', reason: 'raw internal error' }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'errors.InvalidFile',
    );
    expect(screen.getByRole('alert').textContent).not.toContain(
      'raw internal error',
    );
  });

  it('interpola el campo found para UnsupportedVersion', () => {
    render(
      <ErrorToast
        error={{ type: 'UnsupportedVersion', found: '3.0' }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'errors.UnsupportedVersion:3.0',
    );
  });

  it('llama onDismiss al hacer click en el botón de cerrar', () => {
    const onDismiss = vi.fn();
    render(
      <ErrorToast
        error={{ type: 'IoError', reason: 'file not found' }}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /common\.close/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('tiene role="alert" para accesibilidad', () => {
    render(
      <ErrorToast
        error={{ type: 'IoError', reason: 'err' }}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toBeDefined();
  });
});
