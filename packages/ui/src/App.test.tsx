import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import type {
  ExportProgress,
  ExportSnapshot,
  RasterExportV2,
  SvgExportPort,
  SvgExportSnapshot,
} from '@vellum/core';
import { render, screen, cleanup, act, waitFor, fireEvent } from './test-utils';
import { App, type ExportCancelHandlerRef } from './App';
import { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts';
import { useVellumStore } from './store/vellum-store';

const mockUnlisten = vi.fn();
const mockListen = vi.hoisted(() => vi.fn());
const tauriEventHandlers = new Map<
  string,
  (event: { payload: unknown }) => void
>();

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockOpenUrl = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (...args: unknown[]) => mockOpenUrl(...args),
}));

const mockPreviewCapture = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    dataUrl: 'data:image/png;base64,viewport',
    width: 640,
    height: 480,
    bearingDegrees: 0,
    scale: { distanceMeters: 500, widthPercent: 20 },
    annotations: [],
  }),
);

const mockSnapshot = { snapshotId: 'snap-1' } as ExportSnapshot;
const mockSvgSnapshot = { snapshotId: 'svg-snap-1' } as SvgExportSnapshot;
const mockSvgExporter: SvgExportPort = {
  mode: 'streaming-svg',
  capabilitiesForSnapshot: vi.fn().mockReturnValue({ eligible: true }),
  export: vi.fn().mockResolvedValue({
    filePath: '/tmp/export.svg',
    folderPath: '/tmp',
  }),
};
const mockRasterExporter: RasterExportV2 = {
  version: 2,
  capabilities: vi.fn().mockResolvedValue({
    legacy: { eligible: true },
    tiled: { eligible: false, reason: 'flag' },
  }),
  capabilitiesForSnapshot: vi.fn().mockReturnValue({
    legacy: { eligible: true },
    tiled: { eligible: false, reason: 'flag' },
  }),
  export: vi.fn().mockResolvedValue({
    filePath: '/tmp/export.png',
    folderPath: '/tmp',
  }),
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { percent?: number }) => {
      if (key === 'export.phase.composing') return 'Composing output';
      if (key === 'export.progressPercent') return `${options?.percent ?? ''}%`;
      return key;
    },
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
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

vi.mock('./store/preferences-store', () => ({
  loadPersistedPreferences: vi.fn().mockResolvedValue({}),
}));

vi.mock('./components/canvas/CanvasRoot', () => ({
  CanvasRoot: () => <div data-testid="canvas-root" />,
}));

vi.mock('./components/canvas/MapLibreRoot', () => ({
  MapLibreRoot: ({
    previewCaptureRef,
    snapshotCaptureRef,
    svgSnapshotCaptureRef,
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
    svgSnapshotCaptureRef?: React.RefObject<
      | ((
          request: import('@vellum/core').SvgExportRequest,
        ) => SvgExportSnapshot | null)
      | null
    >;
  }) => {
    if (previewCaptureRef) {
      previewCaptureRef.current = mockPreviewCapture;
    }
    if (snapshotCaptureRef) {
      snapshotCaptureRef.current = () => mockSnapshot;
    }
    if (svgSnapshotCaptureRef) {
      svgSnapshotCaptureRef.current = () => mockSvgSnapshot;
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
    updateInfo: null,
  });
}

beforeEach(() => {
  cleanup();
  vi.mocked(useKeyboardShortcuts).mockClear();
  tauriEventHandlers.clear();
  mockListen.mockReset();
  mockListen.mockImplementation(
    (event: string, handler: (event: { payload: unknown }) => void) => {
      tauriEventHandlers.set(event, handler);
      return Promise.resolve(mockUnlisten);
    },
  );
  mockPreviewCapture.mockReset();
  mockPreviewCapture.mockResolvedValue({
    dataUrl: 'data:image/png;base64,viewport',
    width: 640,
    height: 480,
    bearingDegrees: 0,
    scale: { distanceMeters: 500, widthPercent: 20 },
    annotations: [],
  });
  vi.mocked(mockRasterExporter.capabilities).mockClear();
  vi.mocked(mockRasterExporter.export).mockClear();
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue(null);
  mockOpenUrl.mockReset();
  mockOpenUrl.mockResolvedValue(undefined);
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

describe('App — PreferencesPanel (Story 7.3)', () => {
  it('abre PreferencesPanel al recibir el evento vellum://open-preferences', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByText('preferences.title')).toBeNull();

    await act(async () => {
      tauriEventHandlers.get('vellum://open-preferences')?.({
        payload: undefined,
      });
    });

    expect(screen.getByText('preferences.title')).toBeInTheDocument();
  });

  it('registra y limpia el listener de preferencias', async () => {
    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith(
        'vellum://open-preferences',
        expect.any(Function),
      );
    });

    cleanup();
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it('permite abrir preferencias sin cityData cargado', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByTestId('empty-state')).toBeDefined();

    await act(async () => {
      tauriEventHandlers.get('vellum://open-preferences')?.({
        payload: undefined,
      });
    });

    expect(screen.getByText('preferences.title')).toBeInTheDocument();
  });
});

describe('App — UpdateToast (Story 7.4)', () => {
  it('AC2: no muestra el toast mientras loadingState=loading, aparece al volver a idle', async () => {
    await act(async () => {
      render(<App />);
    });

    act(() => {
      useVellumStore.getState().setLoadingState('loading');
    });

    await act(async () => {
      tauriEventHandlers.get('vellum://update-available')?.({
        payload: { version: '1.2.0', url: 'https://example.com/v1.2.0' },
      });
    });

    expect(screen.queryByText('updates.available')).toBeNull();

    act(() => {
      useVellumStore.getState().setLoadingState('idle');
    });

    expect(screen.getByText('updates.available')).toBeInTheDocument();
  });

  it('AC1: aparece de inmediato cuando el evento llega con loadingState=idle', async () => {
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      tauriEventHandlers.get('vellum://update-available')?.({
        payload: { version: '1.2.0', url: 'https://example.com/v1.2.0' },
      });
    });

    expect(screen.getByText('updates.available')).toBeInTheDocument();
  });

  it('recupera una actualización perdida vía get_pending_update si el evento llegó antes de montar el listener', async () => {
    mockInvoke.mockImplementation((command: string) =>
      command === 'get_pending_update'
        ? Promise.resolve({
            version: '1.2.0',
            url: 'https://example.com/v1.2.0',
          })
        : Promise.resolve(null),
    );

    await act(async () => {
      render(<App />);
    });

    expect(mockInvoke).toHaveBeenCalledWith('get_pending_update');
    expect(screen.getByText('updates.available')).toBeInTheDocument();
  });

  it('no consulta get_pending_update hasta que listen() resuelve (evita la carrera de arranque)', async () => {
    let resolveListen: ((fn: () => void) => void) | undefined;
    mockListen.mockReset();
    mockListen.mockImplementation(
      (event: string, handler: (event: { payload: unknown }) => void) => {
        tauriEventHandlers.set(event, handler);
        return new Promise<() => void>((resolve) => {
          resolveListen = resolve;
        });
      },
    );

    render(<App />);

    // listen() aún no resolvió — get_pending_update no debe haberse llamado todavía.
    await Promise.resolve();
    expect(mockInvoke).not.toHaveBeenCalledWith('get_pending_update');

    await act(async () => {
      resolveListen?.(mockUnlisten);
    });

    expect(mockInvoke).toHaveBeenCalledWith('get_pending_update');
  });

  it('no muestra el toast cuando get_pending_update resuelve null (nada pendiente)', async () => {
    mockInvoke.mockResolvedValue(null);

    await act(async () => {
      render(<App />);
    });

    expect(screen.queryByText('updates.available')).toBeNull();
  });

  it('no rompe el montaje si get_pending_update rechaza (best-effort)', async () => {
    mockInvoke.mockRejectedValue(new Error('no Tauri context'));

    await act(async () => {
      render(<App />);
    });

    expect(screen.getByTestId('empty-state')).toBeDefined();
    expect(screen.queryByText('updates.available')).toBeNull();
  });

  it('AC2: no muestra el toast mientras isExporting=true, aparece cuando vuelve a false', async () => {
    let renderResult!: ReturnType<typeof render>;
    await act(async () => {
      renderResult = render(<App isExporting />);
    });
    const { rerender } = renderResult;

    await act(async () => {
      tauriEventHandlers.get('vellum://update-available')?.({
        payload: { version: '1.2.0', url: 'https://example.com/v1.2.0' },
      });
    });

    expect(screen.queryByText('updates.available')).toBeNull();

    await act(async () => {
      rerender(<App isExporting={false} />);
    });

    expect(screen.getByText('updates.available')).toBeInTheDocument();
  });

  it('AC5: clic en "Ver novedades" llama openUrl con la URL de release notes', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      tauriEventHandlers.get('vellum://update-available')?.({
        payload: { version: '1.2.0', url: 'https://example.com/v1.2.0' },
      });
    });

    await user.click(
      screen.getByRole('button', { name: 'updates.viewChangelog' }),
    );

    expect(mockOpenUrl).toHaveBeenCalledWith('https://example.com/v1.2.0');
  });

  it('un rechazo de openUrl no rompe la UI (best-effort, sólo se loguea)', async () => {
    const user = userEvent.setup();
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    mockOpenUrl.mockRejectedValue(new Error('no default browser'));

    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      tauriEventHandlers.get('vellum://update-available')?.({
        payload: { version: '1.2.0', url: 'https://example.com/v1.2.0' },
      });
    });

    await act(async () => {
      await user.click(
        screen.getByRole('button', { name: 'updates.viewChangelog' }),
      );
    });

    expect(screen.getByText('updates.available')).toBeInTheDocument();
    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
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
      expect(mockRasterExporter.export).toHaveBeenCalledWith(
        mockSnapshot,
        expect.any(AbortSignal),
        expect.any(Function),
      );
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
        width: 640,
        height: 480,
        bearingDegrees: 0,
        scale: { distanceMeters: 500, widthPercent: 20 },
        annotations: [],
      });
      await opening;
    });

    expect(screen.queryByLabelText('export.fileName')).toBeNull();
  });
});

async function startExport(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const shortcuts = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
  await act(async () => shortcuts?.onOpenExport?.());
  const exportButtons = screen.getAllByRole('button', {
    name: 'export.exportButton',
  });
  await user.click(exportButtons.at(-1)!);
}

function makeAbortError(): Error {
  const error = new Error('Export aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Drives the dialog to the vector route, toggling the named presentation
 * options on the way.
 *
 * @remarks
 * Each label is *toggled*, not set — `showCityName` ships enabled, so a test
 * that wants a clean export has to switch it back off. Its only SVG output is
 * `<title>` metadata, which keeps it on the unsupported list.
 */
async function startSvgExport(
  user: ReturnType<typeof userEvent.setup>,
  presentationLabels: readonly string[] = [],
): Promise<void> {
  const shortcuts = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
  await act(async () => shortcuts?.onOpenExport?.());
  await user.click(screen.getByLabelText('export.format_svg'));
  for (const label of presentationLabels) {
    await user.click(screen.getByLabelText(label));
  }
  const exportButtons = screen.getAllByRole('button', {
    name: 'export.exportButton',
  });
  await user.click(exportButtons.at(-1)!);
}

describe('App — progreso, cancelación y cleanup (Story 6.2G)', () => {
  it('nunca reporta aria-valuenow para la ruta legacy indeterminada', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    await startExport(user);

    await waitFor(() => {
      expect(screen.getByText('export.successToast')).toBeInTheDocument();
    });
  });

  it('Escape cancela una exportación tiled activa, muestra "Cancelando…" y termina en cancelledToast sin éxito ni error', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    let capturedSignal: AbortSignal | undefined;
    let rejectExport: ((reason?: unknown) => void) | undefined;
    vi.mocked(mockRasterExporter.export).mockImplementationOnce(
      (_snap, signal) =>
        new Promise((_resolve, reject) => {
          capturedSignal = signal;
          rejectExport = reject;
        }),
    );

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    await startExport(user);
    await waitFor(() => expect(capturedSignal).toBeDefined());

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(screen.getByText('export.cancelling')).toBeInTheDocument();

    await act(async () => {
      rejectExport?.(makeAbortError());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('export.cancelledToast')).toBeInTheDocument();
    });
    expect(screen.queryByText('errors.ExportFailed')).toBeNull();
    expect(screen.queryByText('errors.IoError')).toBeNull();
    expect(screen.queryByText('export.successToast')).toBeNull();
  });

  it('una segunda cancelación sobre la misma operación no rompe ni produce un segundo desenlace', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    let capturedSignal: AbortSignal | undefined;
    let rejectExport: ((reason?: unknown) => void) | undefined;
    vi.mocked(mockRasterExporter.export).mockImplementationOnce(
      (_snap, signal) =>
        new Promise((_resolve, reject) => {
          capturedSignal = signal;
          rejectExport = reject;
        }),
    );

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    await startExport(user);
    await waitFor(() => expect(capturedSignal).toBeDefined());

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      rejectExport?.(makeAbortError());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('export.cancelledToast')).toBeInTheDocument();
    });
  });

  it('reporta progreso real (aria-valuenow/aria-valuetext) y descarta progreso de una operación distinta', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    let onProgressCb: ((progress: ExportProgress) => void) | undefined;
    let resolveExport:
      | ((receipt: { filePath: string; folderPath: string }) => void)
      | undefined;
    vi.mocked(mockRasterExporter.export).mockImplementationOnce(
      (_snap, _signal, onProgress) => {
        onProgressCb = onProgress;
        return new Promise((resolve) => {
          resolveExport = resolve;
        });
      },
    );

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    await startExport(user);
    await waitFor(() => expect(onProgressCb).toBeDefined());

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).not.toHaveAttribute('aria-valuenow');

    await act(async () => {
      onProgressCb?.({
        snapshotId: 'a-different-snapshot',
        mode: 'tiled-png',
        phase: 'capturing',
        completedUnits: 1,
        totalUnits: 4,
        percent: 25,
      });
    });
    expect(progressbar).not.toHaveAttribute('aria-valuenow');

    await act(async () => {
      onProgressCb?.({
        snapshotId: 'snap-1',
        sessionId: 'session-1',
        mode: 'tiled-png',
        phase: 'composing',
        completedUnits: 2,
        totalUnits: 4,
        percent: 50,
      });
    });
    expect(progressbar).toHaveAttribute('aria-valuenow', '50');
    expect(progressbar).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByText('Composing output 50%')).toBeInTheDocument();

    // Same snapshotId, but a *different* sessionId than the one already
    // bound to this operation — must be discarded too, not just a mismatch
    // on snapshotId.
    await act(async () => {
      onProgressCb?.({
        snapshotId: 'snap-1',
        sessionId: 'a-different-session',
        mode: 'tiled-png',
        phase: 'composing',
        completedUnits: 4,
        totalUnits: 4,
        percent: 100,
      });
    });
    expect(progressbar).toHaveAttribute('aria-valuenow', '50');

    await act(async () => {
      resolveExport?.({ filePath: '/tmp/export.png', folderPath: '/tmp' });
    });
    await waitFor(() => {
      expect(screen.getByText('export.successToast')).toBeInTheDocument();
    });
  });

  it('mantiene el mapa interactivo mientras una exportación está activa', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    vi.mocked(mockRasterExporter.export).mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    await startExport(user);

    expect(screen.getByTestId('canvas-wrapper').className).not.toContain(
      'pointer-events-none',
    );
  });

  it('mapea un VellumError a la clave i18n existente (errors.IoError), nunca muestra .reason', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    vi.mocked(mockRasterExporter.export).mockRejectedValueOnce({
      type: 'IoError',
      reason: 'disk is full: /var/tmp/vellum-export-xyz.part',
    });

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    await startExport(user);

    await waitFor(() => {
      expect(screen.getByText(/errors\.IoError/)).toBeInTheDocument();
    });
    // AC12: the message must indicate the output was never published.
    expect(screen.getByText(/export\.outputNotPublished/)).toBeInTheDocument();
    expect(screen.queryByText(/disk is full/)).toBeNull();
    expect(screen.queryByText('export.successToast')).toBeNull();
  });

  it('muestra el mensaje accionable de capacidad cuando el preflight rechaza ambas rutas, nunca export() ni el toast genérico', async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    useVellumStore.getState().setCityData(mockCityData);
    vi.mocked(mockRasterExporter.capabilitiesForSnapshot).mockReturnValueOnce({
      legacy: { eligible: false, reason: 'pixels' },
      tiled: { eligible: false, reason: 'flag' },
    });

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    await startExport(user);

    await waitFor(() => {
      expect(
        screen.getByText(/errors\.ExportCapacityUnavailable/),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/^errors\.ExportFailed$/)).toBeNull();
    expect(mockRasterExporter.export).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalledWith(
      '[App] PNG export failed:',
      expect.anything(),
    );
    consoleError.mockRestore();
  });

  it('cancela una exportación activa cuando cityData cambia (carga de otra ciudad)', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(mockRasterExporter.export).mockImplementationOnce(
      (_snap, signal) => {
        capturedSignal = signal;
        return new Promise(() => undefined);
      },
    );

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    await startExport(user);
    await waitFor(() => expect(capturedSignal).toBeDefined());

    act(() => {
      useVellumStore
        .getState()
        .setCityData({ ...mockCityData, cityName: 'Another City' });
    });

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('expone exportCancelHandlerRef mientras la exportación está activa y lo limpia al terminar', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    let capturedSignal: AbortSignal | undefined;
    let rejectExport: ((reason?: unknown) => void) | undefined;
    vi.mocked(mockRasterExporter.export).mockImplementationOnce(
      (_snap, signal) =>
        new Promise((_resolve, reject) => {
          capturedSignal = signal;
          rejectExport = reject;
        }),
    );
    const cancelHandlerRef: ExportCancelHandlerRef = { current: null };

    await act(async () => {
      render(
        <App
          rasterExporter={mockRasterExporter}
          exportCancelHandlerRef={cancelHandlerRef}
        />,
      );
    });
    expect(cancelHandlerRef.current).toBeNull();

    await startExport(user);
    await waitFor(() => expect(cancelHandlerRef.current).not.toBeNull());

    const cancelPromise = cancelHandlerRef.current!();
    await act(async () => {
      rejectExport?.(makeAbortError());
      await cancelPromise;
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(cancelHandlerRef.current).toBeNull();
  });

  it('un timeout aborta igual que el usuario, pero se reporta como error (no como cancelledToast)', async () => {
    vi.useFakeTimers();
    try {
      useVellumStore.getState().setCityData(mockCityData);
      let capturedSignal: AbortSignal | undefined;
      let rejectExport: ((reason?: unknown) => void) | undefined;
      vi.mocked(mockRasterExporter.export).mockImplementationOnce(
        (_snap, signal) =>
          new Promise((_resolve, reject) => {
            capturedSignal = signal;
            rejectExport = reject;
          }),
      );

      await act(async () => {
        render(<App rasterExporter={mockRasterExporter} />);
      });
      const shortcuts = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
      await act(async () => shortcuts?.onOpenExport?.());
      const exportButtons = screen.getAllByRole('button', {
        name: 'export.exportButton',
      });
      act(() => {
        fireEvent.click(exportButtons.at(-1)!);
      });

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);

      act(() => {
        vi.advanceTimersByTime(5 * 60 * 1000);
      });
      expect(capturedSignal?.aborted).toBe(true);

      await act(async () => {
        rejectExport?.(makeAbortError());
        await Promise.resolve();
      });

      expect(screen.getByText(/errors\.ExportFailed/)).toBeInTheDocument();
      expect(screen.queryByText('export.cancelledToast')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignora un evento de progreso tardío que llega después de abort(), aunque su snapshotId siga siendo el de la operación actual', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    let onProgressCb: ((progress: ExportProgress) => void) | undefined;
    let rejectExport: ((reason?: unknown) => void) | undefined;
    vi.mocked(mockRasterExporter.export).mockImplementationOnce(
      (_snap, _signal, onProgress) => {
        onProgressCb = onProgress;
        return new Promise((_resolve, reject) => {
          rejectExport = reject;
        });
      },
    );

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    await startExport(user);
    await waitFor(() => expect(onProgressCb).toBeDefined());

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.getByText('export.cancelling')).toBeInTheDocument();

    // A progress event races in just behind the abort — same snapshotId,
    // but the operation is already cancelling.
    act(() => {
      onProgressCb?.({
        snapshotId: 'snap-1',
        sessionId: 'session-1',
        mode: 'tiled-png',
        phase: 'composing',
        completedUnits: 3,
        totalUnits: 4,
        percent: 75,
      });
    });

    expect(screen.getByText('export.cancelling')).toBeInTheDocument();
    expect(screen.queryByText('export.progressPercent')).toBeNull();
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).not.toHaveAttribute('aria-valuenow', '75');

    await act(async () => {
      rejectExport?.(makeAbortError());
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText('export.cancelledToast')).toBeInTheDocument();
    });
  });

  it('muestra éxito cuando un commit transaccional gana la carrera contra abort()', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    let capturedSignal: AbortSignal | undefined;
    let resolveExport:
      | ((receipt: { filePath: string; folderPath: string }) => void)
      | undefined;
    vi.mocked(mockRasterExporter.export).mockImplementationOnce(
      (_snap, signal) => {
        capturedSignal = signal;
        return new Promise((resolve) => {
          resolveExport = resolve;
        });
      },
    );

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    await startExport(user);
    await waitFor(() => expect(capturedSignal).toBeDefined());

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(capturedSignal?.aborted).toBe(true);

    // The transactional commit won the race: a receipt means the file exists,
    // so UI must report success rather than a false cancellation.
    await act(async () => {
      resolveExport?.({ filePath: '/tmp/export.png', folderPath: '/tmp' });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('export.successToast')).toBeInTheDocument();
    });
    expect(screen.queryByText('export.cancelledToast')).toBeNull();
  });

  it('setea exportCancelHandlerRef sincrónicamente al hacer click en exportar, sin esperar un efecto', async () => {
    useVellumStore.getState().setCityData(mockCityData);
    vi.mocked(mockRasterExporter.export).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const cancelHandlerRef: ExportCancelHandlerRef = { current: null };

    await act(async () => {
      render(
        <App
          rasterExporter={mockRasterExporter}
          exportCancelHandlerRef={cancelHandlerRef}
        />,
      );
    });
    const shortcuts = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
    await act(async () => shortcuts?.onOpenExport?.());
    const exportButtons = screen.getAllByRole('button', {
      name: 'export.exportButton',
    });

    expect(cancelHandlerRef.current).toBeNull();
    act(() => {
      fireEvent.click(exportButtons.at(-1)!);
    });
    // Checked immediately after a synchronous click dispatch — no awaited
    // microtask in between — so this only passes if the ref is set inline
    // inside handleExport, not via a passive effect scheduled later.
    expect(cancelHandlerRef.current).not.toBeNull();
  });
});

describe('App — estado de exportación (Story 6.4)', () => {
  it('un segundo click en exportar no arranca una operación paralela', async () => {
    // AD-15: sólo puede haber una exportación viva mientras el protocolo DEM
    // sea global. El guardia es `isExportingRef`, no el estado de React, para
    // que dos clicks en el mismo tick no pasen ambos.
    useVellumStore.getState().setCityData(mockCityData);
    vi.mocked(mockRasterExporter.export).mockImplementation(
      () => new Promise(() => undefined),
    );

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    const shortcuts = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
    await act(async () => shortcuts?.onOpenExport?.());
    const exportButton = screen
      .getAllByRole('button', { name: 'export.exportButton' })
      .at(-1)!;

    await act(async () => {
      fireEvent.click(exportButton);
      fireEvent.click(exportButton);
    });

    expect(vi.mocked(mockRasterExporter.export)).toHaveBeenCalledTimes(1);
    vi.mocked(mockRasterExporter.export).mockReset();
  });

  it('Escape sin exportación activa no cancela nada (AC 7)', async () => {
    // Con el diálogo abierto y nada corriendo, Escape es asunto del diálogo:
    // el listener del workflow sólo existe mientras hay una operación viva, y
    // si se quedara montado convertiría un cierre en una cancelación fantasma.
    useVellumStore.getState().setCityData(mockCityData);

    await act(async () => {
      render(<App rasterExporter={mockRasterExporter} />);
    });
    const shortcuts = vi.mocked(useKeyboardShortcuts).mock.lastCall?.[0];
    await act(async () => shortcuts?.onOpenExport?.());

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(screen.queryByText('export.cancelledToast')).toBeNull();
    expect(screen.queryByText('export.cancelling')).toBeNull();
    expect(vi.mocked(mockRasterExporter.export)).not.toHaveBeenCalled();
  });
});

describe('App — exportación parcial y advertencias (Story 6.4)', () => {
  it('acompaña el éxito con la advertencia de lo que el SVG no dibujó', async () => {
    // El archivo existe, pero no es el que se configuró. Sin este aviso la
    // omisión sólo se descubre abriendo el SVG y buscando lo que falta.
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);

    await act(async () => {
      render(<App svgExporter={mockSvgExporter} />);
    });
    await startSvgExport(user, ['export.element_scaleBar']);

    await waitFor(() => {
      expect(screen.getByText('export.successToast')).toBeInTheDocument();
    });
    expect(
      screen.getByText('exportWarnings.svgUnsupportedPresentation'),
    ).toBeInTheDocument();
  });

  it('no advierte nada cuando el SVG sí dibuja todo lo pedido', async () => {
    // Los nombres de distrito son justo el caso que 6.3B implementó: avisar
    // aquí contradiría el documento que el usuario tiene delante.
    const user = userEvent.setup();
    useVellumStore.getState().setCityData({
      ...mockCityData,
      districts: [
        { id: 'd1', name: 'Centro', cells: [] },
      ] as unknown as (typeof mockCityData)['districts'],
    });

    await act(async () => {
      render(<App svgExporter={mockSvgExporter} />);
    });
    await startSvgExport(user, [
      'export.element_cityName',
      'export.element_districts',
    ]);

    await waitFor(() => {
      expect(screen.getByText('export.successToast')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('exportWarnings.svgUnsupportedPresentation'),
    ).toBeNull();
  });

  it('no muestra la advertencia mientras la exportación sigue corriendo', async () => {
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);
    vi.mocked(mockSvgExporter.export).mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    await act(async () => {
      render(<App svgExporter={mockSvgExporter} />);
    });
    await startSvgExport(user, ['export.element_scaleBar']);

    expect(
      screen.queryByText('exportWarnings.svgUnsupportedPresentation'),
    ).toBeNull();
  });

  it('descarta la advertencia anterior al arrancar una exportación nueva', async () => {
    // Una advertencia que sobrevive a la operación que la produjo describe un
    // archivo que ya no es el último exportado.
    const user = userEvent.setup();
    useVellumStore.getState().setCityData(mockCityData);

    await act(async () => {
      render(<App svgExporter={mockSvgExporter} />);
    });
    await startSvgExport(user, ['export.element_scaleBar']);
    await waitFor(() => {
      expect(
        screen.getByText('exportWarnings.svgUnsupportedPresentation'),
      ).toBeInTheDocument();
    });

    // Segunda vuelta: el diálogo se remonta con sus defaults (escala apagada,
    // nombre de ciudad encendido), así que basta apagar el nombre para que no
    // quede nada sin representar y la advertencia previa deba desaparecer.
    await startSvgExport(user, ['export.element_cityName']);
    await waitFor(() => {
      expect(
        screen.queryByText('exportWarnings.svgUnsupportedPresentation'),
      ).toBeNull();
    });
  });
});
