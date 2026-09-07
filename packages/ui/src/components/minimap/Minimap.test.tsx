import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '../../test-utils';
import { Minimap } from './Minimap';
import type { CityData, ViewportBounds } from '@vellum/core';

vi.mock('@vellum/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vellum/core')>();
  return {
    ...actual,
    csToGeoArray: ({ x, z }: { x: number; z: number }) => [
      x * 0.0001,
      z * 0.0001,
    ],
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockCtx = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillStyle: '' as string | CanvasGradient | CanvasPattern,
  strokeStyle: '' as string | CanvasGradient | CanvasPattern,
  lineWidth: 0,
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  drawImage: vi.fn(),
};

const mockCityData: CityData = {
  cityName: 'Test City',
  fileName: 'test.cslmap',
  generatedAt: '2024-01-01',
  landPolygon: [],
  inlandWaterPolygons: [],
  terrainBands: [],
  roadNodes: [],
  roadSegments: [],
  transitLines: [],
  buildings: [],
  forestCells: [],
  districts: [],
  parkAreas: [],
  bounds: { minX: -8640, maxX: 8640, minZ: -8640, maxZ: 8640, seaLevel: 40 },
};

const mockViewport: ViewportBounds = {
  westLng: -0.5,
  eastLng: 0.5,
  northLat: 0.5,
  southLat: -0.5,
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D,
  );
  // Reset all mock functions before each test
  Object.values(mockCtx).forEach((v) => {
    if (typeof v === 'function') (v as ReturnType<typeof vi.fn>).mockClear();
  });
});

describe('Minimap', () => {
  it('renderiza el canvas con aria-label correcto', () => {
    const subscribeViewport = vi.fn(() => vi.fn());
    const getInitialViewportBounds = vi.fn(() => null);
    const navigateTo = vi.fn();

    render(
      <Minimap
        cityData={mockCityData}
        subscribeViewport={subscribeViewport}
        getInitialViewportBounds={getInitialViewportBounds}
        navigateTo={navigateTo}
      />,
    );

    expect(
      screen.getByRole('application', { name: 'a11y.minimap' }),
    ).toBeDefined();
  });

  it('llama getInitialViewportBounds en el montaje', () => {
    const subscribeViewport = vi.fn(() => vi.fn());
    const getInitialViewportBounds = vi.fn(() => null);
    const navigateTo = vi.fn();

    render(
      <Minimap
        cityData={mockCityData}
        subscribeViewport={subscribeViewport}
        getInitialViewportBounds={getInitialViewportBounds}
        navigateTo={navigateTo}
      />,
    );

    expect(getInitialViewportBounds).toHaveBeenCalledOnce();
  });

  it('llama subscribeViewport en el montaje', () => {
    const subscribeViewport = vi.fn(() => vi.fn());
    const getInitialViewportBounds = vi.fn(() => null);
    const navigateTo = vi.fn();

    render(
      <Minimap
        cityData={mockCityData}
        subscribeViewport={subscribeViewport}
        getInitialViewportBounds={getInitialViewportBounds}
        navigateTo={navigateTo}
      />,
    );

    expect(subscribeViewport).toHaveBeenCalledOnce();
  });

  it('invoca el cleanup de subscribeViewport al desmontar', () => {
    const unsub = vi.fn();
    const subscribeViewport = vi.fn(() => unsub);
    const getInitialViewportBounds = vi.fn(() => null);
    const navigateTo = vi.fn();

    const { unmount } = render(
      <Minimap
        cityData={mockCityData}
        subscribeViewport={subscribeViewport}
        getInitialViewportBounds={getInitialViewportBounds}
        navigateTo={navigateTo}
      />,
    );

    act(() => {
      unmount();
    });

    expect(unsub).toHaveBeenCalledOnce();
  });

  it('pointerdown en el canvas llama navigateTo con coordenadas LngLat', () => {
    const subscribeViewport = vi.fn(() => vi.fn());
    const getInitialViewportBounds = vi.fn(() => mockViewport);
    const navigateTo = vi.fn();

    render(
      <Minimap
        cityData={mockCityData}
        subscribeViewport={subscribeViewport}
        getInitialViewportBounds={getInitialViewportBounds}
        navigateTo={navigateTo}
      />,
    );

    const canvas = screen.getByRole('application', { name: 'a11y.minimap' });

    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 160, height: 160 }),
    });
    Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(canvas, 'releasePointerCapture', { value: vi.fn() });

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 80, pointerId: 1 });

    expect(navigateTo).toHaveBeenCalledOnce();
    const [lng, lat] = (navigateTo as ReturnType<typeof vi.fn>).mock
      .calls[0] as [number, number];
    // csToGeoArray mock: x*0.0001 → swLng=-0.864, neLng=0.864
    // x=80 → lng = -0.864 + (80/160)*1.728 = 0
    expect(lng).toBeCloseTo(0, 3);
    // y=80 → lat = 0.864 - (80/160)*1.728 = 0
    expect(lat).toBeCloseTo(0, 3);
  });

  it('pointermove dispara navigateTo solo cuando isDragging está activo', () => {
    const subscribeViewport = vi.fn(() => vi.fn());
    const getInitialViewportBounds = vi.fn(() => null);
    const navigateTo = vi.fn();

    render(
      <Minimap
        cityData={mockCityData}
        subscribeViewport={subscribeViewport}
        getInitialViewportBounds={getInitialViewportBounds}
        navigateTo={navigateTo}
      />,
    );

    const canvas = screen.getByRole('application', { name: 'a11y.minimap' });
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 160, height: 160 }),
    });
    Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn() });
    Object.defineProperty(canvas, 'releasePointerCapture', { value: vi.fn() });

    // Move without prior pointerDown → should NOT navigate
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40 });
    expect(navigateTo).not.toHaveBeenCalled();

    // PointerDown starts drag → navigateTo called
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 80, pointerId: 1 });
    expect(navigateTo).toHaveBeenCalledTimes(1);

    // Move while dragging → navigateTo called again
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40, pointerId: 1 });
    expect(navigateTo).toHaveBeenCalledTimes(2);

    // PointerUp stops drag → subsequent move should NOT navigate
    fireEvent.pointerUp(canvas, { clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 120 });
    expect(navigateTo).toHaveBeenCalledTimes(2);
  });

  it('el pre-renderizado dibuja el fondo de terreno', () => {
    const subscribeViewport = vi.fn(() => vi.fn());
    const getInitialViewportBounds = vi.fn(() => null);
    const navigateTo = vi.fn();

    render(
      <Minimap
        cityData={mockCityData}
        subscribeViewport={subscribeViewport}
        getInitialViewportBounds={getInitialViewportBounds}
        navigateTo={navigateTo}
      />,
    );

    // The pre-render effect fills the offscreen canvas with terrain color
    expect(mockCtx.fillRect).toHaveBeenCalled();
  });

  it('repinta con la paleta del tema activo cuando esta cambia', () => {
    const fills: string[] = [];
    mockCtx.fillRect.mockImplementation(() => {
      fills.push(String(mockCtx.fillStyle));
    });
    const props = {
      cityData: mockCityData,
      subscribeViewport: vi.fn(() => vi.fn()),
      getInitialViewportBounds: vi.fn(() => null),
      navigateTo: vi.fn(),
    };

    const { rerender } = render(
      <Minimap
        {...props}
        palette={{ water: '#111111', land: '#222222', highway: '#333333' }}
      />,
    );
    expect(fills).toContain('#111111');

    rerender(
      <Minimap
        {...props}
        palette={{ water: '#aabbcc', land: '#ddeeff', highway: '#445566' }}
      />,
    );
    expect(fills).toContain('#aabbcc');

    mockCtx.fillRect.mockReset();
  });
});

describe('highway pre-render', () => {
  const cityWithRoads: CityData = {
    ...mockCityData,
    roadNodes: [
      { id: 'n0', position: { x: 0, y: 0, z: 0 } },
      { id: 'n1', position: { x: 1000, y: 0, z: 0 } },
      { id: 'n2', position: { x: 2000, y: 0, z: 0 } },
      { id: 'n3', position: { x: 3000, y: 0, z: 0 } },
    ],
    roadSegments: [
      {
        id: 'hw-tunnel',
        startNodeId: 'n0',
        endNodeId: 'n1',
        points: [],
        wayType: ['Road', 'Tunnel'],
        itemClass: 'Highway Tunnel',
        width: 32,
      },
      {
        id: 'small',
        startNodeId: 'n1',
        endNodeId: 'n2',
        points: [],
        wayType: ['Road'],
        itemClass: 'Small Road',
        width: 16,
      },
      {
        id: 'modded-hw',
        startNodeId: 'n2',
        endNodeId: 'n3',
        points: [],
        wayType: ['Highway'],
        itemClass: 'Super Freeway DLC',
        width: 8,
      },
    ],
  };

  const props = {
    subscribeViewport: vi.fn(() => vi.fn()),
    getInitialViewportBounds: vi.fn(() => null),
    navigateTo: vi.fn(),
  };

  it('strokes every highway-tier segment, and only those, at palette.highway', () => {
    const palette = { water: '#111111', land: '#222222', highway: '#334455' };

    render(<Minimap {...props} cityData={cityWithRoads} palette={palette} />);

    // `Highway Tunnel` (item class) and the modded `wayType: ['Highway']`
    // asset both classify as the highway tier; `Small Road` does not.
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.strokeStyle).toBe(palette.highway);
    expect(mockCtx.moveTo).toHaveBeenCalledTimes(2);
    expect(mockCtx.lineTo).toHaveBeenCalledTimes(2);
  });

  it('draws no road strokes when the city has no highway-tier segments', () => {
    const noHighways: CityData = {
      ...cityWithRoads,
      roadSegments: cityWithRoads.roadSegments.filter(
        (s) => s.itemClass === 'Small Road',
      ),
    };

    render(<Minimap {...props} cityData={noHighways} />);

    expect(mockCtx.moveTo).not.toHaveBeenCalled();
    expect(mockCtx.lineTo).not.toHaveBeenCalled();
  });
});

describe('keyboard navigation', () => {
  const bounds = {
    westLng: -0.5,
    eastLng: 0.5,
    northLat: 0.5,
    southLat: -0.5,
  };

  function renderForKeyboard() {
    const navigateTo = vi.fn();
    render(
      <Minimap
        cityData={mockCityData}
        subscribeViewport={(cb) => {
          cb(bounds);
          return () => {};
        }}
        getInitialViewportBounds={() => bounds}
        navigateTo={navigateTo}
      />,
    );
    const canvas = screen.getByRole('application', { name: 'a11y.minimap' });
    return { canvas, navigateTo };
  }

  it('is reachable by keyboard and describes its own commands', () => {
    const { canvas } = renderForKeyboard();
    expect(canvas).toHaveAttribute('tabindex', '0');
    expect(canvas).toHaveAttribute('aria-describedby');
  });

  it('pans by a fixed step on each arrow key', () => {
    const { canvas, navigateTo } = renderForKeyboard();

    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    const [rightLng, rightLat] = navigateTo.mock.calls[0] as [number, number];
    expect(rightLng).toBeGreaterThan(0);
    expect(rightLat).toBeCloseTo(0);

    fireEvent.keyDown(canvas, { key: 'ArrowUp' });
    const [upLng, upLat] = navigateTo.mock.calls[1] as [number, number];
    expect(upLng).toBeCloseTo(0);
    expect(upLat).toBeGreaterThan(0);
  });

  it('recentres on the city with Enter', () => {
    const { canvas, navigateTo } = renderForKeyboard();
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(navigateTo).toHaveBeenCalledTimes(1);
    const [lng, lat] = navigateTo.mock.calls[0] as [number, number];
    expect(lng).toBeCloseTo(0);
    expect(lat).toBeCloseTo(0);
  });

  it('ignores keys it does not handle', () => {
    const { canvas, navigateTo } = renderForKeyboard();
    fireEvent.keyDown(canvas, { key: 'a' });
    expect(navigateTo).not.toHaveBeenCalled();
  });
});
