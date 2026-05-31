import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '../../test-utils';
import { DlcWarningToast } from './DlcWarningToast';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DlcWarningToast', () => {
  it('muestra el mensaje toasts.partialLoad para warnings de DLC', () => {
    render(<DlcWarningToast onDismiss={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain(
      'toasts.partialLoad',
    );
  });

  it('muestra el mensaje toasts.partialDataWarning cuando isPartialData=true', () => {
    render(<DlcWarningToast isPartialData onDismiss={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain(
      'toasts.partialDataWarning',
    );
  });

  it('auto-dismiss llama onDismiss después de 6 segundos (modo DLC)', () => {
    const onDismiss = vi.fn();
    render(<DlcWarningToast onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('NO auto-dismiss cuando isPartialData=true (AC3)', () => {
    const onDismiss = vi.fn();
    render(<DlcWarningToast isPartialData onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('tiene role="status" para accesibilidad', () => {
    render(<DlcWarningToast onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('botón de cierre manual llama onDismiss', () => {
    const onDismiss = vi.fn();
    render(<DlcWarningToast onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /common\.close/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
