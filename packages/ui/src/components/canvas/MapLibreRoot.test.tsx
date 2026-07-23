import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '../../test-utils';
import { MapLibreRoot } from './MapLibreRoot';

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
      setLayerVisibility: vi.fn(),
      setLayerOptions: vi.fn(),
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
});
