import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '../../test-utils';
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

  it('auto-dismiss llama onDismiss después de 6 segundos', () => {
    const onDismiss = vi.fn();
    render(<DlcWarningToast onDismiss={onDismiss} />);
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('tiene role="status" para accesibilidad', () => {
    render(<DlcWarningToast onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toBeDefined();
  });
});
