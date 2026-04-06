// packages/ui/src/components/canvas/CanvasLayer.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CanvasLayer } from './CanvasLayer';

describe('CanvasLayer — accesibilidad (Task 7 — code review finding)', () => {
  it('el canvas tiene role="img"', () => {
    const { container } = render(
      <CanvasLayer layerName="terrain" zIndex={0} visible={true} ariaLabel="City map canvas" />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('role')).toBe('img');
  });

  it('el canvas tiene aria-label cuando se pasa la prop', () => {
    const { container } = render(
      <CanvasLayer layerName="terrain" zIndex={0} visible={true} ariaLabel="City map canvas" />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas?.getAttribute('aria-label')).toBe('City map canvas');
  });

  it('ariaLabel es opcional y por defecto es cadena vacía', () => {
    const { container } = render(
      <CanvasLayer layerName="roads" zIndex={1} visible={true} />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas?.getAttribute('aria-label')).toBe('');
  });

  it('el canvas tiene id derivado de layerName', () => {
    const { container } = render(
      <CanvasLayer layerName="water" zIndex={2} visible={false} />
    );
    const canvas = container.querySelector('canvas');
    expect(canvas?.id).toBe('layer-water');
  });

  it('la opacidad refleja el estado visible', () => {
    const { container: c1 } = render(
      <CanvasLayer layerName="transit" zIndex={3} visible={true} />
    );
    const { container: c2 } = render(
      <CanvasLayer layerName="transit" zIndex={3} visible={false} />
    );
    expect((c1.querySelector('canvas') as HTMLCanvasElement).style.opacity).toBe('1');
    expect((c2.querySelector('canvas') as HTMLCanvasElement).style.opacity).toBe('0');
  });
});
