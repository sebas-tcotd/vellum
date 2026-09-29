import { DEFAULT_RENDER_STYLE_PARAMS } from '@vellum/theme-engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCityData } from '@vellum/core/testing';
import { act, cleanup, render, screen } from '../../test-utils';
import { MapViewport } from './MapViewport';
import type { CommandRegistry } from '../../shell/commands';
import type { MapLibreRootProps } from '../canvas/MapLibreRoot';
import { useVellumStore } from '../../store/vellum-store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The map itself is out of scope here: `data-map-state` is derived from the
// store, not from the renderer, so a real `MapLibreRoot` would only drag
// WebGL and MapLibre into a test about one attribute.
vi.mock('../canvas/MapLibreRoot', () => ({
  MapLibreRoot: () => <div data-testid="maplibre-root" />,
}));

const commands = new Proxy(
  {},
  {
    get: (_target, id: string) => ({
      id,
      canExecute: false,
      execute: () => {},
    }),
  },
) as CommandRegistry;

const mapProps = {
  createRenderer: () => {
    throw new Error('the renderer is mocked away in this suite');
  },
} as unknown as MapLibreRootProps;

function renderViewport(
  viewMode: 'geographic' | 'schematic' = 'geographic',
  isCleanView = false,
) {
  return render(
    <MapViewport
      mapProps={mapProps}
      commands={commands}
      isCleanView={isCleanView}
      viewMode={viewMode}
      subscribeServiceIconLegendRef={{ current: null }}
      iconLegendToggleRef={{ current: null }}
    />,
  );
}

/** The viewport only asks whether a city exists; the overlays it mounts need real bounds. */
const someCity = makeCityData({ cityName: 'Altavento' });

afterEach(() => {
  cleanup();
  useVellumStore.setState({ cityData: null, loadingState: 'idle' });
});

describe('map readiness signal', () => {
  it('reports `empty` while no city has been opened', () => {
    useVellumStore.setState({ cityData: null, loadingState: 'idle' });

    renderViewport();

    expect(screen.getByTestId('map-surface')).toHaveAttribute(
      'data-map-state',
      'empty',
    );
  });

  it('reports `loading` while a file is being parsed', () => {
    useVellumStore.setState({ cityData: null, loadingState: 'loading' });

    renderViewport();

    expect(screen.getByTestId('map-surface')).toHaveAttribute(
      'data-map-state',
      'loading',
    );
  });

  it('reports `loading` while the parsed city is still being drawn', () => {
    useVellumStore.setState({
      cityData: someCity,
      loadingState: 'idle',
      isDrawingMap: true,
    });

    renderViewport();

    expect(screen.getByTestId('map-surface')).toHaveAttribute(
      'data-map-state',
      'loading',
    );
  });

  it('reports `ready` once the city is drawn', () => {
    useVellumStore.setState({
      cityData: someCity,
      loadingState: 'idle',
      isDrawingMap: false,
    });

    renderViewport();

    expect(screen.getByTestId('map-surface')).toHaveAttribute(
      'data-map-state',
      'ready',
    );
  });

  // Opening a second city keeps the first one on screen while the new file
  // parses. Without this precedence an automated flow would read `ready` and
  // act on a map that is one frame away from being replaced.
  it('reports `loading`, not `ready`, while a second city replaces the first', () => {
    useVellumStore.setState({ cityData: someCity, loadingState: 'loading' });

    renderViewport();

    expect(screen.getByTestId('map-surface')).toHaveAttribute(
      'data-map-state',
      'loading',
    );
  });
});

describe('schematic view mode', () => {
  it('keeps the map mounted but hidden, and shows the schematic surface', () => {
    useVellumStore.setState({ cityData: someCity, loadingState: 'idle' });

    renderViewport('schematic');

    const wrapper = screen.getByTestId('canvas-wrapper');
    expect(screen.getByTestId('maplibre-root')).toBeInTheDocument();
    expect(wrapper).toHaveStyle({ visibility: 'hidden' });
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper).toHaveAttribute('inert');
    expect(screen.getByTestId('schematic-view')).toBeInTheDocument();
    expect(screen.getByTestId('schematic-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows the map and no schematic surface in geographic mode', () => {
    useVellumStore.setState({ cityData: someCity, loadingState: 'idle' });

    renderViewport('geographic');

    const wrapper = screen.getByTestId('canvas-wrapper');
    expect(wrapper).not.toHaveAttribute('aria-hidden');
    expect(wrapper).not.toHaveAttribute('inert');
    expect(screen.queryByTestId('schematic-view')).toBeNull();
    expect(screen.getByTestId('schematic-toggle')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('schematic view — clean view and focus', () => {
  it('keeps the toggle visible in schematic mode even under Clean view', () => {
    useVellumStore.setState({ cityData: someCity, loadingState: 'idle' });

    renderViewport('schematic', true);

    expect(screen.getByTestId('schematic-toggle')).toBeInTheDocument();
  });

  it('hides the toggle under Clean view on the geographic map', () => {
    useVellumStore.setState({ cityData: someCity, loadingState: 'idle' });

    renderViewport('geographic', true);

    expect(screen.queryByTestId('schematic-toggle')).toBeNull();
  });

  it('moves focus into the schematic region and back to the toggle', () => {
    useVellumStore.setState({ cityData: someCity, loadingState: 'idle' });
    // An enabled toggle: a disabled button cannot take focus.
    const enabled = new Proxy(
      {},
      {
        get: (_t, id: string) => ({ id, canExecute: true, execute: () => {} }),
      },
    ) as CommandRegistry;
    const props = {
      mapProps,
      commands: enabled,
      isCleanView: false,
      subscribeServiceIconLegendRef: { current: null },
      iconLegendToggleRef: { current: null },
    };
    const { rerender } = render(
      <MapViewport {...props} viewMode="geographic" />,
    );

    rerender(<MapViewport {...props} viewMode="schematic" />);
    expect(screen.getByTestId('schematic-view')).toHaveFocus();

    rerender(<MapViewport {...props} viewMode="geographic" />);
    expect(screen.getByTestId('schematic-toggle')).toHaveFocus();
  });
});

describe('specialization legend consumer', () => {
  const nativeCity = makeCityData({
    source: 'vellummap',
    districts: [
      {
        id: 'd',
        name: 'D',
        position: { x: 0, y: 0, z: 0 },
        specializations: ['Forest'],
        boundary: [
          {
            exterior: [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
            holes: [],
          },
        ],
      },
    ],
  });
  function enable() {
    useVellumStore.setState({
      cityData: nativeCity,
      activeTheme: 'test-day',
      activeLayers: {
        ...useVellumStore.getState().activeLayers,
        districts: true,
      },
      layerOptions: {
        ...useVellumStore.getState().layerOptions,
        districts: {
          ...useVellumStore.getState().layerOptions.districts,
          colorBySpecialization: true,
        },
      },
    });
  }
  it('renders real accessible scrollable legend with the active theme and reacts to theme changes', () => {
    enable();
    const day = {
      ...structuredClone(DEFAULT_RENDER_STYLE_PARAMS),
      id: 'test-day',
      name: 'Day',
      schemaVersion: 1,
      source: 'built-in' as const,
      rawJson: '',
    };
    const night = { ...structuredClone(day), id: 'test-night' };
    day.buildings.industry.forestry.fill = '#123456';
    night.buildings.industry.forestry.fill = '#654321';
    const originalThemes = mapProps.themes;
    mapProps.themes = [day, night];
    renderViewport();
    const legend = screen.getByRole('complementary', {
      name: 'districtSpecialization.title',
    });
    expect(legend).toHaveAttribute('tabindex', '0');
    expect(legend).toHaveStyle({ overflowY: 'auto' });
    expect(legend.style.maxHeight).toContain('100% - 12px');
    expect(legend.textContent).toContain('specializations.forest');
    expect(legend.textContent).toContain('districtSpecialization.dominance');
    expect(legend.querySelector('[style*="background-color"]')).toHaveStyle({
      backgroundColor: '#123456',
    });
    act(() => useVellumStore.setState({ activeTheme: 'test-night' }));
    expect(legend.querySelector('[style*="background-color"]')).toHaveStyle({
      backgroundColor: '#654321',
    });
    act(() =>
      useVellumStore.setState({
        activeLayers: {
          ...useVellumStore.getState().activeLayers,
          districts: false,
        },
      }),
    );
    expect(
      screen.queryByRole('complementary', {
        name: 'districtSpecialization.title',
      }),
    ).toBeNull();
    mapProps.themes = originalThemes;
  });
  it.each(['disabled', 'cslmap', 'clean', 'schematic'] as const)(
    'hides the legend for %s',
    (mode) => {
      enable();
      if (mode === 'disabled')
        useVellumStore.getState().setDistrictsColorBySpecialization(false);
      if (mode === 'cslmap')
        useVellumStore.setState({
          cityData: { ...nativeCity, source: 'cslmap' },
        });
      renderViewport(
        mode === 'schematic' ? 'schematic' : 'geographic',
        mode === 'clean',
      );
      expect(
        screen.queryByRole('complementary', {
          name: 'districtSpecialization.title',
        }),
      ).toBeNull();
    },
  );
});
