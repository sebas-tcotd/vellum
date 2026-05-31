import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '../../test-utils';
import { act } from 'react';
import { ProgressBar } from './ProgressBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseProgressEvents = vi.fn(() => ({
  percent: 42,
  listenError: false,
}));

vi.mock('../../hooks/use-progress-events', () => ({
  useProgressEvents: () => mockUseProgressEvents(),
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
  mockUseProgressEvents.mockReturnValue({ percent: 42, listenError: false });
});

afterEach(() => {
  vi.clearAllMocks();
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
    const container = screen.getByTestId('progress-bar-container');
    expect(container.className).toContain('pointer-events-none');
  });

  it('no renderiza nada cuando listenError es true', async () => {
    mockUseProgressEvents.mockReturnValue({ percent: 0, listenError: true });
    let container!: ReturnType<typeof render>['container'];
    await act(async () => {
      ({ container } = render(<ProgressBar />));
    });
    expect(container.firstChild).toBeNull();
  });
});
