import type { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type {
  ExportPreviewSnapshot,
  ExportRequest,
  ExportSnapshot,
  SvgExportRequest,
  SvgExportSnapshot,
  LayerVisibility,
} from '@vellum/core';
import type {
  ServiceIconLegendState,
  TooltipInfo,
} from '@vellum/renderer-webgl';
import { MapLibreRenderer } from '@vellum/renderer-webgl';
import {
  DEFAULT_RENDER_STYLE_PARAMS,
  type LoadedTheme,
} from '@vellum/theme-engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVellumStore } from '../../store/vellum-store';
import { Minimap } from '../minimap/Minimap';
import { MapTooltip } from '../overlays/MapTooltip';
import { useRendererCommandRefs } from './use-renderer-command-refs';

const EMPTY_THEMES: readonly LoadedTheme[] = [];

/** Props for the `MapLibreRoot` component. Mirrors `CanvasRoot` props for drop-in replacement. */
export interface MapLibreRootProps {
  /** Loads a .cslmap file via the IPC bridge. */
  loadFile?: ((filePath: string) => Promise<void>) | undefined;
  /** Current layer visibility from the Zustand store — propagated to `map.setLayoutProperty`. */
  activeLayers?: LayerVisibility;
  /** Ref populated with a `fitToScreen()` callback. Consumed by the Cmd+0 shortcut. */
  fitToScreenRef?: React.RefObject<(() => void) | null>;
  /** Ref populated with a `zoomIn()` callback. */
  zoomInRef?: React.RefObject<(() => void) | null>;
  /** Ref populated with a `zoomOut()` callback. */
  zoomOutRef?: React.RefObject<(() => void) | null>;
  /** Ref populated with a `toggleNavigationMode()` callback. */
  toggleNavigationModeRef?: React.RefObject<(() => void) | null>;
  /** Ref populated with a `rotateBy(delta)` callback. */
  rotateByRef?: React.RefObject<((delta: number) => void) | null>;
  /** Ref populated with a `resetBearing()` callback. */
  resetBearingRef?: React.RefObject<(() => void) | null>;
  /** When true, hides Minimap and MapTooltip for an unobstructed view of the map. */
  isCleanMode?: boolean;
  /** All loaded themes. The active one (by `activeTheme` in the store) is applied via `applyTheme`. */
  themes?: readonly LoadedTheme[];
  /**
   * Ref populated with a stable `subscribeServiceIconLegend`-style function,
   * mirroring `fitToScreenRef`'s registration pattern but for a data
   * subscription instead of an imperative action. `IconLegend` calls it to
   * get live `ServiceIconLegendState` updates without owning a renderer reference.
   */
  subscribeServiceIconLegendRef?: React.RefObject<
    ((callback: (state: ServiceIconLegendState) => void) => () => void) | null
  >;
  /** Ref populated with an on-demand viewport preview capture callback. */
  previewCaptureRef?: React.RefObject<
    (() => Promise<ExportPreviewSnapshot | null>) | null
  >;
  /** Ref populated with a pure export snapshot callback. */
  snapshotCaptureRef?: React.RefObject<
    ((request: ExportRequest) => ExportSnapshot | null) | null
  >;
  /** Ref populated with the vector counterpart of `snapshotCaptureRef`. */
  svgSnapshotCaptureRef?: React.RefObject<
    ((request: SvgExportRequest) => SvgExportSnapshot | null) | null
  >;
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
  zoomInRef,
  zoomOutRef,
  toggleNavigationModeRef,
  rotateByRef,
  resetBearingRef,
  isCleanMode = false,
  themes = EMPTY_THEMES,
  subscribeServiceIconLegendRef,
  previewCaptureRef,
  snapshotCaptureRef,
  svgSnapshotCaptureRef,
}: MapLibreRootProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapLibreRenderer | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const containerDimRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [containerDimensions, setContainerDimensions] = useState({
    width: 0,
    height: 0,
  });

  const [tooltipInfo, setTooltipInfo] = useState<TooltipInfo | null>(null);

  useRendererCommandRefs(rendererRef, {
    fitToScreenRef,
    zoomInRef,
    zoomOutRef,
    toggleNavigationModeRef,
    rotateByRef,
    resetBearingRef,
    previewCaptureRef,
    snapshotCaptureRef,
    svgSnapshotCaptureRef,
    subscribeServiceIconLegendRef,
  });

  const cityData = useVellumStore((s) => s.cityData);
  const loadingState = useVellumStore((s) => s.loadingState);
  const activeTheme = useVellumStore((s) => s.activeTheme);
  const transitDimmingEnabled = useVellumStore((s) => s.transitDimmingEnabled);
  const layerOptions = useVellumStore((s) => s.layerOptions);

  const allLayersDisabled = useMemo(
    () =>
      activeLayers != null &&
      (Object.values(activeLayers) as boolean[]).every((v) => !v),
    [activeLayers],
  );

  // Mount / unmount the renderer
  useEffect(() => {
    if (!containerRef.current) return;
    const renderer = new MapLibreRenderer(
      containerRef.current,
      DEFAULT_RENDER_STYLE_PARAMS,
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
    const renderer = rendererRef.current;
    renderer
      .render(cityData, {
        activeLayers: activeLayers ?? {
          terrain: true,
          basemap: true,
          roads: true,
          transit: true,
          buildings: true,
          forests: true,
          districts: true,
        },
      })
      .then(() => {
        // A toggle can arrive while the async style/source setup is pending.
        // The visibility effect above cannot reach layers that do not exist yet,
        // so re-apply the latest store snapshot once the initial render settles.
        if (rendererRef.current !== renderer) return;
        const latestLayers = useVellumStore.getState().activeLayers;
        for (const [layer, visible] of Object.entries(latestLayers) as [
          keyof LayerVisibility,
          boolean,
        ][]) {
          renderer.setLayerVisibility(layer, visible);
        }
        renderer.setWatermarkVisibility(
          (Object.values(latestLayers) as boolean[]).every((v) => !v),
        );
      })
      // A rejection here truncates the layer stack and skips the camera fit, so it
      // must never be swallowed: `void render(...)` hid exactly that failure mode.
      .catch((err: unknown) => {
        console.error('[MapLibreRoot] render failed:', err);
      });
  }, [cityData]); // activeLayers intentionally excluded — layer visibility is set separately

  // Apply the active theme's RenderStyleParams whenever it (or the loaded set) changes.
  // The renderer is constructed with DEFAULT_RENDER_STYLE_PARAMS as fallback until themes resolve.
  //
  // `cityData` is also a dependency, even though it never changes which style is
  // active: loading a city creates fresh layers (`base-water`, `base-land`, ...)
  // colored from whatever `MapSourceManager` currently holds, and that source of
  // truth is only ever updated by a completed `applyTheme()` call. If a city
  // loads before the (independent, IPC-loaded) `themes` list resolves, those
  // fresh layers otherwise bake in the `DEFAULT_RENDER_STYLE_PARAMS` fallback
  // color forever — nothing revisits them once created, so the map looked
  // themed everywhere except a background/water that never caught up until the
  // user picked a theme by hand. Re-running this effect after every city load
  // re-asserts the current theme once it's actually known, closing that gap.
  useEffect(() => {
    let cancelled = false;
    const renderer = rendererRef.current;
    if (!renderer || themes.length === 0) return;
    const style = themes.find((theme) => theme.id === activeTheme);
    if (!style) return;
    renderer.setTransitDimming(
      activeTheme === 'transit' && transitDimmingEnabled,
    );
    renderer.applyTheme(style).catch((err: unknown) => {
      if (cancelled) return;
      console.error('[MapLibreRoot] applyTheme failed:', err);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTheme, themes, transitDimmingEnabled, cityData]);

  // Clear the map when loading starts so the old map doesn't linger
  useEffect(() => {
    if (loadingState !== 'loading' || !rendererRef.current) return;

    setTooltipInfo(null);

    // Keep the old map visible during the CSS opacity transition (500ms) so the
    // fade-out looks smooth, then clean up the map data once the transition completes
    const timer = setTimeout(() => {
      rendererRef.current?.clear();
    }, 500);

    return () => clearTimeout(timer);
  }, [loadingState]);

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
    renderer.setWatermarkVisibility(allLayersDisabled);
  }, [activeLayers, allLayersDisabled]);

  // Sync advanced per-layer filters (transit-mode filter, buildings RICO filter)
  useEffect(() => {
    rendererRef.current?.setLayerOptions(layerOptions);
  }, [layerOptions]);

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
        const { width, height } = entry.contentRect;
        containerDimRef.current = { width, height };
        setContainerDimensions({ width, height });
        if (width > 0 && height > 0) {
          rendererRef.current?.resize(width, height);
        }
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
      role="img"
      aria-label={
        cityData?.cityName
          ? t('a11y.mapCanvasCity', { cityName: cityData.cityName })
          : t('a11y.mapCanvas')
      }
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {cityData && !isCleanMode && (
        <Minimap
          cityData={cityData}
          subscribeViewport={subscribeViewport}
          getInitialViewportBounds={getInitialViewportBounds}
          navigateTo={navigateTo}
        />
      )}
      <MapTooltip
        info={
          containerDimensions.width > 0 && !isCleanMode ? tooltipInfo : null
        }
        containerWidth={containerDimensions.width}
        containerHeight={containerDimensions.height}
      />
    </div>
  );
}
