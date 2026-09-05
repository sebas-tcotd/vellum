import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '../../test-utils';
import { MapLibreRoot } from './MapLibreRoot';

const mockCapturePreview = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    dataUrl: 'data:image/png;base64,viewport',
    width: 640,
    height: 480,
    bearingDegrees: 0,
    scale: { distanceMeters: 500, widthPercent: 20 },
    annotations: [],
  }),
);
const mockResize = vi.hoisted(() => vi.fn());
let resizeObserverCallback: ResizeObserverCallback | null = null;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    onDragDropEvent: () => Promise.resolve(() => {}),
  }),
}));

vi.mock('@vellum/renderer-webgl', () => ({
  MapLibreRenderer: function MapLibreRenderer() {
    return {
      dispose: vi.fn(),
      render: vi.fn().mockResolvedValue(undefined),
      subscribeViewport: vi.fn().mockReturnValue(() => {}),
      subscribeHover: vi.fn().mockReturnValue(() => {}),
      getInitialViewportBounds: vi.fn().mockReturnValue(null),
      navigateTo: vi.fn(),
      fitToScreen: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      resize: mockResize,
      setLayerVisibility: vi.fn(),
      setLayerOptions: vi.fn(),
      capturePreview: mockCapturePreview,
    };
  },
  readTokensFromDOM: () => ({}),
}));

vi.mock('../minimap/Minimap', () => ({
  Minimap: () => null,
}));

vi.mock('../overlays/MapTooltip', () => ({
  MapTooltip: () => null,
}));

let mockCityData: { cityName: string } | null = null;

vi.mock('../../store/vellum-store', () => ({
  useVellumStore: (selector: (s: unknown) => unknown) =>
    selector({ cityData: mockCityData }),
}));

describe('MapLibreRoot — AC2: ARIA en contenedor canvas', () => {
  beforeEach(() => {
    mockCityData = null;
    mockResize.mockClear();
    resizeObserverCallback = null;
    vi.stubGlobal(
      'ResizeObserver',
      function MockResizeObserver(
        this: {
          observe: () => void;
          disconnect: () => void;
        },
        callback: ResizeObserverCallback,
      ) {
        resizeObserverCallback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('el contenedor tiene role="img"', async () => {
    const { container } = render(<MapLibreRoot />);
    await act(async () => {});
    expect(container.firstChild).toHaveAttribute('role', 'img');
  });

  it('aria-label usa clave genérica cuando no hay ciudad cargada', async () => {
    mockCityData = null;
    const { container } = render(<MapLibreRoot />);
    await act(async () => {});
    expect(container.firstChild).toHaveAttribute(
      'aria-label',
      'a11y.mapCanvas',
    );
  });

  it('aria-label usa clave de ciudad cuando cityData tiene nombre', async () => {
    mockCityData = { cityName: 'Altavento' };
    const { container } = render(<MapLibreRoot />);
    await act(async () => {});
    expect(container.firstChild).toHaveAttribute(
      'aria-label',
      'a11y.mapCanvasCity',
    );
  });

  it('aria-label usa clave genérica cuando cityName está vacío', async () => {
    mockCityData = { cityName: '' };
    const { container } = render(<MapLibreRoot />);
    await act(async () => {});
    expect(container.firstChild).toHaveAttribute(
      'aria-label',
      'a11y.mapCanvas',
    );
  });

  it('expone la captura del renderer mediante previewCaptureRef', async () => {
    const previewCaptureRef: React.RefObject<
      | (() => Promise<import('@vellum/core').ExportPreviewSnapshot | null>)
      | null
    > = { current: null };
    render(<MapLibreRoot previewCaptureRef={previewCaptureRef} />);
    await act(async () => {});

    await expect(previewCaptureRef.current?.()).resolves.toEqual(
      expect.objectContaining({
        dataUrl: 'data:image/png;base64,viewport',
      }),
    );
    expect(mockCapturePreview).toHaveBeenCalledOnce();
  });

  it('sincroniza MapLibre con cada tamaño final observado del layout', async () => {
    render(<MapLibreRoot />);
    await act(async () => {});

    act(() => {
      resizeObserverCallback?.(
        [
          {
            contentRect: { width: 742, height: 600 },
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    });

    expect(mockResize).toHaveBeenCalledWith(742, 600);
  });
});
