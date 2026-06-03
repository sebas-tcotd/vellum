import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CanvasManager } from './canvas-manager';
import type { LayerName } from './canvas-manager';

function createContainer(width = 800, height = 600): HTMLElement {
  const div = document.createElement('div');
  Object.defineProperty(div, 'clientWidth', {
    value: width,
    configurable: true,
  });
  Object.defineProperty(div, 'clientHeight', {
    value: height,
    configurable: true,
  });
  document.body.appendChild(div);
  return div;
}

describe('CanvasManager', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  it('crea canvases para terrain y water al construir', () => {
    const manager = new CanvasManager(container);
    expect(manager.getCanvas('terrain')).toBeDefined();
    expect(manager.getCanvas('water')).toBeDefined();
    manager.destroy();
  });

  it('asigna z-index correcto a cada capa', () => {
    const manager = new CanvasManager(container);
    expect(manager.getCanvas('terrain')?.style.zIndex).toBe('1');
    expect(manager.getCanvas('forests')?.style.zIndex).toBe('2');
    expect(manager.getCanvas('water')?.style.zIndex).toBe('3');
    manager.destroy();
  });

  it('aplica devicePixelRatio al crear canvas con tamaño cuadrado', () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: 2,
      configurable: true,
    });
    // Canvas es siempre cuadrado: max(800, 600) = 800
    const manager = new CanvasManager(createContainer(800, 600));
    const canvas = manager.getCanvas('terrain');
    expect(canvas?.width).toBe(800 * 2);
    expect(canvas?.height).toBe(800 * 2);
    manager.destroy();
  });

  it('expone offscreen canvas para cada capa', () => {
    const manager = new CanvasManager(container);
    expect(manager.getOffscreen('terrain')).toBeDefined();
    expect(manager.getOffscreen('water')).toBeDefined();
    manager.destroy();
  });

  it('destroy elimina los canvases del DOM', () => {
    const manager = new CanvasManager(container);
    manager.destroy();
    expect(container.querySelectorAll('canvas').length).toBe(0);
  });

  describe('initialVisibility constructor option', () => {
    it('canvas starts hidden when initialVisibility sets layer to false', () => {
      const manager = new CanvasManager(container, { terrain: false });
      expect(manager.getCanvas('terrain')?.style.opacity).toBe('0');
      expect(manager.getCanvas('water')?.style.opacity).toBe('1');
      manager.destroy();
    });

    it('all canvases start visible when no initialVisibility provided', () => {
      const manager = new CanvasManager(container);
      expect(manager.getCanvas('terrain')?.style.opacity).toBe('1');
      expect(manager.getCanvas('forests')?.style.opacity).toBe('1');
      manager.destroy();
    });

    it('missing keys in initialVisibility default to visible', () => {
      const manager = new CanvasManager(container, { roads: false });
      expect(manager.getCanvas('terrain')?.style.opacity).toBe('1');
      expect(manager.getCanvas('roads')?.style.opacity).toBe('0');
      manager.destroy();
    });
  });

  describe('setLayerVisibility', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('setLayerVisibility(layer, false) sets canvas opacity to 0', () => {
      const manager = new CanvasManager(container);
      manager.setLayerVisibility('terrain', false);
      expect(manager.getCanvas('terrain')?.style.opacity).toBe('0');
      manager.destroy();
    });

    it('setLayerVisibility(layer, true) sets canvas opacity to 1', () => {
      const manager = new CanvasManager(container);
      manager.setLayerVisibility('terrain', false);
      manager.setLayerVisibility('terrain', true);
      expect(manager.getCanvas('terrain')?.style.opacity).toBe('1');
      manager.destroy();
    });

    it('setLayerVisibility with unknown layer is a no-op', () => {
      const manager = new CanvasManager(container);
      expect(() =>
        manager.setLayerVisibility('nonexistent' as LayerName, false),
      ).not.toThrow();
      manager.destroy();
    });

    it('setLayerVisibility after destroy is a no-op', () => {
      const manager = new CanvasManager(container);
      manager.destroy();
      expect(() => manager.setLayerVisibility('terrain', false)).not.toThrow();
    });

    it('setLayerVisibility with delay after destroy is a no-op', () => {
      vi.useFakeTimers();
      const manager = new CanvasManager(container);
      manager.destroy();
      expect(() =>
        manager.setLayerVisibility('terrain', false, 100),
      ).not.toThrow();
      expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    });

    it('setLayerVisibility with delayMs applies opacity after the delay', () => {
      vi.useFakeTimers();
      const manager = new CanvasManager(container);
      manager.setLayerVisibility('roads', false, 40);
      // Not yet applied
      expect(manager.getCanvas('roads')?.style.opacity).toBe('1');
      vi.advanceTimersByTime(40);
      expect(manager.getCanvas('roads')?.style.opacity).toBe('0');
      manager.destroy();
    });

    it('concurrent calls: second call cancels the first pending timeout', () => {
      vi.useFakeTimers();
      const manager = new CanvasManager(container);
      manager.setLayerVisibility('terrain', false, 100);
      // Before the first timeout fires, schedule a second call (visible=true)
      manager.setLayerVisibility('terrain', true, 50);
      vi.advanceTimersByTime(50);
      // Only the second call's result should apply
      expect(manager.getCanvas('terrain')?.style.opacity).toBe('1');
      vi.advanceTimersByTime(100);
      // First timeout was cancelled — opacity must remain '1'
      expect(manager.getCanvas('terrain')?.style.opacity).toBe('1');
      manager.destroy();
    });

    it('destroy cancels all pending timeouts', () => {
      vi.useFakeTimers();
      const manager = new CanvasManager(container);
      manager.setLayerVisibility('terrain', false, 200);
      manager.setLayerVisibility('water', false, 200);
      manager.destroy();
      // Advance past the delay — callbacks must not throw on detached canvases
      expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    });

    it('negative delayMs is treated as immediate', () => {
      const manager = new CanvasManager(container);
      manager.setLayerVisibility('terrain', false, -50);
      expect(manager.getCanvas('terrain')?.style.opacity).toBe('0');
      manager.destroy();
    });

    it('NaN delayMs is treated as immediate', () => {
      const manager = new CanvasManager(container);
      manager.setLayerVisibility('terrain', false, NaN);
      expect(manager.getCanvas('terrain')?.style.opacity).toBe('0');
      manager.destroy();
    });

    it('uses CSS transition token instead of hardcoded Tailwind class', () => {
      const manager = new CanvasManager(container);
      const canvas = manager.getCanvas('terrain');
      expect(canvas?.style.transition).toBe(
        'opacity var(--transition-layer, 200ms ease)',
      );
      expect(canvas?.className).not.toContain('duration-200');
      manager.destroy();
    });
  });
});
