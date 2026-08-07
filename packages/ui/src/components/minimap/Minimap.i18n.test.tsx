// packages/ui/src/components/minimap/Minimap.i18n.test.tsx
// Integración con i18next real (sin mock) — verifica el aria-label traducido en
// inglés y español, no solo la clave (complementa Minimap.test.tsx).
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { render, screen } from '../../test-utils';
import { Minimap } from './Minimap';
import { initI18n, i18n } from '../../i18n/i18n-setup';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
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

describe('Minimap — aria-label traducido (i18n real)', () => {
  beforeAll(async () => {
    await initI18n();
  });

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
    vi.restoreAllMocks();
  });

  function renderMinimap() {
    return render(
      <Minimap
        cityData={mockCityData}
        subscribeViewport={vi.fn(() => vi.fn())}
        getInitialViewportBounds={vi.fn(() => null)}
        navigateTo={vi.fn()}
      />,
    );
  }

  it('usa el string en inglés cuando el idioma activo es en', async () => {
    await i18n.changeLanguage('en');
    renderMinimap();
    expect(screen.getByRole('img', { name: en.a11y.minimap })).toBeDefined();
  });

  it('usa el string en español cuando el idioma activo es es', async () => {
    await i18n.changeLanguage('es');
    renderMinimap();
    expect(screen.getByRole('img', { name: es.a11y.minimap })).toBeDefined();
  });
});
