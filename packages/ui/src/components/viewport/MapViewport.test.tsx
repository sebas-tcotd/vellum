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

function renderViewport() {
  return render(
    <MapViewport
      mapProps={mapProps}
      commands={commands}
      isCleanView={false}
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
