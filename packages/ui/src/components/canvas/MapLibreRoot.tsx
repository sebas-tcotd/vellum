import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { MapLibreRenderer, readTokensFromDOM } from '@vellum/renderer-webgl';
import type { TooltipInfo } from '@vellum/renderer-webgl';
import type { LayerVisibility } from '@vellum/core';
import { useVellumStore } from '../../store/vellum-store';
import { Minimap } from '../minimap/Minimap';
import { MapTooltip } from '../overlays/MapTooltip';

/** Props for the `MapLibreRoot` component. Mirrors `CanvasRoot` props for drop-in replacement. */
export interface MapLibreRootProps {
  /** Loads a .cslmap file via the IPC bridge. */
  loadFile?: ((filePath: string) => Promise<void>) | undefined;
  /** Current layer visibility from the Zustand store — propagated to `map.setLayoutProperty`. */
  activeLayers?: LayerVisibility;
  /** Ref populated with a `fitToScreen()` callback. App.tsx calls it after a new map loads. */
  fitToScreenRef?: React.RefObject<(() => void) | null>;
}

/**
 * React host for `MapLibreRenderer`.
 *
 * @remarks
 * Owns the lifecycle of a `MapLibreRenderer` instance. Unlike `CanvasRoot`,
 * there is no RAF loop — MapLibre handles pan/zoom internally and repaints
 * only on viewport changes. Drag-drop is replicated from `CanvasRoot` so the
 * Tauri file-drop workflow is preserved.
 */
export function MapLibreRoot({
  loadFile,
  activeLayers,
  fitToScreenRef,
}: MapLibreRootProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapLibreRenderer | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const containerDimRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const [tooltipInfo, setTooltipInfo] = useState<TooltipInfo | null>(null);

  const cityData = useVellumStore((s) => s.cityData);

  // Mount / unmount the renderer
  useEffect(() => {
    if (!containerRef.current) return;
    const renderer = new MapLibreRenderer(
      containerRef.current,
      readTokensFromDOM(),
    );
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Re-render when cityData changes
  useEffect(() => {
    if (!cityData || !rendererRef.current) return;
    void rendererRef.current.render(cityData, {
      activeLayers: activeLayers ?? {
        terrain: true,
        water: true,
        roads: true,
        transit: true,
        buildings: true,
        forests: true,
        districts: true,
      },
    });
  }, [cityData]); // activeLayers intentionally excluded — layer visibility is set separately

  // Sync layer visibility whenever activeLayers changes
  useEffect(() => {
    if (!activeLayers || !rendererRef.current) return;
    const renderer = rendererRef.current;
    for (const [layer, visible] of Object.entries(activeLayers) as [
      keyof LayerVisibility,
      boolean,
    ][]) {
      renderer.setLayerVisibility(layer, visible);
    }
  }, [activeLayers]);

  // Register fitToScreen into the external ref
  useEffect(() => {
    if (!fitToScreenRef) return;
    fitToScreenRef.current = () => {
      rendererRef.current?.fitToScreen();
    };
    return () => {
      if (fitToScreenRef.current) fitToScreenRef.current = null;
    };
  }, [fitToScreenRef]);

  // Stable callbacks for Minimap — empty deps to avoid re-subscriptions on every render
  const subscribeViewport = useCallback(
    (cb: Parameters<MapLibreRenderer['subscribeViewport']>[0]) =>
      rendererRef.current?.subscribeViewport(cb) ?? (() => {}),
    [],
  );

  const getInitialViewportBounds = useCallback(
    () => rendererRef.current?.getInitialViewportBounds() ?? null,
    [],
  );

  const navigateTo = useCallback((lng: number, lat: number) => {
    rendererRef.current?.navigateTo(lng, lat);
  }, []);

  const subscribeHover = useCallback(
    (cb: Parameters<MapLibreRenderer['subscribeHover']>[0]) =>
      rendererRef.current?.subscribeHover(cb) ?? (() => {}),
    [],
  );

  // Track container dimensions for edge-aware tooltip positioning
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        containerDimRef.current = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Subscribe to hover events for tooltip
  useEffect(() => {
    const unsub = subscribeHover((info) => {
      setTooltipInfo(info);
    });
    return unsub;
  }, [subscribeHover]);

  // Tauri native drag-drop — mirrors CanvasRoot implementation
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
          '[MapLibreRoot] Failed to register drag-drop listener:',
          err,
        );
      });
    return () => {
      cancelled = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [loadFile]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {cityData && (
        <Minimap
          cityData={cityData}
          subscribeViewport={subscribeViewport}
          getInitialViewportBounds={getInitialViewportBounds}
          navigateTo={navigateTo}
        />
      )}
      <MapTooltip
        info={tooltipInfo}
        containerWidth={containerDimRef.current.width}
        containerHeight={containerDimRef.current.height}
      />
    </div>
  );
}
