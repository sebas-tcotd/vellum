import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useImperativeHandle, forwardRef } from 'react';
import { makeCityData } from '@vellum/core/testing';
import type { Building, District, MapSelectHit } from '@vellum/core';
import { cleanup, fireEvent, render, screen } from '../../test-utils';
import { MapViewport } from './MapViewport';
import type { CommandRegistry } from '../../shell/commands';
import type {
  MapLibreRootProps,
  MapViewportPort,
} from '../canvas/MapLibreRoot';
import { useVellumStore } from '../../store/vellum-store';
import {
  useShellSession,
  type ShellSessionAction,
} from '../../shell/shell-session';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

/** The overlay port the mocked map publishes; every method is a spy. */
const port = vi.hoisted(() => ({
  select: null as ((hit: unknown) => void) | null,
  value: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock('../canvas/MapLibreRoot', () => ({
  MapLibreRoot: (props: { portRef?: { current: unknown } }) => {
    if (props.portRef) props.portRef.current = port.value;
    return <canvas data-testid="map-canvas" tabIndex={0} />;
  },
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

const district: District = {
  id: 'd1',
  name: 'Centro',
  position: { x: 0, y: 0, z: 0 },
  population: 10,
  homes: 1,
  jobs: { commercial: 0, industrial: 0, office: 0 },
  specializations: [],
  boundary: [
    {
      exterior: [
        [-0.01, -0.01],
        [0.01, -0.01],
        [0.01, 0.01],
        [-0.01, 0.01],
        [-0.01, -0.01],
      ],
      holes: [],
    },
  ],
};

const building = (overrides: Partial<Building>): Building => ({
  id: 'b1',
  name: 'Library',
  position: { x: 0, y: 0, z: 0 },
  itemClass: 'Library',
  serviceType: 'None',
  footprint: [],
  ...overrides,
});

const city = makeCityData({
  cityName: 'Altavento',
  districts: [district],
  parkAreas: [
    {
      id: 'p1',
      name: 'Strawberry Pit',
      position: { x: 0, y: 0, z: 0 },
      parkType: 'Industry',
    },
  ],
  buildings: [
    building({ displayName: 'Biblioteca' }),
    building({
      id: 'rico',
      name: 'H1',
      itemClass: 'Low Residential',
      serviceType: 'ResidentialLow',
    }),
  ],
});

interface HarnessHandle {
  dispatch: (action: ShellSessionAction) => void;
}

const Harness = forwardRef<HarnessHandle>(function Harness(_props, ref) {
  const shell = useShellSession(1440);
  useImperativeHandle(ref, () => ({ dispatch: shell.dispatch }), [shell]);
  return (
    <MapViewport
      mapProps={mapProps}
      commands={commands}
      isCleanView={false}
      subscribeServiceIconLegendRef={{ current: null }}
      iconLegendToggleRef={{ current: null }}
      mapInset={{ left: 280 }}
      shell={shell}
    />
  );
});

/** Lays out a viewport of `width` px with the card at 292–612 px. */
function mockRects(width: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const rect = (l: number, t: number, r: number, b: number) =>
        ({
          left: l,
          top: t,
          right: r,
          bottom: b,
          width: r - l,
          height: b - t,
          x: l,
          y: t,
          toJSON: () => ({}),
        }) as DOMRect;
      return this.classList.contains('place-card')
        ? rect(292, 12, 612, 400)
        : rect(0, 0, width, 800);
    },
  );
}

const panBy = () => port.value['panBy'] as ReturnType<typeof vi.fn>;

function renderHarness() {
  const handle: { current: HarnessHandle | null } = { current: null };
  render(<Harness ref={handle} />);
  return handle;
}

function click(hit: Omit<MapSelectHit, 'screenX' | 'screenY'>, x = 600) {
  act(() => port.select?.({ screenX: x, screenY: 100, ...hit }));
}

beforeEach(() => {
  port.select = null;
  const methods: (keyof MapViewportPort)[] = [
    'subscribeViewport',
    'subscribeHover',
    'getInitialViewportBounds',
    'navigateTo',
    'panBy',
    'setSelectedDistrict',
    'getBearing',
    'getZoomState',
    'setZoom',
  ];
  port.value = Object.fromEntries(
    methods.map((name) => [name, vi.fn(() => () => {})]),
  );
  port.value['getInitialViewportBounds'] = vi.fn(() => null);
  port.value['getBearing'] = vi.fn(() => 0);
  port.value['getZoomState'] = vi.fn(() => null);
  port.value['subscribeSelect'] = vi.fn((cb: (hit: unknown) => void) => {
    port.select = cb;
    return () => {};
  });
  useVellumStore.setState({ cityData: city, loadingState: 'idle' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useVellumStore.setState({ cityData: null, loadingState: 'idle' });
});

describe('place card wiring', () => {
  it('opens a notable building, preferring it over its district', () => {
    renderHarness();
    click({ buildingIds: ['b1'], districtId: 'd1' });
    expect(
      screen.getByRole('dialog', { name: 'Biblioteca' }),
    ).toBeInTheDocument();
    expect(port.value['setSelectedDistrict']).toHaveBeenLastCalledWith(null);
  });

  it('falls through an unmodified RICO building to its district, and tints it', () => {
    renderHarness();
    click({ buildingIds: ['rico'], districtId: 'd1' });
    expect(screen.getByRole('dialog', { name: 'Centro' })).toBeInTheDocument();
    expect(port.value['setSelectedDistrict']).toHaveBeenLastCalledWith('d1');
  });

  it('replaces the card — never two — and clears it on empty map', () => {
    renderHarness();
    click({ districtId: 'd1' });
    click({ buildingIds: ['b1'] });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Biblioteca');
    click({});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Escape closes the card, clears the tint and focuses the map canvas', () => {
    const handle = renderHarness();
    click({ districtId: 'd1' });
    screen.getByRole('button', { name: 'common.close' }).focus();
    act(() => handle.current!.dispatch({ type: 'escape' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(port.value['setSelectedDistrict']).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId('map-canvas')).toHaveFocus();
  });

  it('the close button also returns focus to the map', () => {
    renderHarness();
    click({ districtId: 'd1' });
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('map-canvas')).toHaveFocus();
  });

  it('closes when the place’s layer is switched off, or the view changes', () => {
    const handle = renderHarness();
    click({ districtId: 'd1' });
    act(() =>
      useVellumStore.setState((s) => ({
        activeLayers: { ...s.activeLayers, districts: false },
      })),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() =>
      useVellumStore.setState((s) => ({
        activeLayers: { ...s.activeLayers, districts: true },
      })),
    );

    click({ buildingIds: ['b1'] });
    act(() => handle.current!.dispatch({ type: 'viewMode/toggle' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a park area over its district, and closes when park areas hide', () => {
    renderHarness();
    act(() =>
      useVellumStore.setState((s) => ({
        layerOptions: {
          ...s.layerOptions,
          districts: { ...s.layerOptions.districts, showParkAreas: true },
        },
      })),
    );
    click({ parkId: 'p1', districtId: 'd1' });
    expect(screen.getByRole('dialog', { name: 'Strawberry Pit' })).toBeTruthy();
    act(() =>
      useVellumStore.setState((s) => ({
        layerOptions: {
          ...s.layerOptions,
          districts: { ...s.layerOptions.districts, showParkAreas: false },
        },
      })),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('centers on the place and copies its name', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderHarness();
    click({ buildingIds: ['b1'] });
    fireEvent.click(
      screen.getByRole('button', { name: 'placeCard.centerOnMap' }),
    );
    expect(port.value['navigateTo']).toHaveBeenCalledWith(0, 0);
    fireEvent.click(screen.getByRole('button', { name: 'placeCard.copyName' }));
    expect(writeText).toHaveBeenCalledWith('Biblioteca');
  });

  it('pans just enough to reveal a place the card covers', () => {
    mockRects(1200);
    renderHarness();
    click({ districtId: 'd1' }, 500);
    expect(port.value['panBy']).toHaveBeenCalledWith(500 - (612 + 24), 0);

    panBy().mockClear();
    click({ buildingIds: ['b1'] }, 900);
    expect(port.value['panBy']).not.toHaveBeenCalled();
  });

  it('pans again when the pinned place is clicked again under the card', () => {
    mockRects(1200);
    renderHarness();
    click({ districtId: 'd1' }, 900);
    expect(port.value['panBy']).not.toHaveBeenCalled();
    click({ districtId: 'd1' }, 400);
    expect(port.value['panBy']).toHaveBeenCalledWith(400 - (612 + 24), 0);
  });

  it('never pans the point past the right edge of the viewport', () => {
    // A viewport barely wider than the card: the full nudge would push the
    // point out on the right, so it stops at the edge inset instead.
    mockRects(630);
    renderHarness();
    click({ districtId: 'd1' }, 500);
    expect(port.value['panBy']).toHaveBeenCalledWith(500 - (630 - 12), 0);
  });

  it('opens a notable building beside a RICO lot, whatever the hit order', () => {
    renderHarness();
    click({ buildingIds: ['rico', 'b1'] });
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Biblioteca');
  });

  it('closes when the buildings layer is hidden with a building pinned', () => {
    renderHarness();
    click({ buildingIds: ['b1'] });
    act(() =>
      useVellumStore.setState((s) => ({
        activeLayers: { ...s.activeLayers, buildings: false },
      })),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() =>
      useVellumStore.setState((s) => ({
        activeLayers: { ...s.activeLayers, buildings: true },
      })),
    );
  });

  it('closes when another load starts', () => {
    renderHarness();
    click({ districtId: 'd1' });
    act(() => useVellumStore.setState({ loadingState: 'loading' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(port.value['setSelectedDistrict']).toHaveBeenLastCalledWith(null);
  });

  it('does not steal focus from outside the map when Escape closes the card', () => {
    const handle = renderHarness();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    click({ districtId: 'd1' });
    outside.focus();
    act(() => handle.current!.dispatch({ type: 'escape' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(outside).toHaveFocus();
    outside.remove();
  });
});
