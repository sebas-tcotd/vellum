import type { LoadedTheme } from '@vellum/theme-engine';
import { DEFAULT_RENDER_STYLE_PARAMS } from '@vellum/theme-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '../../test-utils';
import { MapLibreRoot } from './MapLibreRoot';
import { createRendererHarness } from '../../testing/test-renderer';

const applyThemeSpy = vi.fn().mockResolvedValue(undefined);
const setTransitDimmingSpy = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The renderer arrives as an injected factory; `@vellum/ui` never names the
// adapter, so there is no module to mock (ADR-0001).
const rendererHarness = createRendererHarness({
  applyTheme: applyThemeSpy,
  setTransitDimming: setTransitDimmingSpy,
});
const { createRenderer } = rendererHarness;

vi.mock('../minimap/Minimap', () => ({ Minimap: () => null }));
vi.mock('../overlays/MapTooltip', () => ({ MapTooltip: () => null }));

let mockActiveTheme = 'day';
let mockTransitDimmingEnabled = false;
let mockCityData: unknown = null;
vi.mock('../../store/vellum-store', () => ({
  useVellumStore: (selector: (s: unknown) => unknown) =>
    selector({
      cityData: mockCityData,
      activeTheme: mockActiveTheme,
      transitDimmingEnabled: mockTransitDimmingEnabled,
      layerOptions: {
        transit: { visibleModes: [] },
        buildings: { visibleCategories: [] },
        districts: { showNameOnMap: false, showParkAreas: false },
        terrain: {
          showContourLines: true,
          showColorRelief: true,
          showHillshade: true,
        },
        basemap: { showGrid: false },
      },
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
    // El harness es de módulo (identidad estable de la factory): sin reset,
    // los spies del puerto acumulan llamadas de un test al siguiente.
    rendererHarness.reset();
    applyThemeSpy.mockClear();
    setTransitDimmingSpy.mockClear();
    mockActiveTheme = 'day';
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

  it('llama applyTheme con el RenderStyleParams del tema activo cuando cargan los temas', async () => {
    mockActiveTheme = 'transit';
    render(
      <MapLibreRoot
        createRenderer={createRenderer}
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
    render(<MapLibreRoot createRenderer={createRenderer} themes={[]} />);
    await act(async () => {});
    expect(applyThemeSpy).not.toHaveBeenCalled();
  });

  it('no llama applyTheme si activeTheme no coincide con ningún tema cargado', async () => {
    mockActiveTheme = 'inexistente';
    render(
      <MapLibreRoot
        createRenderer={createRenderer}
        themes={[theme('day', 'Day')]}
      />,
    );
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
        createRenderer={createRenderer}
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

  it('vuelve a llamar applyTheme cuando cityData cambia, para colorear correctamente las capas recién creadas', async () => {
    mockActiveTheme = 'transit';
    const themes = [theme('day', 'Day'), theme('transit', 'Transit')];
    const { rerender } = render(
      <MapLibreRoot createRenderer={createRenderer} themes={themes} />,
    );
    await waitFor(() => expect(applyThemeSpy).toHaveBeenCalledTimes(1));

    // Simula una ciudad cargándose después de que los temas ya resolvieron: si
    // `applyTheme` no se re-dispara aquí, las capas recién creadas por
    // `initializeSourcesAndLayers` (base-water, base-land) quedan pintadas con
    // los colores por defecto en lugar del tema activo.
    mockCityData = { cityName: 'Test City' };
    rerender(<MapLibreRoot createRenderer={createRenderer} themes={themes} />);

    await waitFor(() => expect(applyThemeSpy).toHaveBeenCalledTimes(2));
  });
});

describe('MapLibreRoot — Story 5.3: dimming automático, opt-in (AC #1, #4)', () => {
  beforeEach(() => {
    // El harness es de módulo (identidad estable de la factory): sin reset,
    // los spies del puerto acumulan llamadas de un test al siguiente.
    rendererHarness.reset();
    applyThemeSpy.mockClear();
    setTransitDimmingSpy.mockClear();
    mockActiveTheme = 'day';
    mockTransitDimmingEnabled = false;
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

  it('llama setTransitDimming(false) cuando activeTheme es transit pero transitDimmingEnabled es false (default)', async () => {
    mockActiveTheme = 'transit';
    mockTransitDimmingEnabled = false;
    render(
      <MapLibreRoot
        createRenderer={createRenderer}
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
        createRenderer={createRenderer}
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
        createRenderer={createRenderer}
        themes={[theme('day', 'Day'), theme('transit', 'Transit')]}
      />,
    );
    await waitFor(() =>
      expect(setTransitDimmingSpy).toHaveBeenCalledWith(false),
    );
  });
});
