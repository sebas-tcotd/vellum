import { useCallback, useEffect, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useRenderLoop } from './hooks/useRenderLoop';
import { useVellumStore } from '../../store/vellum-store';
import { CanvasManager, CanvasRenderer } from '@vellum/renderer-canvas';
import type { IRenderer } from '@vellum/core';

export interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

export type MapEntity = Record<string, never>;

export interface CanvasRootProps {
  onElementHover?: (element: MapEntity) => void;
  onElementLeave?: () => void;
  loadFile?: ((filePath: string) => Promise<void>) | undefined;
  renderer?: IRenderer | null;
}

const ACTIVE_LAYERS = {
  terrain: true,
  water: true,
  roads: false,
  transit: false,
  buildings: false,
  forests: false,
  districts: false,
} as const;

export function CanvasRoot({
  onElementHover: _onElementHover,
  onElementLeave: _onElementLeave,
  loadFile,
  renderer,
}: CanvasRootProps) {
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const viewportRef = useRef<ViewportState>({ zoom: 1, panX: 0, panY: 0 });
  const rendererRef = useRef<IRenderer | null>(renderer ?? null);
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<CanvasManager | null>(null);

  useEffect(() => {
    rendererRef.current = renderer ?? null;
  }, [renderer]);

  // Wire CanvasManager to renderer whenever a new renderer is provided
  useEffect(() => {
    if (!renderer || !containerRef.current) return;

    managerRef.current?.destroy();
    const manager = new CanvasManager(containerRef.current);
    managerRef.current = manager;

    if (renderer instanceof CanvasRenderer) {
      for (const layerName of ['terrain', 'water'] as const) {
        const offscreen = manager.getOffscreen(layerName);
        if (offscreen) renderer.registerLayer(layerName, offscreen);
      }
      const data = useVellumStore.getState().cityData;
      if (data) renderer.render(data, { activeLayers: ACTIVE_LAYERS });
    }

    return () => {
      managerRef.current?.destroy();
      managerRef.current = null;
    };
  }, [renderer]);

  // Resize canvases when the container changes size
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!managerRef.current || !rendererRef.current) return;
      managerRef.current.resizeDisplay(width, height);
      const dpr = window.devicePixelRatio || 1;
      rendererRef.current.resize(
        Math.round(width * dpr),
        Math.round(height * dpr),
      );
      const data = useVellumStore.getState().cityData;
      if (data)
        rendererRef.current.render(data, { activeLayers: ACTIVE_LAYERS });
    });
    observer.observe(containerRef.current);
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
      ref={containerRef}
      className="canvas-root relative w-full h-full"
      role="region"
      aria-label="Map canvas"
    >
      {/* Canvases are created imperatively by CanvasManager when a renderer is wired */}
    </div>
  );
}
