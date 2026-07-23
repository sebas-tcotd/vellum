import type { LoadedTheme } from '@vellum/theme-engine';
import { DEFAULT_RENDER_STYLE_PARAMS } from '@vellum/theme-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '../../test-utils';
import { MapLibreRoot } from './MapLibreRoot';

const applyThemeSpy = vi.fn().mockResolvedValue(undefined);
const setTransitDimmingSpy = vi.fn();

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
      setTransitDimming: setTransitDimmingSpy,
    };
  },
  readTokensFromDOM: () => ({}),
}));

vi.mock('../minimap/Minimap', () => ({ Minimap: () => null }));
vi.mock('../overlays/MapTooltip', () => ({ MapTooltip: () => null }));

let mockActiveTheme = 'day';
let mockTransitDimmingEnabled = false;
vi.mock('../../store/vellum-store', () => ({
  useVellumStore: (selector: (s: unknown) => unknown) =>
    selector({
      cityData: null,
      activeTheme: mockActiveTheme,
      transitDimmingEnabled: mockTransitDimmingEnabled,
    }),
}));

const theme = (id: string, name: string): LoadedTheme => ({
  ...DEFAULT_RENDER_STYLE_PARAMS,
  schemaVersion: 1,
  name,
  id,
  source: 'built-in',
  rawJson: '{}',
});

describe('MapLibreRoot — Story 5.1: aplicación de tema (AC #2, #4)', () => {
  beforeEach(() => {
    applyThemeSpy.mockClear();
    setTransitDimmingSpy.mockClear();
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

  it('un rechazo de applyTheme (ej. WebGL context lost) se loguea y no crashea', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    applyThemeSpy.mockRejectedValueOnce(new Error('GPU context lost'));
    mockActiveTheme = 'transit';
    render(
      <MapLibreRoot
        themes={[theme('day', 'Day'), theme('transit', 'Transit')]}
      />,
    );
    await waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith(
        '[MapLibreRoot] applyTheme failed:',
        expect.any(Error),
      ),
    );
    consoleError.mockRestore();
  });
});

describe('MapLibreRoot — Story 5.3: dimming automático, opt-in (AC #1, #4)', () => {
  beforeEach(() => {
    applyThemeSpy.mockClear();
    setTransitDimmingSpy.mockClear();
    mockActiveTheme = 'day';
    mockTransitDimmingEnabled = false;
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

  it('llama setTransitDimming(false) cuando activeTheme es transit pero transitDimmingEnabled es false (default)', async () => {
    mockActiveTheme = 'transit';
    mockTransitDimmingEnabled = false;
    render(
      <MapLibreRoot
        themes={[theme('day', 'Day'), theme('transit', 'Transit')]}
      />,
    );
    await waitFor(() =>
      expect(setTransitDimmingSpy).toHaveBeenCalledWith(false),
    );
  });

  it('llama setTransitDimming(true) cuando activeTheme es transit y transitDimmingEnabled es true', async () => {
    mockActiveTheme = 'transit';
    mockTransitDimmingEnabled = true;
    render(
      <MapLibreRoot
        themes={[theme('day', 'Day'), theme('transit', 'Transit')]}
      />,
    );
    await waitFor(() =>
      expect(setTransitDimmingSpy).toHaveBeenCalledWith(true),
    );
  });

  it('llama setTransitDimming(false) para cualquier otro tema, incluso con transitDimmingEnabled en true', async () => {
    mockActiveTheme = 'day';
    mockTransitDimmingEnabled = true;
    render(
      <MapLibreRoot
        themes={[theme('day', 'Day'), theme('transit', 'Transit')]}
      />,
    );
    await waitFor(() =>
      expect(setTransitDimmingSpy).toHaveBeenCalledWith(false),
    );
  });
});
