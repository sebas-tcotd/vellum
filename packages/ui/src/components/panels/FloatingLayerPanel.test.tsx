import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../test-utils';
import { FloatingLayerPanel } from './FloatingLayerPanel';
import type { LayerVisibility } from '@vellum/core';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockActiveLayers: LayerVisibility = {
  terrain: true,
  water: true,
  roads: true,
  transit: true,
  buildings: true,
  forests: true,
  districts: true,
};

const mockToggleLayer = vi.fn();

vi.mock('../../store/vellum-store', () => ({
  useVellumStore: (selector: (s: unknown) => unknown) =>
    selector({
      activeLayers: mockActiveLayers,
      toggleLayer: mockToggleLayer,
    }),
}));

describe('FloatingLayerPanel', () => {
  beforeEach(() => {
    mockToggleLayer.mockClear();
  });

  describe('AC1 — Posición y estilos', () => {
    it('tiene clases de posición fixed, left-4, top-1/2, -translate-y-1/2', () => {
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
      const panel = container.firstChild as HTMLElement;
      expect(panel.className).toContain('rounded-lg');
      expect(panel.className).toContain('backdrop-blur');
    });
  });

  describe('AC2 — Header con nombre de ciudad', () => {
    it('muestra el nombre de la ciudad en estado expanded', () => {
      render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      expect(screen.getByText('Altavento')).toBeDefined();
    });

    it('muestra el nombre de ciudad correcto con nombre largo', () => {
      render(
        <FloatingLayerPanel
          cityName="Aurelia del Delta"
          fileName="aurelia.cslmap"
        />,
      );
      expect(screen.getByText('Aurelia del Delta')).toBeDefined();
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
      ).toBeDefined();
    });

    it('cambia data-state a collapsed al hacer click en colapso', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild as HTMLElement;
      fireEvent.click(
        screen.getByRole('button', { name: 'a11y.layerPanelCollapse' }),
      );
      expect(panel.getAttribute('data-state')).toBe('collapsed');
    });

    it('panel tiene clase w-12 en estado collapsed', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild as HTMLElement;
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
      ).toBeDefined();
    });

    it('vuelve a expanded al hacer click en expandir', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild as HTMLElement;
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
      const panel = container.firstChild as HTMLElement;
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
      expect(screen.getByText('Cartógrafos de CS1 →')).toBeDefined();
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

  describe('AC7 — Aria y estado del panel', () => {
    it('aria-expanded es true en estado expanded', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild as HTMLElement;
      expect(panel.getAttribute('aria-expanded')).toBe('true');
    });

    it('aria-expanded es false en estado collapsed', () => {
      const { container } = render(
        <FloatingLayerPanel cityName="Altavento" fileName="altavento.cslmap" />,
      );
      const panel = container.firstChild as HTMLElement;
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
      ).toBeDefined();
    });
  });
});
