import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '../../test-utils';
import { MapLibreRoot } from './MapLibreRoot';
import { createRendererHarness } from '../../testing/test-renderer';
import { createPlatformServicesHarness } from '../../testing/test-platform-services';

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

// The renderer arrives as an injected factory; `@vellum/ui` never names the
// adapter, so there is no module to mock (ADR-0001).
const rendererHarness = createRendererHarness({
  resize: mockResize,
  capturePreview: mockCapturePreview,
});
const { createRenderer } = rendererHarness;

vi.mock('../minimap/Minimap', () => ({
  Minimap: () => null,
}));

vi.mock('../overlays/MapTooltip', () => ({
  MapTooltip: () => null,
}));

let mockCityData: { cityName: string } | null = null;

let mockLoadingState = 'idle';

const storeState = () => ({
  cityData: mockCityData,
  loadingState: mockLoadingState,
});

vi.mock('../../store/vellum-store', () => ({
  useVellumStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector(storeState()),
    { getState: () => storeState() },
  ),
}));

describe('MapLibreRoot — AC2: ARIA en contenedor canvas', () => {
  beforeEach(() => {
    // El harness se construye una vez a nivel de módulo (la factory necesita
    // identidad estable), así que sus spies acumulan llamadas sin este reset.
    rendererHarness.reset();
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
    const { container } = render(
      <MapLibreRoot createRenderer={createRenderer} />,
    );
    await act(async () => {});
    expect(container.firstChild).toHaveAttribute('role', 'img');
  });

  it('aria-label usa clave genérica cuando no hay ciudad cargada', async () => {
    mockCityData = null;
    const { container } = render(
      <MapLibreRoot createRenderer={createRenderer} />,
    );
    await act(async () => {});
    expect(container.firstChild).toHaveAttribute(
      'aria-label',
      'a11y.mapCanvas',
    );
  });

  it('aria-label usa clave de ciudad cuando cityData tiene nombre', async () => {
    mockCityData = { cityName: 'Altavento' };
    const { container } = render(
      <MapLibreRoot createRenderer={createRenderer} />,
    );
    await act(async () => {});
    expect(container.firstChild).toHaveAttribute(
      'aria-label',
      'a11y.mapCanvasCity',
    );
  });

  it('aria-label usa clave genérica cuando cityName está vacío', async () => {
    mockCityData = { cityName: '' };
    const { container } = render(
      <MapLibreRoot createRenderer={createRenderer} />,
    );
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
    render(
      <MapLibreRoot
        createRenderer={createRenderer}
        previewCaptureRef={previewCaptureRef}
      />,
    );
    await act(async () => {});

    await expect(previewCaptureRef.current?.()).resolves.toEqual(
      expect.objectContaining({
        dataUrl: 'data:image/png;base64,viewport',
      }),
    );
    expect(mockCapturePreview).toHaveBeenCalledOnce();
  });

  it('sincroniza MapLibre con cada tamaño final observado del layout', async () => {
    render(<MapLibreRoot createRenderer={createRenderer} />);
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

describe('MapLibreRoot — política de drop de archivos', () => {
  beforeEach(() => {
    rendererHarness.reset();
    mockCityData = null;
    mockLoadingState = 'idle';
    vi.stubGlobal(
      'ResizeObserver',
      function MockResizeObserver(this: {
        observe: () => void;
        disconnect: () => void;
      }) {
        this.observe = vi.fn();
        this.disconnect = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderWithDrop = async (loadFile: (path: string) => Promise<void>) => {
    const harness = createPlatformServicesHarness();
    render(
      <MapLibreRoot createRenderer={createRenderer} loadFile={loadFile} />,
      { wrapper: harness.wrapper },
    );
    await act(async () => {});
    const drop = harness.subscribeFileDrop.mock.calls[0]?.[0] as (
      paths: readonly string[],
    ) => void;
    return drop;
  };

  it('carga el primer .cslmap y ignora el resto de las rutas soltadas', async () => {
    const loadFile = vi.fn().mockResolvedValue(undefined);
    const drop = await renderWithDrop(loadFile);

    act(() => {
      drop(['/tmp/notes.txt', '/tmp/City.CSLMAP', '/tmp/other.cslmap']);
    });

    expect(loadFile).toHaveBeenCalledTimes(1);
    expect(loadFile).toHaveBeenCalledWith('/tmp/City.CSLMAP');
  });

  it('ignora un drop sin ningún .cslmap, sin lanzar', async () => {
    const loadFile = vi.fn().mockResolvedValue(undefined);
    const drop = await renderWithDrop(loadFile);

    act(() => {
      drop(['/tmp/notes.txt']);
    });

    expect(loadFile).not.toHaveBeenCalled();
  });

  it('ignora el drop mientras hay una carga en curso', async () => {
    const loadFile = vi.fn().mockResolvedValue(undefined);
    const drop = await renderWithDrop(loadFile);
    mockLoadingState = 'loading';

    act(() => {
      drop(['/tmp/city.cslmap']);
    });

    expect(loadFile).not.toHaveBeenCalled();
  });
});
