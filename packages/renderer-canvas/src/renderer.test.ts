// packages/renderer-canvas/src/renderer.test.ts
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { makeCityData } from '@vellum/core/testing';
import type { IRenderer } from '@vellum/core';
import { CanvasRenderer } from './renderer';

const ALL_LAYERS_VISIBLE = {
  terrain: true,
  water: true,
  roads: true,
  transit: true,
  buildings: true,
  forests: true,
  districts: true,
} as const;

const workerMock = vi.hoisted(() => ({
  constructor: vi.fn(),
  postMessage: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock('./worker/renderer-worker?worker', () => ({
  default: class MockRenderWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    postMessage = workerMock.postMessage;
    terminate = workerMock.terminate;

    constructor() {
      workerMock.constructor();
    }
  },
}));

function setDevicePixelRatio(value: number): void {
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  const MockWorker = class {};
  vi.stubGlobal('Worker', MockWorker);
  Object.defineProperty(window, 'Worker', {
    configurable: true,
    value: MockWorker,
  });
  workerMock.constructor.mockClear();
  workerMock.postMessage.mockClear();
  workerMock.terminate.mockClear();
  setDevicePixelRatio(1);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CityData factory', () => {
  it('creates a valid minimal CityData', () => {
    const cityData = makeCityData();

    expect(cityData.cityName).toBe('Test City');
    expect(cityData.roadSegments).toEqual([]);
    // Terrain is now vectorized — landPolygon/inlandWaterPolygons replace tiles
    expect(cityData.landPolygon).toBeDefined();
    expect(cityData.inlandWaterPolygons).toBeDefined();
    expect(Array.isArray(cityData.landPolygon)).toBe(true);
    expect(Array.isArray(cityData.inlandWaterPolygons)).toBe(true);
  });

  it('applies overrides correctly', () => {
    const cityData = makeCityData({ cityName: 'Mi Ciudad' });
    expect(cityData.cityName).toBe('Mi Ciudad');
    // Otros campos mantienen sus defaults
    expect(cityData.bounds.seaLevel).toBe(40);
  });
});

describe('CanvasRenderer', () => {
  it('instancia sin errores', () => {
    const renderer = new CanvasRenderer();
    expect(renderer).toBeDefined();
    renderer.dispose();
  });

  it('implementa el contrato IRenderer', () => {
    const renderer: IRenderer = new CanvasRenderer();
    expect(typeof renderer.render).toBe('function');
    expect(typeof renderer.updateViewport).toBe('function');
    expect(typeof renderer.resize).toBe('function');
    expect(typeof renderer.dispose).toBe('function');
    renderer.dispose();
  });

  it('convierte pan CSS a píxeles físicos antes de enviarlo al worker', () => {
    setDevicePixelRatio(2);
    const renderer = new CanvasRenderer();
    void renderer.render(makeCityData(), { activeLayers: ALL_LAYERS_VISIBLE });
    workerMock.postMessage.mockClear();

    renderer.updateViewport(1.5, 12, -4);

    expect(workerMock.postMessage).toHaveBeenCalledWith({
      type: 'update-viewport',
      viewport: { zoom: 1.5, panX: 24, panY: -8 },
    });

    renderer.dispose();
  });
});
