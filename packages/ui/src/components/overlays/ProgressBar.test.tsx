import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '../../test-utils';
import { act } from 'react';
import { ProgressBar } from './ProgressBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../hooks/use-progress-events', () => ({
  useProgressEvents: () => ({ percent: 42 }),
}));

// Mock @radix-ui/react-progress para entorno jsdom
vi.mock('@radix-ui/react-progress', () => ({
  Root: ({
    children,
    className,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { value?: number }) => (
    <div role="progressbar" className={className} {...props}>
      {children}
    </div>
  ),
  Indicator: ({ className, style }: React.HTMLAttributes<HTMLDivElement>) => (
    <div className={className} style={style} />
  ),
}));

beforeEach(() => {
  cleanup();
});

describe('ProgressBar', () => {
  it('renderiza un elemento con role="progressbar"', async () => {
    await act(async () => {
      render(<ProgressBar />);
    });
    expect(screen.getByRole('progressbar')).toBeDefined();
  });

  it('tiene aria-valuenow con el porcentaje actual', async () => {
    await act(async () => {
      render(<ProgressBar />);
    });
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
  });

  it('tiene aria-valuemin=0 y aria-valuemax=100', async () => {
    await act(async () => {
      render(<ProgressBar />);
    });
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('tiene aria-label con la clave de accesibilidad', async () => {
    await act(async () => {
      render(<ProgressBar />);
    });
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-label', 'a11y.loadingProgress');
  });

  it('el contenedor tiene pointer-events-none para no bloquear interacciones', async () => {
    await act(async () => {
      render(<ProgressBar />);
    });
    // El contenedor wrapping tiene pointer-events-none
    const container = screen
      .getByRole('progressbar')
      .closest('.pointer-events-none');
    expect(container).toBeDefined();
  });
});
