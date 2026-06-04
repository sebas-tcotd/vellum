import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from './test-utils';
import { App } from './App';
import { useVellumStore } from './store/vellum-store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('./components/overlays/ErrorToast', () => ({
  ErrorToast: ({ error }: { error: { type: string } }) => (
    <div data-testid="error-toast" data-type={error.type} role="alert" />
  ),
}));

vi.mock('./components/overlays/PartialParseDialog', () => ({
  PartialParseDialog: () => (
    <div data-testid="partial-parse-dialog" role="dialog" />
  ),
}));

vi.mock('./components/overlays/DlcWarningToast', () => ({
  DlcWarningToast: () => <div data-testid="dlc-warning-toast" role="status" />,
}));

// Mock Radix Dialog to avoid portal issues in jsdom
vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Overlay: () => null,
  Content: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  Description: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  Close: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Footer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Header: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('./i18n/i18n-setup', () => ({
  initI18n: vi.fn().mockResolvedValue('en'),
}));

vi.mock('./components/canvas/CanvasRoot', () => ({
  CanvasRoot: () => <div data-testid="canvas-root" />,
}));

vi.mock('./components/canvas/MapLibreRoot', () => ({
  MapLibreRoot: () => <div data-testid="maplibre-root" />,
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

const mockCityData = {
  cityName: 'Test City',
  landTiles: [],
  waterTiles: [],
  roadSegments: [],
  transitLines: [],
  buildings: [],
  forestCells: [],
  districts: [],
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
};

function resetStore() {
  useVellumStore.setState({
    cityData: null,
    loadingState: 'idle',
    loadingError: null,
    loadRequestId: 0,
    dlcWarnings: [],
    hasPartialData: false,
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

  it('muestra EmptyState cuando loadingState es error (no pantalla en blanco)', async () => {
    await act(async () => {
      render(<App />);
    });

    act(() => {
      useVellumStore
        .getState()
        .setLoadingState('error', { type: 'IoError', reason: 'fail' });
    });

    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.queryByTestId('progress-bar')).toBeNull();
  });

  it('el canvas wrapper tiene opacity-0 cuando no hay cityData', async () => {
    await act(async () => {
      render(<App />);
    });
    const canvasWrapper = screen.getByTestId('canvas-wrapper');
    expect(canvasWrapper.className).toContain('opacity-0');
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

    const canvasWrapper = screen.getByTestId('canvas-wrapper');
    expect(canvasWrapper.className).toContain('opacity-100');
  });
});

describe('App — error overlays (Story 2.5)', () => {
  it('muestra ErrorToast cuando loadingState=error y type!=PartialParse', async () => {
    await act(async () => {
      render(<App />);
    });

    act(() => {
      useVellumStore
        .getState()
        .setLoadingState('error', { type: 'IoError', reason: 'disk fail' });
    });

    expect(screen.getByTestId('error-toast')).toBeDefined();
    expect(screen.queryByTestId('partial-parse-dialog')).toBeNull();
  });

  it('muestra PartialParseDialog cuando loadingState=error y type=PartialParse', async () => {
    await act(async () => {
      render(<App />);
    });

    act(() => {
      useVellumStore.getState().setLoadingState('error', {
        type: 'PartialParse',
        warnings: ['section X'],
      });
    });

    expect(screen.getByTestId('partial-parse-dialog')).toBeDefined();
    expect(screen.queryByTestId('error-toast')).toBeNull();
  });

  it('muestra DlcWarningToast cuando hay dlcWarnings y cityData cargado', async () => {
    await act(async () => {
      render(<App />);
    });

    act(() => {
      useVellumStore.getState().setCityData(mockCityData);
      useVellumStore.getState().setDlcWarnings(['Unknown ItemClass foo']);
    });

    expect(screen.getByTestId('dlc-warning-toast')).toBeDefined();
  });

  it('muestra DlcWarningToast cuando hasPartialData=true y cityData cargado', async () => {
    await act(async () => {
      render(<App />);
    });

    act(() => {
      useVellumStore.getState().setCityData(mockCityData);
      useVellumStore.getState().setHasPartialData(true);
    });

    expect(screen.getByTestId('dlc-warning-toast')).toBeDefined();
  });

  it('no muestra ningún overlay de error cuando loadingState=idle sin error', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByTestId('error-toast')).toBeNull();
    expect(screen.queryByTestId('partial-parse-dialog')).toBeNull();
    expect(screen.queryByTestId('dlc-warning-toast')).toBeNull();
  });
});
