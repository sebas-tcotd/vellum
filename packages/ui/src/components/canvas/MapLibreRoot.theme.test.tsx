import type { LoadedTheme } from '@vellum/theme-engine';
import { DEFAULT_RENDER_STYLE_PARAMS } from '@vellum/theme-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '../../test-utils';
import { MapLibreRoot } from './MapLibreRoot';

const applyThemeSpy = vi.fn().mockResolvedValue(undefined);

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
      applyTheme: applyThemeSpy,
      subscribeViewport: vi.fn().mockReturnValue(() => {}),
      subscribeHover: vi.fn().mockReturnValue(() => {}),
      getInitialViewportBounds: vi.fn().mockReturnValue(null),
      navigateTo: vi.fn(),
      fitToScreen: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      setLayerVisibility: vi.fn(),
    };
  },
  readTokensFromDOM: () => ({}),
}));

vi.mock('../minimap/Minimap', () => ({ Minimap: () => null }));
vi.mock('../overlays/MapTooltip', () => ({ MapTooltip: () => null }));

let mockActiveTheme = 'day';
vi.mock('../../store/vellum-store', () => ({
  useVellumStore: (selector: (s: unknown) => unknown) =>
    selector({ cityData: null, activeTheme: mockActiveTheme }),
}));

const theme = (id: string, name: string): LoadedTheme => ({
  ...DEFAULT_RENDER_STYLE_PARAMS,
  schemaVersion: 1,
  name,
  id,
  source: 'built-in',
});

describe('MapLibreRoot — Story 5.1: aplicación de tema (AC #2, #4)', () => {
  beforeEach(() => {
    applyThemeSpy.mockClear();
    mockActiveTheme = 'day';
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

  it('llama applyTheme con el RenderStyleParams del tema activo cuando cargan los temas', async () => {
    mockActiveTheme = 'transit';
    render(
      <MapLibreRoot
        themes={[theme('day', 'Day'), theme('transit', 'Transit')]}
      />,
    );
    await waitFor(() =>
      expect(applyThemeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'transit', name: 'Transit' }),
      ),
    );
  });

  it('no llama applyTheme si no hay temas cargados', async () => {
    render(<MapLibreRoot themes={[]} />);
    await act(async () => {});
    expect(applyThemeSpy).not.toHaveBeenCalled();
  });

  it('no llama applyTheme si activeTheme no coincide con ningún tema cargado', async () => {
    mockActiveTheme = 'inexistente';
    render(<MapLibreRoot themes={[theme('day', 'Day')]} />);
    await act(async () => {});
    expect(applyThemeSpy).not.toHaveBeenCalled();
  });
});
