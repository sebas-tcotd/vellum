import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, fireEvent } from '../../test-utils';
import { FloatingLayerPanel } from './FloatingLayerPanel';
import type { LayerName, LayerVisibility, ThemeMetadata } from '@vellum/core';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockActiveLayers: LayerVisibility = {
  terrain: true,
  basemap: true,
  roads: true,
  transit: true,
  buildings: true,
  forests: true,
  districts: true,
};

const mockToggleLayer = vi.fn();
const mockSetActiveTheme = vi.fn();
const mockSetTransitDimmingEnabled = vi.fn();
const mockToggleTransitMode = vi.fn();
const mockToggleBuildingCategory = vi.fn();
const mockSetBuildingColorByCategory = vi.fn();
const mockSetDistrictsShowNameOnMap = vi.fn();
const mockSetDistrictsShowParkAreas = vi.fn();
const mockSetTerrainShowContourLines = vi.fn();
const mockSetTerrainShowColorRelief = vi.fn();
const mockSetTerrainShowHillshade = vi.fn();
let mockAvailableThemes: ThemeMetadata[] = [];
let mockExpandedPanelLayer: LayerName | null = null;
let mockActiveTheme = 'day';
let mockTransitDimmingEnabled = false;

const mockLayerOptions = {
  transit: {
    visibleModes: [
      'Bus',
      'Tram',
      'Train',
      'Metro',
      'CableCar',
      'Monorail',
      'Ferry',
      'Blimp',
      'Trolleybus',
    ],
  },
  buildings: {
    visibleCategories: ['residential', 'commercial', 'office', 'industry'],
    colorByCategory: false,
  },
  districts: { showNameOnMap: false, showParkAreas: false },
  terrain: {
    showContourLines: true,
    showColorRelief: true,
    showHillshade: true,
  },
  basemap: { showGrid: false },
};

vi.mock('../../store/vellum-store', () => ({
  useVellumStore: (selector: (s: unknown) => unknown) =>
    selector({
      activeLayers: mockActiveLayers,
      toggleLayer: mockToggleLayer,
      availableThemes: mockAvailableThemes,
      activeTheme: mockActiveTheme,
      transitDimmingEnabled: mockTransitDimmingEnabled,
      setActiveTheme: mockSetActiveTheme,
      setTransitDimmingEnabled: mockSetTransitDimmingEnabled,
      layerOptions: mockLayerOptions,
      toggleTransitMode: mockToggleTransitMode,
      toggleBuildingCategory: mockToggleBuildingCategory,
      setBuildingColorByCategory: mockSetBuildingColorByCategory,
      setDistrictsShowNameOnMap: mockSetDistrictsShowNameOnMap,
      setDistrictsShowParkAreas: mockSetDistrictsShowParkAreas,
      setTerrainShowContourLines: mockSetTerrainShowContourLines,
      setBasemapShowGrid: vi.fn(),
      setTerrainShowColorRelief: mockSetTerrainShowColorRelief,
      setTerrainShowHillshade: mockSetTerrainShowHillshade,
      expandedPanelLayer: mockExpandedPanelLayer,
      setExpandedPanelLayer: (
        layer: import('@vellum/core').LayerName | null,
      ) => {
        mockExpandedPanelLayer = layer;
      },
    }),
}));

describe('FloatingLayerPanel', () => {
  beforeEach(() => {
    mockToggleLayer.mockClear();
    mockSetActiveTheme.mockClear();
    mockAvailableThemes = [];
    mockActiveTheme = 'day';
    mockTransitDimmingEnabled = false;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC1 — Posición y estilos', () => {
    it('tiene clases de posición fixed, left-4, top-1/2, -translate-y-1/2 sin panel avanzado abierto', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild as HTMLElement;
      expect(panel.className).toContain('fixed');
      expect(panel.className).toContain('left-4');
      expect(panel.className).toContain('top-1/2');
      expect(panel.className).toContain('-translate-y-1/2');
    });

    it('tiene clase rounded-lg y backdrop-blur', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild!.firstChild as HTMLElement;
      expect(panel.className).toContain('rounded-lg');
      expect(panel.className).toContain('backdrop-blur');
    });
  });

  describe('Posición dinámica del stack al abrir el panel avanzado', () => {
    const setViewportHeight = (height: number) => {
      Object.defineProperty(window, 'innerHeight', {
        value: height,
        configurable: true,
        writable: true,
      });
    };

    afterEach(() => {
      setViewportHeight(768);
    });

    it('ancla arriba (top-4) al abrir el panel avanzado en una ventana corta', () => {
      setViewportHeight(700);
      const { container, rerender } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(
        screen.getAllByRole('button', {
          name: 'a11y.advancedOptionsToggle',
        })[0],
      );
      rerender(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('top-4');
      expect(wrapper.className).not.toContain('top-1/2');
    });

    it('permanece centrado al abrir el panel avanzado en una ventana alta (pantalla completa)', () => {
      setViewportHeight(1200);
      const { container, rerender } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(
        screen.getAllByRole('button', {
          name: 'a11y.advancedOptionsToggle',
        })[0],
      );
      rerender(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('top-1/2');
      expect(wrapper.className).not.toContain('top-4');
    });

    it('vuelve a centrarse al cerrar el panel avanzado, incluso en ventana corta', () => {
      setViewportHeight(700);
      const { container, rerender } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const toggleBtn = screen.getAllByRole('button', {
        name: 'a11y.advancedOptionsToggle',
      })[0];
      fireEvent.click(toggleBtn);
      rerender(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(toggleBtn);
      rerender(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('top-1/2');
      expect(wrapper.className).not.toContain('top-4');
    });
  });

  describe('AC2 — Header con nombre de ciudad', () => {
    it('muestra el nombre de la ciudad en estado expanded', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      expect(screen.getByText('Altavento')).toBeInTheDocument();
    });

    it('muestra el nombre de ciudad correcto con nombre largo', () => {
      render(
        <FloatingLayerPanel
          cityName="Aurelia del Delta"
          fileName="aurelia.cslmap"
        />,
      );
      expect(screen.getByText('Aurelia del Delta')).toBeInTheDocument();
    });
  });

  describe('AC3 — Filas de capas', () => {
    it('renderiza 7 switches — uno por capa', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const switches = screen.getAllByRole('switch');
      expect(switches).toHaveLength(7);
    });

    it('cada switch refleja el estado de activeLayers', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      screen.getAllByRole('switch').forEach((sw) => {
        expect(sw.getAttribute('aria-checked')).toBe('true');
      });
    });

    it('llama toggleLayer al hacer click en un switch', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(screen.getAllByRole('switch')[0]);
      expect(mockToggleLayer).toHaveBeenCalledWith('terrain');
    });
  });

  describe('AC4 — Colapsar', () => {
    it('el botón de colapso tiene aria-label correcto', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      expect(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      ).toBeInTheDocument();
    });

    it('cambia data-state a collapsed al hacer click en colapso', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild!.firstChild as HTMLElement;
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      expect(panel.getAttribute('data-state')).toBe('collapsed');
    });

    it('panel tiene clase w-12 en estado collapsed', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild!.firstChild as HTMLElement;
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      expect(panel.className).toContain('w-12');
    });

    it('oculta el wordmark al colapsar', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      expect(screen.queryByText('Vellum')).toBeNull();
    });
  });

  describe('AC5 — Expandir', () => {
    it('el botón de expandir tiene aria-label correcto en estado collapsed', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      expect(
        screen.getByRole('button', { name: 'a11y.layerPanelExpand' }),
      ).toBeInTheDocument();
    });

    it('vuelve a expanded al hacer click en expandir', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild!.firstChild as HTMLElement;
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      expect(panel.getAttribute('data-state')).toBe('collapsed');
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelExpand' }),
      );
      expect(panel.getAttribute('data-state')).toBe('expanded');
    });

    it('panel recupera la clase de ancho expandido al expandir', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild!.firstChild as HTMLElement;
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelExpand' }),
      );
      expect(panel.className).not.toContain('w-12');
    });
  });

  describe('AC6 — Footer link', () => {
    it('muestra el link de footer en estado expanded', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      expect(screen.getByText('Cartógrafos de CS1 →')).toBeInTheDocument();
    });

    it('no muestra el footer en estado collapsed', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      expect(screen.queryByText('Cartógrafos de CS1 →')).toBeNull();
    });
  });

  describe('Story 6.1 — apertura de exportación', () => {
    it('llama onOpenExport desde el panel expandido', async () => {
      const user = userEvent.setup();
      const onOpenExport = vi.fn();
      render(
        <FloatingLayerPanel
          cityName="Altavento"
          fileName="altavento.cslmap"
          onOpenExport={onOpenExport}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: 'export.exportButton' }),
      );

      expect(onOpenExport).toHaveBeenCalledOnce();
    });

    it('mantiene un trigger accesible al colapsar el panel', async () => {
      const user = userEvent.setup();
      const onOpenExport = vi.fn();
      render(
        <FloatingLayerPanel
          cityName="Altavento"
          fileName="altavento.cslmap"
          onOpenExport={onOpenExport}
        />,
      );
      await user.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );

      await user.click(
        screen.getByRole('button', { name: 'export.exportButton' }),
      );

      expect(onOpenExport).toHaveBeenCalledOnce();
    });
  });

  describe('Story 5.1 — Selector de temas (pills)', () => {
    const themes: ThemeMetadata[] = [
      { id: 'day', name: 'Day', source: 'built-in' },
      { id: 'transit', name: 'Transit', source: 'built-in' },
    ];

    it('no renderiza el grupo de temas cuando availableThemes está vacío', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      expect(
        screen.queryByRole('group', { name: 'a11y.themeSelector' }),
      ).toBeNull();
    });

    it('renderiza un pill por cada tema disponible', () => {
      mockAvailableThemes = themes;
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const group = screen.getByRole('group', { name: 'a11y.themeSelector' });
      expect(group.querySelectorAll('button')).toHaveLength(2);
      expect(screen.getByText('Day')).toBeInTheDocument();
      expect(screen.getByText('Transit')).toBeInTheDocument();
    });

    it('marca aria-pressed en el tema activo', () => {
      mockAvailableThemes = themes;
      mockActiveTheme = 'transit';
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      expect(screen.getByText('Transit')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByText('Day')).toHaveAttribute('aria-pressed', 'false');
    });

    it('llama setActiveTheme con el id al hacer click en un pill', () => {
      mockAvailableThemes = themes;
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(screen.getByText('Transit'));
      expect(mockSetActiveTheme).toHaveBeenCalledWith('transit');
    });
  });

  describe('Story 5.3 — dimming del panel, opt-in (theme cableado a LayerToggleRow)', () => {
    it('pasa theme="day" a los switches cuando activeTheme es day', () => {
      mockActiveTheme = 'day';
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      screen.getAllByRole('switch').forEach((sw) => {
        const dot = sw.parentElement?.querySelector('[aria-hidden="true"]');
        expect(dot).toHaveStyle({ opacity: '1' });
      });
    });

    it('pasa theme="day" (no dimming) cuando activeTheme es transit pero transitDimmingEnabled es false (default)', () => {
      mockActiveTheme = 'transit';
      mockTransitDimmingEnabled = false;
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      screen.getAllByRole('switch').forEach((sw) => {
        const dot = sw.parentElement?.querySelector('[aria-hidden="true"]');
        expect(dot).toHaveStyle({ opacity: '1' });
      });
    });

    it('pasa theme="transit" a los switches cuando activeTheme es transit y transitDimmingEnabled es true', () => {
      mockActiveTheme = 'transit';
      mockTransitDimmingEnabled = true;
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      screen.getAllByRole('switch').forEach((sw) => {
        const dot = sw.parentElement?.querySelector('[aria-hidden="true"]');
        expect(dot).toHaveStyle({ opacity: '0.4' });
      });
    });
  });

  describe('AC7 — Aria y estado del panel', () => {
    it('aria-expanded es true en estado expanded', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild!.firstChild as HTMLElement;
      expect(panel.getAttribute('aria-expanded')).toBe('true');
    });

    it('aria-expanded es false en estado collapsed', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild!.firstChild as HTMLElement;
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      expect(panel.getAttribute('aria-expanded')).toBe('false');
    });

    it('el panel tiene role region y aria-label', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      expect(
        screen.getByRole('region', { name: 'a11y.layerPanel' }),
      ).toBeInTheDocument();
    });
  });

  describe('WCAG 1.3.1 — Estructura semántica y HTML válido', () => {
    it('en estado collapsed, el wrapper de iconos no tiene rol interactivo', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild!.firstChild as HTMLElement;
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      const innerContainer = panel.firstChild as HTMLElement;
      // El contenedor no tiene role="button" — no es un elemento interactivo
      expect(innerContainer).not.toHaveAttribute('role', 'button');
      // El botón de expandir es hijo directo del wrapper, no padre de los botones de capa
      const expandBtn = screen.getByRole('button', {
        name: 'a11y.layerPanelExpand',
      });
      expect(expandBtn.parentElement).toBe(innerContainer);
    });

    it('en estado collapsed, ningún botón contiene otros botones', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      const allButtons = screen.getAllByRole('button');
      for (const btn of allButtons) {
        const nestedButtons = btn.querySelectorAll('button');
        expect(nestedButtons.length).toBe(0);
      }
    });

    it('el botón de expandir existe como elemento separado en estado collapsed', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      expect(
        screen.getByRole('button', { name: 'a11y.layerPanelExpand' }),
      ).toBeInTheDocument();
    });

    it('el heading de fileName es h2 (jerarquía h1→h2 correcta)', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const h2 = container.querySelector('h2');
      expect(h2).not.toBeNull();
      expect(h2?.textContent).toBe('altavento.cslmap');
    });

    it('el heading h2 sigue presente tras ciclo colapsar→expandir', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelExpand' }),
      );
      const h2 = container.querySelector('h2');
      expect(h2).not.toBeNull();
      expect(h2?.textContent).toBe('altavento.cslmap');
    });
  });

  describe('AC1 — Navegación de teclado', () => {
    it('todos los controles interactivos son alcanzables por teclado en estado expanded', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const focusable = container.querySelectorAll<HTMLElement>(
        'button:not([tabindex="-1"]), [role="switch"]:not([tabindex="-1"]), a[href]:not([tabindex="-1"])',
      );
      // Botón colapsar + 7 switches + link footer = 9 elementos
      expect(focusable.length).toBeGreaterThanOrEqual(9);
    });

    it('el botón de expansión es focusable en estado collapsed', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      const expandBtn = screen.getByRole('button', {
        name: 'a11y.layerPanelExpand',
      });
      expandBtn.focus();
      expect(document.activeElement).toBe(expandBtn);
    });

    it('Tab desde el botón colapsar llega al primer switch', async () => {
      const user = userEvent.setup();
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const collapseBtn = screen.getByRole('button', {
        name: 'a11y.layerPanelCollapse',
      });
      collapseBtn.focus();
      // Primer Tab: botón de opciones avanzadas de Terreno
      await user.tab();
      // Segundo Tab: switch de Terreno (primer switch del panel)
      await user.tab();
      const firstSwitch = screen.getAllByRole('switch')[0];
      expect(document.activeElement).toBe(firstSwitch);
    });

    it('los botones de capa en estado collapsed son focusables (aria-pressed)', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      const layerButtons = screen
        .getAllByRole('button')
        .filter((b) => b.hasAttribute('aria-pressed'));
      expect(layerButtons).toHaveLength(7);
      layerButtons.forEach((btn) => {
        expect(btn).not.toHaveAttribute('tabindex', '-1');
      });
    });
  });
});
