import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeCityData } from '@vellum/core/testing';
import { cleanup, render, screen } from '../../test-utils';
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

  it('reports `ready` once city data is in the store', () => {
    useVellumStore.setState({ cityData: someCity, loadingState: 'idle' });

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
