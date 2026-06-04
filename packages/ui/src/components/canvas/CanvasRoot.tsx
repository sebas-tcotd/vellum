import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useRenderLoop } from './hooks/useRenderLoop';
import { useVellumStore } from '../../store/vellum-store';
import { CanvasManager, CanvasRenderer } from '@vellum/renderer-canvas';
import type { IRenderer, LayerName, LayerVisibility } from '@vellum/core';

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export type MapEntity = Record<string, never>;

/** Props for the `CanvasRoot` component. */
export interface CanvasRootProps {
  onElementHover?: (element: MapEntity) => void;
  onElementLeave?: () => void;
  loadFile?: ((filePath: string) => Promise<void>) | undefined;
  renderer?: IRenderer | null;
  /** Current layer visibility state from the Zustand store. When provided, each layer's CSS opacity is updated via `CanvasManager.setLayerVisibility`. Does NOT trigger a worker re-render. */
  activeLayers?: LayerVisibility;
  /** Ref populated by CanvasRoot with a fitToScreen() function. Call it to reset zoom/pan to defaults. */
  fitToScreenRef?: React.RefObject<(() => void) | null>;
}

// Z-order for staggered fade — must match LAYERS order in CanvasManager.
const LAYER_Z_ORDER: LayerName[] = [
  'terrain',
  'forests',
  'water',
  'buildings',
  'roads',
  'transit',
  'districts',
];

const ACTIVE_LAYERS = {
  terrain: true,
  water: true,
  roads: true,
  transit: true,
  buildings: true,
  forests: true,
  districts: true,
} as const;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;

/** Delay in ms after the last zoom/pan interaction before a crisp vector re-render fires. */
const RE_RENDER_DEBOUNCE_MS = 300;

export function CanvasRoot({
  onElementHover: _onElementHover,
  onElementLeave: _onElementLeave,
  loadFile,
  renderer,
  activeLayers,
  fitToScreenRef,
}: CanvasRootProps) {
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const viewportRef = useRef<ViewportState>({ zoom: 1, panX: 0, panY: 0 });
  const rendererRef = useRef<IRenderer | null>(renderer ?? null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<CanvasManager | null>(null);
  // Ref keeps the latest activeLayers accessible inside the [renderer] effect
  // without adding it as a dependency (would cause manager recreation on every toggle).
  const activeLayersRef = useRef(activeLayers);
  activeLayersRef.current = activeLayers;
  const [canvasSize, setCanvasSize] = useState(0);

  // Mirror canvasSize state into a ref so stable callbacks can read the latest value
  const canvasSizeRef = useRef(0);
  canvasSizeRef.current = canvasSize;

  // Drag state refs — never React state to avoid re-renders at 60fps
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const isSpaceDownRef = useRef(false);

  /**
   * Viewport snapshot at which the last full render completed.
   * @remarks
   * **CRITICAL INVARIANT:** The physical canvas size is always `canvasSize * dpr`.
   * It NEVER scales with zoom. Sharpness is achieved by re-rendering vectorially
   * (coordinates baked with zoom+pan in the worker), NOT by resizing the canvas.
   *
   * During scroll, `cssScale = currentZoom / renderZoom` drifts above 1 (slight blur).
   * When the worker finishes, `renderZoom` catches up → cssScale snaps to 1 → sharp.
   */
  const renderZoomRef = useRef(1);
  const renderPanXRef = useRef(0);
  const renderPanYRef = useRef(0);
  const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    rendererRef.current = renderer ?? null;
  }, [renderer]);

  /**
   * Applies the current viewport state as a CSS transform bridging the gap between
   * the last completed render (renderZoom/renderPan) and the current live viewport.
   * @remarks
   * When `viewportZoom === renderZoom` and pan matches, scale=1 and translate=0:
   * no CSS distortion, maximum sharpness.
   */
  const applyTransform = useCallback(() => {
    if (!containerRef.current) return;
    const { zoom, panX, panY } = viewportRef.current;
    const s = zoom / renderZoomRef.current;
    const tx = panX - renderPanXRef.current * s;
    const ty = panY - renderPanYRef.current * s;
    containerRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    containerRef.current.style.transformOrigin = '0 0';
  }, []);

  /**
   * Re-renders all layers vectorially at the current zoom/pan level.
   * @remarks
   * Called debounced after zoom settles. Uses stale-while-revalidate:
   * the old canvas image remains visible until the worker posts render-complete,
   * at which point the CSS transform snaps to identity — zero flicker.
   */
  const reRenderAtViewport = useCallback(() => {
    const r = rendererRef.current;
    const data = useVellumStore.getState().cityData;
    if (!r || !data) return;

    const { zoom, panX, panY } = viewportRef.current;

    r.updateViewport(zoom, panX, panY);
    void r.render(data, { activeLayers: ACTIVE_LAYERS }).then(() => {
      // Update render snapshot only after the worker finishes painting.
      // CSS scale snaps to 1.0 in the same frame the crisp image appears → no flicker.
      renderZoomRef.current = zoom;
      renderPanXRef.current = panX;
      renderPanYRef.current = panY;
      applyTransform();
    });
  }, [applyTransform]);

  /** Schedule a crisp vector re-render `RE_RENDER_DEBOUNCE_MS` after the last zoom/pan interaction. */
  const scheduleReRender = useCallback(() => {
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = setTimeout(
      reRenderAtViewport,
      RE_RENDER_DEBOUNCE_MS,
    );
  }, [reRenderAtViewport]);

  // Wire CanvasManager to renderer whenever a new renderer is provided
  useEffect(() => {
    if (!renderer || !containerRef.current) return;

    managerRef.current?.destroy();
    // Pass current layer visibility so canvases are born with the correct opacity
    // — prevents a flash of all-visible layers when the manager is recreated.
    const manager = new CanvasManager(
      containerRef.current,
      activeLayersRef.current,
    );
    managerRef.current = manager;

    if (renderer instanceof CanvasRenderer) {
      for (const layerName of [
        'terrain',
        'water',
        'roads',
        'transit',
        'buildings',
        'forests',
        'districts',
      ] as const) {
        const offscreen = manager.getOffscreen(layerName);
        if (offscreen) renderer.registerLayer(layerName, offscreen);
      }
      const data = useVellumStore.getState().cityData;
      if (data) {
        const { zoom, panX, panY } = viewportRef.current;
        renderer.updateViewport(zoom, panX, panY);
        void renderer.render(data, { activeLayers: ACTIVE_LAYERS });
      }
    }

    return () => {
      managerRef.current?.destroy();
      managerRef.current = null;
    };
  }, [renderer]);

  // Update CSS opacity for each layer when activeLayers changes — no worker re-render
  useEffect(() => {
    if (!managerRef.current || !activeLayers) return;
    LAYER_Z_ORDER.forEach((layer, index) => {
      // Fallback to true so a partial activeLayers object never accidentally hides a layer
      managerRef.current?.setLayerVisibility(
        layer,
        activeLayers[layer] ?? true,
        index * 20,
      );
    });
  }, [activeLayers]);

  // Track viewport size via wrapperRef; resize canvas to square (max dimension).
  // Physical size is always canvasSize * dpr — never multiplied by zoom.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const size = Math.max(width, height);
      setCanvasSize(size);
      if (!managerRef.current || !rendererRef.current) return;
      managerRef.current.resizeDisplay(size);
      const dpr = window.devicePixelRatio || 1;
      const physicalSize = Math.round(size * dpr);
      rendererRef.current.resize(physicalSize, physicalSize);
      const data = useVellumStore.getState().cityData;
      if (data) {
        const { zoom, panX, panY } = viewportRef.current;
        rendererRef.current.updateViewport(zoom, panX, panY);
        void rendererRef.current.render(data, { activeLayers: ACTIVE_LAYERS });
      }
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!loadFile) return;
    let cancelled = false;
    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          if (useVellumStore.getState().loadingState === 'loading') return;
          const paths: string[] = event.payload.paths;
          const cslmapPath = paths.find((p) =>
            p.toLowerCase().endsWith('.cslmap'),
          );
          if (cslmapPath) void loadFile(cslmapPath);
        }
      })
      .then((unlisten: UnlistenFn) => {
        if (!cancelled) {
          unlistenRef.current = unlisten;
        } else {
          unlisten();
        }
      })
      .catch((err: unknown) => {
        console.error(
          '[CanvasRoot] Failed to register drag-drop listener:',
          err,
        );
      });
    return () => {
      cancelled = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [loadFile]);

  // Register fitToScreen function into the external ref so App.tsx can trigger it.
  useEffect(() => {
    const fn = () => {
      viewportRef.current = { zoom: 1, panX: 0, panY: 0 };
      renderZoomRef.current = 1;
      renderPanXRef.current = 0;
      renderPanYRef.current = 0;
      applyTransform(); // scale=1, translate=0 — identity

      const size = canvasSizeRef.current;
      const r = rendererRef.current;
      if (size > 0 && r) {
        const dpr = window.devicePixelRatio || 1;
        r.resize(Math.round(size * dpr), Math.round(size * dpr));
        const data = useVellumStore.getState().cityData;
        if (data) {
          r.updateViewport(1, 0, 0);
          void r.render(data, { activeLayers: ACTIVE_LAYERS });
        }
      }
    };

    if (fitToScreenRef) fitToScreenRef.current = fn;

    return () => {
      if (fitToScreenRef) fitToScreenRef.current = null;
    };
  }, [fitToScreenRef, applyTransform]);

  // Zoom/pan interaction handlers — registered manually to control passive option
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    function setCursor(state: 'default' | 'grab' | 'grabbing'): void {
      const el = wrapperRef.current;
      if (!el) return;
      el.classList.remove('cursor-grab', 'cursor-grabbing');
      if (state === 'grab') el.classList.add('cursor-grab');
      if (state === 'grabbing') el.classList.add('cursor-grabbing');
    }

    function handleWheel(e: WheelEvent): void {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, viewportRef.current.zoom * factor),
      );

      const rect = wrapperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Keep the point under the cursor fixed as zoom changes
      const ratio = newZoom / viewportRef.current.zoom;
      viewportRef.current.panX =
        cursorX - ratio * (cursorX - viewportRef.current.panX);
      viewportRef.current.panY =
        cursorY - ratio * (cursorY - viewportRef.current.panY);
      viewportRef.current.zoom = newZoom;

      // Immediate CSS feedback (slight blur during active scroll — acceptable)
      applyTransform();
      scheduleReRender();
    }

    function handleMouseDown(e: MouseEvent): void {
      if (e.button !== 0) return;
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: viewportRef.current.panX,
        panY: viewportRef.current.panY,
      };
      setCursor('grabbing');
    }

    function handleMouseMove(e: MouseEvent): void {
      if (!isDraggingRef.current) return;
      viewportRef.current.panX =
        dragStartRef.current.panX + (e.clientX - dragStartRef.current.x);
      viewportRef.current.panY =
        dragStartRef.current.panY + (e.clientY - dragStartRef.current.y);
      applyTransform();
    }

    function handleMouseUp(): void {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        // Re-render vectorially at the settled pan so map areas that were clipped
        // outside the fixed canvas window get painted — fixes the white edges.
        scheduleReRender();
      }
      setCursor(isSpaceDownRef.current ? 'grab' : 'default');
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.code === 'Space' && !isSpaceDownRef.current) {
        isSpaceDownRef.current = true;
        if (!isDraggingRef.current) setCursor('grab');
      }
    }

    function handleKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') {
        isSpaceDownRef.current = false;
        if (!isDraggingRef.current) setCursor('default');
      }
    }

    // mousemove and mouseup on window to capture movement outside canvas during drag
    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    wrapper.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
      wrapper.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (interactionTimerRef.current)
        clearTimeout(interactionTimerRef.current);
    };
  }, [applyTransform, scheduleReRender]);

  const handleTick = useCallback(() => {
    rendererRef.current?.updateViewport(
      viewportRef.current.zoom,
      viewportRef.current.panX,
      viewportRef.current.panY,
    );
  }, []);

  useRenderLoop(handleTick);

  return (
    <div
      ref={wrapperRef}
      className="canvas-root relative w-full h-full overflow-hidden"
      role="region"
      aria-label="Map canvas"
    >
      <div
        ref={containerRef}
        className="relative"
        style={
          canvasSize > 0
            ? { width: canvasSize, height: canvasSize }
            : { width: '100%', height: '100%' }
        }
      />
    </div>
  );
}
