import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasManager } from './canvas-manager';

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
    expect(manager.getCanvas('water')?.style.zIndex).toBe('2');
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
});
