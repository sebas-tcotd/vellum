// packages/ui/src/components/canvas/CanvasRoot.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '../../test-utils';
import { act } from '@testing-library/react';
import { CanvasRoot } from './CanvasRoot';
import { useVellumStore } from '../../store/vellum-store';

// --- Mock RAF -----------------------------------------------------------
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

// --- Mock rendering -------------------------------------------------------
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

// --- Drag-drop integration -----------------------------------------------

const mockUnlisten = vi.fn();
const mockOnDragDropEvent = vi.fn().mockResolvedValue(mockUnlisten);

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    onDragDropEvent: mockOnDragDropEvent,
  }),
}));

describe('CanvasRoot — drag-drop', () => {
  beforeEach(() => {
    mockOnDragDropEvent.mockClear();
    mockUnlisten.mockClear();
    useVellumStore.setState({ loadingState: 'idle', cityData: null });
  });

  it('does not register drag-drop listener without loadFile prop', async () => {
    render(<CanvasRoot />);
    await act(async () => {});
    expect(mockOnDragDropEvent).not.toHaveBeenCalled();
  });

  it('registers onDragDropEvent when loadFile prop is provided', async () => {
    const loadFile = vi.fn().mockResolvedValue(undefined);
    render(<CanvasRoot loadFile={loadFile} />);
    await act(async () => {});
    expect(mockOnDragDropEvent).toHaveBeenCalledOnce();
  });

  it('drop of .cslmap file triggers loadFile', async () => {
    const loadFile = vi.fn().mockResolvedValue(undefined);
    render(<CanvasRoot loadFile={loadFile} />);
    await act(async () => {});

    const handler = mockOnDragDropEvent.mock.calls[0][0] as (
      e: unknown,
    ) => void;
    await act(async () => {
      handler({ payload: { type: 'drop', paths: ['/path/to/city.cslmap'] } });
    });

    expect(loadFile).toHaveBeenCalledWith('/path/to/city.cslmap');
  });

  it('drop of non-.cslmap file does not trigger loadFile (AC 4)', async () => {
    const loadFile = vi.fn().mockResolvedValue(undefined);
    render(<CanvasRoot loadFile={loadFile} />);
    await act(async () => {});

    const handler = mockOnDragDropEvent.mock.calls[0][0] as (
      e: unknown,
    ) => void;
    await act(async () => {
      handler({ payload: { type: 'drop', paths: ['/path/to/image.png'] } });
    });

    expect(loadFile).not.toHaveBeenCalled();
  });

  it('drop while loadingState is loading is ignored (AC 5)', async () => {
    useVellumStore.setState({ loadingState: 'loading' });
    const loadFile = vi.fn().mockResolvedValue(undefined);
    render(<CanvasRoot loadFile={loadFile} />);
    await act(async () => {});

    const handler = mockOnDragDropEvent.mock.calls[0][0] as (
      e: unknown,
    ) => void;
    await act(async () => {
      handler({ payload: { type: 'drop', paths: ['/path/to/city.cslmap'] } });
    });

    expect(loadFile).not.toHaveBeenCalled();
  });

  it('unlisten is called when component unmounts', async () => {
    const loadFile = vi.fn();
    const { unmount } = render(<CanvasRoot loadFile={loadFile} />);
    await act(async () => {});
    unmount();
    expect(mockUnlisten).toHaveBeenCalled();
  });
});
