import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from './test-utils';
import { App } from './App';
import { useVellumStore } from './store/vellum-store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('./i18n/i18n-setup', () => ({
  initI18n: vi.fn().mockResolvedValue('en'),
}));

vi.mock('./components/canvas/CanvasRoot', () => ({
  CanvasRoot: () => <div data-testid="canvas-root" />,
}));

vi.mock('./components/empty-state/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));

vi.mock('./components/overlays/ProgressBar', () => ({
  ProgressBar: () => <div data-testid="progress-bar" role="progressbar" />,
}));

vi.mock('./hooks/use-keyboard-shortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('./i18n/types', () => ({}));

function resetStore() {
  useVellumStore.setState({
    cityData: null,
    loadingState: 'idle',
    loadingError: null,
    loadRequestId: 0,
  });
}

beforeEach(() => {
  cleanup();
  resetStore();
});

describe('App — renderizado condicional', () => {
  it('muestra EmptyState cuando loadingState es idle y no hay cityData', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.queryByTestId('progress-bar')).toBeNull();
  });

  it('muestra ProgressBar cuando loadingState es loading', async () => {
    await act(async () => {
      render(<App />);
    });

    act(() => {
      useVellumStore.getState().setLoadingState('loading');
    });

    expect(screen.getByTestId('progress-bar')).toBeDefined();
    expect(screen.queryByTestId('empty-state')).toBeNull();
  });

  it('no muestra ProgressBar cuando loadingState es idle', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.queryByTestId('progress-bar')).toBeNull();
  });

  it('el canvas wrapper tiene opacity-0 cuando no hay cityData', async () => {
    await act(async () => {
      render(<App />);
    });
    const canvasWrapper = screen.getByTestId('canvas-root').parentElement;
    expect(canvasWrapper?.className).toContain('opacity-0');
  });

  it('el canvas wrapper tiene opacity-100 cuando hay cityData', async () => {
    await act(async () => {
      render(<App />);
    });

    act(() => {
      useVellumStore.getState().setCityData({
        cityName: 'Test City',
        landTiles: [],
        waterTiles: [],
        roadSegments: [],
        transitLines: [],
        buildings: [],
        forestCells: [],
        districts: [],
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      });
    });

    const canvasWrapper = screen.getByTestId('canvas-root').parentElement;
    expect(canvasWrapper?.className).toContain('opacity-100');
  });
});
