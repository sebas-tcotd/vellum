import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '../../test-utils';
import { act } from 'react';
import type { CityData } from '@vellum/core';
import { LoadingModal } from './LoadingModal';
import { useVellumStore } from '../../store/vellum-store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockUseProgressEvents = vi.fn(() => ({
  percent: 0,
  step: null as string | null,
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

function progress(percent: number, step: string | null) {
  mockUseProgressEvents.mockReturnValue({ percent, step, listenError: false });
}

async function renderModal() {
  await act(async () => {
    render(<LoadingModal />);
  });
  return screen.getByRole('progressbar');
}

beforeEach(() => {
  cleanup();
  progress(0, null);
  useVellumStore.setState({ isDrawingMap: false, cityData: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LoadingModal', () => {
  it('es un diálogo modal titulado', async () => {
    await renderModal();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('loading.title')).toBeDefined();
  });

  it('expone la barra con su rango y etiqueta accesible', async () => {
    const bar = await renderModal();
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-label', 'a11y.loadingProgress');
  });

  it('un .cslmap dice "Cargando cslmap" y el parser llena solo su parte de la barra', async () => {
    progress(50, 'parsing');
    const bar = await renderModal();
    expect(screen.getByText('loading.cslmap')).toBeDefined();
    expect(bar).toHaveAttribute('aria-valuenow', '15');
  });

  it('un .vellummap nombra el paso actual del lector', async () => {
    progress(20, 'terrain');
    await renderModal();
    expect(screen.getByText('loading.terrain')).toBeDefined();
  });

  it('tras el parser, dice "Dibujando el mapa" hasta que el mapa termina', async () => {
    progress(100, 'done');
    useVellumStore.setState({
      isDrawingMap: true,
      cityData: { source: 'vellummap' } as CityData,
    });
    const bar = await renderModal();
    expect(screen.getByText('loading.drawing')).toBeDefined();
    expect(bar).toHaveAttribute('aria-valuenow', '95');
  });

  it('un .cslmap sigue diciendo "Cargando cslmap" mientras se dibuja', async () => {
    useVellumStore.setState({
      isDrawingMap: true,
      cityData: { source: 'cslmap' } as CityData,
    });
    await renderModal();
    expect(screen.getByText('loading.cslmap')).toBeDefined();
  });
});
