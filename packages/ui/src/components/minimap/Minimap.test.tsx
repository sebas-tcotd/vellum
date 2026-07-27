import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '../../test-utils';
import { Minimap } from './Minimap';
import type { ViewportBounds } from '@vellum/renderer-webgl';
import type { CityData } from '@vellum/core';

vi.mock('@vellum/renderer-webgl', () => ({
  csToGeoArray: ({ x, z }: { x: number; z: number }) => [
    x * 0.0001,
    z * 0.0001,
  ],
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
      screen.getByRole('img', { name: 'Minimap de navegación' }),
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

    const canvas = screen.getByRole('img', { name: 'Minimap de navegación' });

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

    const canvas = screen.getByRole('img', { name: 'Minimap de navegación' });
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
});
