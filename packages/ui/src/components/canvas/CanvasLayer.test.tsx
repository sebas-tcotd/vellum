// packages/ui/src/components/canvas/CanvasLayer.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '../../test-utils';
import { CanvasLayer } from './CanvasLayer';

describe('CanvasLayer — accessibility', () => {
  it('renders with role="img" by default', () => {
    const { container } = render(
      <CanvasLayer
        layerName="terrain"
        zIndex={0}
        visible={true}
        ariaLabel="City map canvas"
      />,
    );
    expect(container.querySelector('canvas')?.getAttribute('role')).toBe('img');
  });

  it('renders with the provided aria-label', () => {
    const { container } = render(
      <CanvasLayer
        layerName="terrain"
        zIndex={0}
        visible={true}
        ariaLabel="City map canvas"
      />,
    );
    expect(container.querySelector('canvas')?.getAttribute('aria-label')).toBe(
      'City map canvas',
    );
  });

  it('omits aria-label when the prop is not provided', () => {
    const { container } = render(
      <CanvasLayer layerName="roads" zIndex={1} visible={true} />,
    );
    // An empty aria-label is worse than no aria-label for screen readers
    expect(
      container.querySelector('canvas')?.getAttribute('aria-label'),
    ).toBeNull();
  });

  it('derives the DOM id from layerName', () => {
    const { container } = render(
      <CanvasLayer layerName="basemap" zIndex={2} visible={false} />,
    );
    expect(container.querySelector('canvas')?.id).toBe('layer-basemap');
  });
});

describe('CanvasLayer — visibility', () => {
  it('sets opacity to 1 when visible is true', () => {
    const { container } = render(
      <CanvasLayer layerName="transit" zIndex={3} visible={true} />,
    );
    expect(
      (container.querySelector('canvas') as HTMLCanvasElement).style.opacity,
    ).toBe('1');
  });

  it('sets opacity to 0 when visible is false', () => {
    const { container } = render(
      <CanvasLayer layerName="transit" zIndex={3} visible={false} />,
    );
    expect(
      (container.querySelector('canvas') as HTMLCanvasElement).style.opacity,
    ).toBe('0');
  });

  it('keeps the canvas in the DOM when visible changes to false (critical invariant)', () => {
    const { container, rerender } = render(
      <CanvasLayer layerName="terrain" zIndex={0} visible={true} />,
    );
    rerender(<CanvasLayer layerName="terrain" zIndex={0} visible={false} />);
    // The canvas must never be unmounted — unmounting destroys the WebGL context
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});

describe('CanvasLayer — z-index', () => {
  it('applies the provided zIndex as an inline style', () => {
    const { container } = render(
      <CanvasLayer layerName="terrain" zIndex={5} visible={true} />,
    );
    expect(
      (container.querySelector('canvas') as HTMLCanvasElement).style.zIndex,
    ).toBe('5');
  });
});

describe('CanvasLayer — decorative prop', () => {
  it('sets aria-hidden and removes role and aria-label when decorative is true', () => {
    const { container } = render(
      <CanvasLayer
        layerName="background"
        zIndex={0}
        visible={true}
        ariaLabel="should be ignored"
        decorative={true}
      />,
    );
    const canvas = container.querySelector('canvas')!;
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.getAttribute('role')).toBeNull();
    expect(canvas.getAttribute('aria-label')).toBeNull();
  });
});
