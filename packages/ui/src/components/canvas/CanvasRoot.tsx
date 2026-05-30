import { useCallback, useEffect, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useRenderLoop } from './hooks/useRenderLoop';
import { useVellumStore } from '../../store/vellum-store';

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
 * Placeholder type for an interactive map entity.
 *
 * @remarks
 * The concrete shape and collision-detection logic will be fully defined in Story 4.x.
 * Using a named type now avoids a future breaking change to `CanvasRootProps`.
 */
export type MapEntity = Record<string, never>;

/**
 * Component properties for {@link CanvasRoot}.
 */
export interface CanvasRootProps {
  /**
   * Callback triggered when the user's pointer hovers over an interactive map entity.
   * @param element - The hovered entity. Concrete shape will be defined in Story 4.x.
   */
  onElementHover?: (element: MapEntity) => void;
  /**
   * Callback triggered when the user's pointer leaves the bounding box of an
   * interactive entity.
   */
  onElementLeave?: () => void;
  /**
   * Callback to load a .cslmap file.
   * Used by the file drop handler.
   */
  loadFile?: ((filePath: string) => Promise<void>) | undefined;
}

/**
 * The root container responsible for orchestrating the map rendering lifecycle.
 *
 * @remarks
 * **CRITICAL ARCHITECTURAL RULE:** The viewport state (`zoom`, `panX`, `panY`) must
 * ALWAYS be stored in a mutable `useRef`. It must NEVER be placed in React state
 * (`useState`) or the global Zustand store. The viewport updates at ≥30 fps during
 * panning/zooming; bridging it into React state would cause catastrophic cascading
 * re-renders across the entire UI tree.
 *
 * **Rendering Loop:** Frame scheduling is delegated to {@link useRenderLoop}.
 * When Story 3.x lands, replace the no-op tick with
 * `renderer.updateViewport(viewportRef.current)`.
 *
 * **Future (Story 3.x):** This component will mount one {@link CanvasLayer} per
 * active `LayerName` and push `viewportRef.current` to the `IRenderer` instance.
 *
 * @param props - See {@link CanvasRootProps}.
 * @returns A positioned `role="region"` container that hosts all active
 *   {@link CanvasLayer} instances.
 */
export function CanvasRoot({
  onElementHover: _onElementHover,
  onElementLeave: _onElementLeave,
  loadFile,
}: CanvasRootProps) {
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const viewportRef = useRef<ViewportState>({ zoom: 1, panX: 0, panY: 0 });

  useEffect(() => {
    if (!loadFile) return;

    let cancelled = false;

    getCurrentWebviewWindow()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          if (useVellumStore.getState().loadingState === 'loading') return; // AC 5
          const paths: string[] = event.payload.paths;
          const cslmapPath = paths.find((p) =>
            p.toLowerCase().endsWith('.cslmap'),
          );
          if (cslmapPath) {
            void loadFile(cslmapPath);
          }
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

  // NOTE: Story 3.x — replace with renderer.updateViewport(viewportRef.current)
  const handleTick = useCallback(() => {
    void viewportRef; // satisfies exhaustive-deps; remove when renderer is wired
  }, []);

  useRenderLoop(handleTick);

  return (
    <div
      className="canvas-root relative w-full h-full"
      role="region"
      aria-label="Map canvas"
    >
      {/* CanvasLayer instances per active layer will be injected here in Story 3.x */}
    </div>
  );
}
