// packages/ui/src/components/canvas/CanvasRoot.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render } from '../../test-utils';
import { act } from '@testing-library/react';
import { CanvasRoot } from './CanvasRoot';
import { useVellumStore } from '../../store/vellum-store';
import { CanvasRenderer } from '@vellum/renderer-canvas';
import { makeCityData } from '@vellum/core/testing';

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

// --- Zoom/pan interactions ----------------------------------------------

class TestCanvasRenderer extends CanvasRenderer {
  override registerLayer = vi.fn<CanvasRenderer['registerLayer']>();
  override render = vi.fn<CanvasRenderer['render']>(() => Promise.resolve());
  override updateViewport = vi.fn<CanvasRenderer['updateViewport']>();
  override resize = vi.fn<CanvasRenderer['resize']>();
}

function setCanvasRootRect(root: Element): void {
  root.getBoundingClientRect = vi.fn(() => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1000,
    bottom: 1000,
    width: 1000,
    height: 1000,
    toJSON: () => ({}),
  }));
}

describe('CanvasRoot — zoom/pan interactions', () => {
  let originalTransferControlToOffscreen:
    | HTMLCanvasElement['transferControlToOffscreen']
    | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    originalTransferControlToOffscreen =
      HTMLCanvasElement.prototype.transferControlToOffscreen;
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      'transferControlToOffscreen',
      {
        configurable: true,
        value: vi.fn(() => ({ height: 0, width: 0 }) as OffscreenCanvas),
      },
    );
    useVellumStore.setState({
      cityData: makeCityData(),
      loadingState: 'idle',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalTransferControlToOffscreen) {
      Object.defineProperty(
        HTMLCanvasElement.prototype,
        'transferControlToOffscreen',
        {
          configurable: true,
          value: originalTransferControlToOffscreen,
        },
      );
    } else {
      Reflect.deleteProperty(
        HTMLCanvasElement.prototype,
        'transferControlToOffscreen',
      );
    }
    useVellumStore.setState({ cityData: null, loadingState: 'idle' });
  });

  it('pan aplica transform CSS inmediato y programa render nítido diferido', async () => {
    const renderer = new TestCanvasRenderer();
    const { container } = render(<CanvasRoot renderer={renderer} />);
    await act(async () => {});
    renderer.render.mockClear();
    renderer.updateViewport.mockClear();

    const root = container.querySelector('.canvas-root');
    expect(root).not.toBeNull();
    setCanvasRootRect(root!);

    fireEvent.mouseDown(root!, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 130, clientY: 140 });

    // Feedback inmediato: transform CSS aplicado, sin render aún
    expect((root!.firstElementChild as HTMLElement).style.transform).toBe(
      'translate(30px, 40px) scale(1)',
    );
    expect(renderer.render).not.toHaveBeenCalled();

    fireEvent.mouseUp(window);

    // Antes de RE_RENDER_DEBOUNCE_MS (300) el re-render no se dispara
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(renderer.render).not.toHaveBeenCalled();

    // Pasado el debounce: re-render vectorial a la nueva posición de pan
    // (rellena las zonas que quedaban recortadas fuera del canvas → sin blanco)
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(renderer.updateViewport).toHaveBeenCalledWith(1, 30, 40);
    expect(renderer.render).toHaveBeenCalledTimes(1);
  });

  it('zoom aplica feedback inmediato y programa render nítido diferido', async () => {
    const renderer = new TestCanvasRenderer();
    const { container } = render(<CanvasRoot renderer={renderer} />);
    await act(async () => {});
    renderer.render.mockClear();
    renderer.updateViewport.mockClear();

    const root = container.querySelector('.canvas-root');
    expect(root).not.toBeNull();
    setCanvasRootRect(root!);

    fireEvent.wheel(root!, { deltaY: -1, clientX: 500, clientY: 500 });

    expect((root!.firstElementChild as HTMLElement).style.transform).toBe(
      'translate(-50px, -50px) scale(1.1)',
    );
    expect(renderer.render).not.toHaveBeenCalled();

    // RE_RENDER_DEBOUNCE_MS = 300
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(renderer.updateViewport).toHaveBeenCalledWith(1.1, -50, -50);
    expect(renderer.render).toHaveBeenCalledTimes(1);
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
