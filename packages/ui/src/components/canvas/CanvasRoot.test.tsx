// packages/ui/src/components/canvas/CanvasRoot.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../../test-utils';
import { CanvasRoot } from './CanvasRoot';

describe('CanvasRoot — RAF lifecycle', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => {
      // Do NOT invoke the callback — calling it synchronously would re-enter the
      // loop and overflow the call stack. We only need to assert it was called.
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the RAF loop on mount', () => {
    render(<CanvasRoot />);
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it('cancels the RAF loop on unmount', () => {
    const { unmount } = render(<CanvasRoot />);
    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });
});

describe('CanvasRoot — rendering', () => {
  it('renders a container with the canvas-root class', () => {
    const { container } = render(<CanvasRoot />);
    expect(container.querySelector('.canvas-root')).not.toBeNull();
  });

  it('renders with role="region" for accessibility', () => {
    const { container } = render(<CanvasRoot />);
    expect(container.querySelector('[role="region"]')).not.toBeNull();
  });

  it('renders with an aria-label on the region', () => {
    const { container } = render(<CanvasRoot />);
    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute('aria-label')).toBe('Map canvas');
  });

  it('accepts optional onElementHover and onElementLeave without errors', () => {
    const onHover = vi.fn();
    const onLeave = vi.fn();
    expect(() =>
      render(<CanvasRoot onElementHover={onHover} onElementLeave={onLeave} />),
    ).not.toThrow();
  });
});
