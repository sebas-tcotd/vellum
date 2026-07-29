import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { ExportSnapshot, RasterExportV2 } from '@vellum/core';
import { render, screen, cleanup, act, waitFor } from './test-utils';
import { App } from './App';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
import { useVellumStore } from './store/vellum-store';

const mockPreviewCapture = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    dataUrl: 'data:image/png;base64,viewport',
    bearingDegrees: 0,
    scale: { distanceMeters: 500, widthPercent: 20 },
    annotations: [],
  }),
);

const mockSnapshot = {} as ExportSnapshot;
const mockRasterExporter: RasterExportV2 = {
  version: 2,
  capabilities: vi.fn().mockResolvedValue({
    legacy: { eligible: true },
    tiled: { eligible: false, reason: 'flag' },
  }),
  export: vi.fn().mockResolvedValue({
    filePath: '/tmp/export.png',
    folderPath: '/tmp',
  }),
};

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
  MapLibreRoot: ({
    previewCaptureRef,
    snapshotCaptureRef,
  }: {
    previewCaptureRef?: React.RefObject<
      | (() => Promise<import('@vellum/core').ExportPreviewSnapshot | null>)
      | null
    >;
    snapshotCaptureRef?: React.RefObject<
      | ((
          request: import('@vellum/core').ExportRequest,
        ) => ExportSnapshot | null)
      | null
    >;
  }) => {
    if (previewCaptureRef) {
      previewCaptureRef.current = mockPreviewCapture;
    }
    if (snapshotCaptureRef) {
      snapshotCaptureRef.current = () => mockSnapshot;
    }
    return <div data-testid="maplibre-root" />;
  },
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

vi.mock('./hooks/use-themes', () => ({
  useThemes: () => [],
}));

vi.mock('./i18n/types', () => ({}));

const mockCityData = {
  cityName: 'Test City',
  fileName: 'test-city.cslmap',
  generatedAt: '2024-01-01',
  landPolygon: [],
  inlandWaterPolygons: [],
  terrainBands: [],
  roadNodes: [],
  roadSegments: [],
  transitLines: [],
  buildings: [],
  forestCells: [],
  districts: [],
  parkAreas: [],
  bounds: { minX: -8640, maxX: 8640, minZ: -8640, maxZ: 8640, seaLevel: 40 },
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
  vi.mocked(useKeyboardShortcuts).mockClear();
  mockPreviewCapture.mockReset();
  mockPreviewCapture.mockResolvedValue({
    dataUrl: 'data:image/png;base64,viewport',
    bearingDegrees: 0,
    scale: { distanceMeters: 500, widthPercent: 20 },
    annotations: [],
  });
  vi.mocked(mockRasterExporter.capabilities).mockClear();
  vi.mocked(mockRasterExporter.export).mockClear();
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
        fileName: 'test-city.cslmap',
        generatedAt: '2024-01-01',
        landPolygon: [],
        inlandWaterPolygons: [],
        terrainBands: [],
        roadNodes: [],
        roadSegments: [],
        transitLines: [],
        buildings: [],
        forestCells: [],
        districts: [],
        parkAreas: [],
        bounds: {
          minX: -8640,
          maxX: 8640,
          minZ: -8640,
          maxZ: 8640,
          seaLevel: 40,
        },
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

describe('App — document.title (AC1)', () => {
  it('document.title es "Vellum" cuando no hay cityData', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(document.title).toBe('Vellum');
  });

  it('document.title es "Vellum — Test City" cuando hay cityData', async () => {
    await act(async () => {
      render(<App />);
    });

    act(() => {
      useVellumStore.getState().setCityData(mockCityData);
    });

    expect(document.title).toBe('Vellum — Test City');
  });
});

describe('App — ExportDialog (Story 6.1)', () => {
  it('envía un snapshot tipado al coordinator sin entregar MapLibre a la UI', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    const shortcuts = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];

    await act(async () => shortcuts?.onOpenExport?.());
    const exportButtons = screen.getAllByRole('button', {
      name: 'export.exportButton',
    });
    await user.click(exportButtons.at(-1)!);

    await waitFor(() => {
      expect(mockRasterExporter.export).toHaveBeenCalledWith(mockSnapshot);
    });
  });

  it('no habilita apertura sin mapa cargado', async () => {
    await act(async () => {
      render(<App />);
    });

    const options = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
    expect(options?.onOpenExport).toBeUndefined();
  });

  it('abre el diálogo mediante el callback del atajo con mapa listo', async () => {
    useVellumStore.getState().setCityData(mockCityData);
    await act(async () => {
      render(<App />);
    });
    const options = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];

    await act(async () => options?.onOpenExport?.());

    expect(screen.getByLabelText('export.fileName')).toBeInTheDocument();
    expect(
      screen.getByTestId('export-preview').querySelector('img'),
    ).toHaveAttribute('src', 'data:image/png;base64,viewport');
    expect(vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0].enabled).toBe(
      false,
    );
  });

  it('no habilita apertura durante una exportación activa', async () => {
    useVellumStore.getState().setCityData(mockCityData);
    await act(async () => {
      render(<App isExporting />);
    });

    const options = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
    expect(options?.onOpenExport).toBeUndefined();
    expect(
      screen.getByRole('button', { name: 'export.exportButton' }),
    ).toBeDisabled();
  });

  it('no habilita apertura mientras se carga otro mapa', async () => {
    useVellumStore.getState().setCityData(mockCityData);
    useVellumStore.getState().setLoadingState('loading');
    await act(async () => {
      render(<App />);
    });

    const options = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
    expect(options?.onOpenExport).toBeUndefined();
  });

  it('cierra y descarta el preview al cambiar de mapa', async () => {
    useVellumStore.getState().setCityData(mockCityData);
    await act(async () => {
      render(<App />);
    });
    const options = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
    await act(async () => options?.onOpenExport?.());
    expect(screen.getByLabelText('export.fileName')).toBeInTheDocument();

    act(() => {
      useVellumStore.getState().incrementLoadRequestId();
      useVellumStore.getState().setCityData({
        ...mockCityData,
        cityName: 'Second City',
      });
    });

    expect(screen.queryByLabelText('export.fileName')).toBeNull();
  });

  it('no abre el diálogo si la exportación comienza durante la captura', async () => {
    let resolveCapture:
      | ((value: import('@vellum/core').ExportPreviewSnapshot) => void)
      | undefined;
    mockPreviewCapture.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCapture = resolve;
      }),
    );
    useVellumStore.getState().setCityData(mockCityData);
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(<App />);
    });
    const options = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
    const opening = options?.onOpenExport?.();

    await act(async () => {
      view?.rerender(<App isExporting />);
    });
    await act(async () => {
      resolveCapture?.({
        dataUrl: 'data:image/png;base64,late',
        bearingDegrees: 0,
        scale: { distanceMeters: 500, widthPercent: 20 },
        annotations: [],
      });
      await opening;
    });

    expect(screen.queryByLabelText('export.fileName')).toBeNull();
  });
});
