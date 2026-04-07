import { useEffect, useRef } from 'react';

/**
 * Represents the current state of the camera viewport within the canvas space.
 */
export interface ViewportState {
  /** The scaling multiplier applied to the projection matrix. */
  zoom: number;
  /** The horizontal translation offset in canvas pixels. */
  panX: number;
  /** The vertical translation offset in canvas pixels. */
  panY: number;
}

/**
 * Component properties for {@link CanvasRoot}.
 */
export interface CanvasRootProps {
  /**
   * Callback triggered when the user's pointer hovers over an interactive map entity.
   * @remarks
   * Currently defined as `unknown`. The concrete entity payload type and collision
   * detection logic will be fully implemented in Story 4.x.
   */
  onElementHover?: (element: unknown) => void;
  /**
   * Callback triggered when the user's pointer leaves the bounding box of an interactive entity.
   */
  onElementLeave?: () => void;
}

/**
 * The root container responsible for orchestrating the map rendering lifecycle.
 *
 * @remarks
 * **CRITICAL ARCHITECTURAL RULE:** The viewport state (`zoom`, `panX`, `panY`) must ALWAYS
 * be stored in a mutable `useRef`. It must NEVER be placed in React state (`useState`)
 * or the global Zustand store. The viewport updates at ≥30fps during panning/zooming;
 * bridging this into React state would trigger catastrophic cascading re-renders across the UI tree.
 *
 * **Rendering Loop:** This component manages a dedicated `requestAnimationFrame` (RAF) loop
 * to synchronize camera movements smoothly without blocking the React render cycle.
 *
 * **Future Implementation (Story 3.x):** This component will be responsible for mounting
 * individual `CanvasLayer` instances (one for each active `LayerName`) and pushing
 * the mutable `viewportRef.current` state to the `IRenderer` instance.
 */
export function CanvasRoot({
  onElementHover: _onElementHover,
  onElementLeave: _onElementLeave,
}: CanvasRootProps) {
  // RULE: viewport ALWAYS in useRef, NEVER in Zustand/React state
  const viewportRef = useRef<ViewportState>({ zoom: 1, panX: 0, panY: 0 });
  const rafIdRef = useRef<number>(0);
  const isActiveRef = useRef(true);

  useEffect(() => {
    isActiveRef.current = true;

    const tick = () => {
      if (!isActiveRef.current) return;

      // Story 3.x: renderer.updateViewport(viewportRef.current) will be invoked here
      void viewportRef.current;

      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      isActiveRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return (
    <div
      className="canvas-root"
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {/* CanvasLayer instances per active layer will be injected here in Story 3.x */}
    </div>
  );
}
