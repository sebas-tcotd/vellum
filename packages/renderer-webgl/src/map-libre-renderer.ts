/**
 * GPU-accelerated city renderer backed by MapLibre GL JS.
 *
 * @remarks
 * `MapLibreRenderer` implements `IRenderer` so it can be swapped in place of
 * `CanvasRenderer` without changing the React component contract.
 *
 * The renderer owns the `maplibregl.Map` instance and delegates specific
 * domains to isolated managers: {@link MapSourceManager} (GeoJSON sources and
 * initial layers), {@link MapLayerManager} (visibility, theming, dimming,
 * filters), and {@link MapNavigationManager} (camera fitting, pan/zoom
 * constraints, soft-boundary snap-back). No RAF loop is needed — MapLibre is
 * event-driven and repaints only on viewport changes or source updates.
 *
 * Coordinate system: all city-data coordinates are converted to equatorial
 * WGS-84 by `csToGeoArray` before being added as GeoJSON sources (see the
 * `geojson/` builders). This keeps the Mercator distortion at zero (scale
 * factor = 1.0 at the equator).
 */

import {
  DEFAULT_LAYER_OPTIONS,
  LAYER_NAMES,
  type CityData,
  type ExportCamera,
  type ExportPreviewSnapshot,
  type ExportBackground,
  type ExportRequest,
  type ExportSnapshot,
  type SvgExportRequest,
  type SvgExportSnapshot,
  type IRenderer,
  type LayerName,
  type LayerOptions,
  type RenderParams,
  type RenderStyleParams,
} from '@vellum/core';
import maplibregl from 'maplibre-gl';
import {
  captureCanvasOnNextRender,
  captureOnNextRender,
} from './capture/map-render-capture';
import {
  captureExportSnapshotPng as captureExportSnapshotPngImpl,
  captureSnapshotPng as captureSnapshotPngImpl,
  EXPORT_CAPTURE_TIMEOUT_MS,
} from './export/maplibre-png-capture';
import type { PngExportOptions } from './export/export-types';
import {
  buildExportSnapshot,
  buildSvgExportSnapshot,
} from './export/export-snapshot-builder';
import {
  subscribeHover as subscribeHoverImpl,
  subscribeServiceIconLegend as subscribeServiceIconLegendImpl,
  subscribeViewport as subscribeViewportImpl,
} from './interactions';
import { createBaseStyle } from './layers';
import { MapLayerManager } from './managers/map-layer.manager';
import { MapNavigationManager } from './managers/map-navigation.manager';
import { MapSourceManager } from './managers/map-source.manager';
import type { MapLibreRendererOptions } from './map-libre-renderer-options';
import { unregisterDemProtocol } from './sources/dem-protocol';
import { releaseTemporaryWebGlContext } from './sources/webgl-context';
import { resolveColors } from './style-adapter';
import { buildPreviewSnapshot as buildPreviewSnapshotImpl } from './preview/preview-snapshot';
import type {
  ServiceIconLegendState,
  TooltipInfo,
  ViewportBounds,
} from './types/renderer.types';

export type {
  ServiceIconLegendState,
  TooltipInfo,
  ViewportBounds,
} from './types/renderer.types';

const PREVIEW_CAPTURE_TIMEOUT_MS = 1_500;

/**
 * Upper bound on MapLibre's worker pool.
 *
 * @remarks
 * A GeoJSON source is pinned to a single worker for its lifetime, so the
 * parallelism is *across* sources, not within one. Three sources carry most of
 * the weight (buildings, roads, forests), which is why raising this past a
 * handful buys nothing while still costing a worker's memory each.
 */
const MAX_WORKERS = 4;

/**
 * Raises MapLibre's worker pool off its default of one.
 *
 * @remarks
 * MapLibre sets `workerCount` to 1 on every environment it does not recognise
 * as Safari (where it uses `min(cores, 3)`). Tauri's WKWebView fails that
 * user-agent check, so Vellum was slicing all fourteen GeoJSON sources — about
 * 40 MB for a large city — through a single worker. Measured on san-rico: the
 * tiling phase of a load went from 4599 ms to 2577 ms, and detail-zoom panning
 * stopped queueing behind itself.
 *
 * Must run before the first `maplibregl.Map` is constructed, since the pool is
 * created on first acquire and never resized; calling it again afterwards is a
 * harmless no-op.
 */
function raiseWorkerCount(): void {
  const cores = navigator.hardwareConcurrency || 1;
  maplibregl.setWorkerCount(Math.max(Math.min(cores - 1, MAX_WORKERS), 1));
}

/**
 * GPU-accelerated renderer that converts `CityData` to MapLibre GL JS sources
 * and layers. Implements the `IRenderer` port defined in `@vellum/core`.
 */
export class MapLibreRenderer implements IRenderer {
  private readonly map: maplibregl.Map;
  private readonly releasesDemProtocol: boolean;

  private readonly layerManager: MapLayerManager;
  private readonly navigationManager: MapNavigationManager;
  private readonly sourceManager: MapSourceManager;

  private cityData: CityData | null = null;
  private style: RenderStyleParams;
  private activeLayers: RenderParams['activeLayers'] | null = null;
  private transitDimming = false;
  private watermarkVisible = true;
  private layerOptions: LayerOptions = DEFAULT_LAYER_OPTIONS;
  private readonly pendingPreviewCaptures = new Set<() => void>();

  /**
   * Creates a new `MapLibreRenderer` and attaches it to the given container.
   *
   * @param container - A DOM div that MapLibre will populate.
   * @param style - Initial theme colors, applied to the base map style at construction.
   * @param options - Optional named configuration for a disposable export surface.
   */
  constructor(
    container: HTMLDivElement,
    style: RenderStyleParams,
    options: MapLibreRendererOptions = {},
  ) {
    const {
      preserveDrawingBuffer = false,
      releasesDemProtocol = true,
      pixelRatio,
      maxZoom = 18,
    } = options;
    this.style = style;
    this.releasesDemProtocol = releasesDemProtocol;
    const initialColors = resolveColors(style);

    // Before the Map, which is what creates the worker pool.
    raiseWorkerCount();

    this.map = new maplibregl.Map({
      container,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      renderWorldCopies: false,
      maxZoom,
      canvasContextAttributes: { preserveDrawingBuffer },
      style: createBaseStyle(initialColors),
      ...(pixelRatio === undefined ? {} : { pixelRatio }),
    });

    this.layerManager = new MapLayerManager(this.map, initialColors);
    this.navigationManager = new MapNavigationManager(this.map);
    this.sourceManager = new MapSourceManager(this.map, initialColors);
  }

  /**
   * Loads city data into MapLibre sources and layers.
   *
   * @remarks
   * If the style is not yet loaded, rendering is deferred to the `load` event.
   * After sources are added, the map is fitted to the city bounding box.
   */
  render(cityData: CityData, params: RenderParams): Promise<void> {
    this.cityData = cityData;
    this.activeLayers = params.activeLayers;

    const executeRender = async (): Promise<void> => {
      const failedSteps =
        await this.sourceManager.initializeSourcesAndLayers(cityData);
      if (failedSteps.length > 0) {
        console.error(
          `[MapLibreRenderer] ${failedSteps.length} layer step(s) failed: ${failedSteps.join(', ')}`,
        );
      }
      this.layerManager.setTerrainDem(cityData.terrainDem);
      this.applyInitialState(params);
      // Re-measure before fitting: MapLibre sizes its transform from an async
      // ResizeObserver tick, and fitBounds against a stale transform is what
      // produced the "opens zoomed all the way out" first load.
      this.map.resize();
      this.navigationManager.fitAndConstrain(cityData);
    };

    return this.whenStyleReady().then(executeRender);
  }

  /**
   * Resolves once the style can accept sources and layers.
   *
   * @remarks
   * `once('load')` alone is a trap: `load` fires exactly once, while
   * `isStyleLoaded()` also returns `false` transiently *after* it while pending
   * sources settle. A second city loaded inside such a window used to register a
   * listener that could never fire, leaving a promise pending forever and a blank
   * map. `map.loaded()` distinguishes "not loaded yet" from "busy right now".
   */
  private whenStyleReady(): Promise<void> {
    if (this.map.isStyleLoaded() || this.map.loaded()) return Promise.resolve();
    return new Promise((resolve) => {
      this.map.once('load', () => resolve());
    });
  }

  /** Applies the requested layer visibility, transit dimming, and layer options for a freshly rendered city. */
  private applyInitialState(params: RenderParams): void {
    for (const layer of LAYER_NAMES) {
      this.layerManager.setVisibility(layer, params.activeLayers[layer]);
    }
    // Re-assert the watermark after a fresh layer stack is created. The shell
    // can have hidden it while all layers were disabled before a second city
    // load; source initialization replaces the layer and would otherwise
    // restore its default visibility.
    this.layerManager.setWatermarkVisibility(this.watermarkVisible);
    this.layerManager.setTransitDimming(this.transitDimming);
    this.layerManager.setOptions(this.layerOptions);
  }

  /**
   * Applies a new set of theme colors to every currently-registered layer via
   * `map.setPaintProperty()` — no source re-processing, no renderer teardown.
   *
   * @remarks
   * Safe to call before a city is loaded (layers that don't exist yet are
   * skipped) and safe to call repeatedly. The current `layerOptions` are
   * passed through so the buildings color expression keeps the active RICO
   * "color by category" state instead of reverting to a default.
   */
  async applyTheme(style: RenderStyleParams): Promise<void> {
    this.style = style;
    const newColors = resolveColors(style);
    this.layerManager.updateColors(newColors);
    this.sourceManager.updateColors(newColors);
    await this.layerManager.applyTheme(this.layerOptions);
  }

  /**
   * Clears all city-specific data from the map, leaving only the base background.
   *
   * @remarks
   * Called when loading starts so the old map is not visible during the transition
   * to a new city.
   */
  clear(): void {
    this.cityData = null;
    this.layerManager.setTerrainDem(null);
    this.sourceManager.clearAll();
  }

  /**
   * Captures the current viewport during a single on-demand render frame.
   *
   * @remarks
   * MapLibre keeps `preserveDrawingBuffer` disabled globally for performance.
   * Reading inside the next `render` event captures the completed WebGL frame
   * without changing that context option or maintaining a second renderer.
   *
   * @returns A viewport snapshot, or `null` when no city is loaded or capture fails.
   */
  capturePreview(): Promise<ExportPreviewSnapshot | null> {
    if (!this.cityData) return Promise.resolve(null);
    const capture = captureOnNextRender(
      this.map,
      PREVIEW_CAPTURE_TIMEOUT_MS,
      () => this.buildPreviewSnapshot(),
      () => null,
    );
    this.pendingPreviewCaptures.add(capture.cancel);
    void capture.promise.finally(() =>
      this.pendingPreviewCaptures.delete(capture.cancel),
    );
    return capture.promise;
  }

  /** Captures all export inputs without exposing the MapLibre instance. */
  createExportSnapshot(request: ExportRequest): ExportSnapshot | null {
    if (!this.cityData || !this.activeLayers) return null;
    return buildExportSnapshot({
      map: this.map,
      cityData: this.cityData,
      style: this.style,
      activeLayers: this.activeLayers,
      layerOptions: this.layerOptions,
      transitDimming: this.transitDimming,
      watermarkVisible: this.watermarkVisible,
      request,
    });
  }

  /** Captures the same inputs for a vector export, keeping the camera intact. */
  createSvgExportSnapshot(request: SvgExportRequest): SvgExportSnapshot | null {
    if (!this.cityData || !this.activeLayers) return null;
    return buildSvgExportSnapshot({
      map: this.map,
      cityData: this.cityData,
      style: this.style,
      activeLayers: this.activeLayers,
      layerOptions: this.layerOptions,
      transitDimming: this.transitDimming,
      watermarkVisible: this.watermarkVisible,
      request,
    });
  }

  /** Resolves export backgrounds from theme tokens instead of CSS literals. */
  private exportBackgroundColor(background: ExportBackground): string {
    if (background === 'transparent') return 'rgba(0, 0, 0, 0)';
    return background === 'dark'
      ? this.style.transitBackground
      : this.style.mapBackground;
  }

  /**
   * Paints the resolved export background onto this renderer's `background` layer.
   * @internal Bounded export API — used by disposable export surfaces only.
   */
  applyExportBackground(background: ExportBackground): void {
    this.map.setPaintProperty(
      'background',
      'background-color',
      this.exportBackgroundColor(background),
    );
  }

  /**
   * Jumps the camera to an exact export camera without animation or fit/constrain.
   * @internal Bounded export API — used by disposable export surfaces only.
   */
  setCamera(camera: ExportCamera): void {
    this.map.jumpTo({
      center: { lng: camera.longitude, lat: camera.latitude },
      zoom: camera.zoom,
      bearing: camera.bearing,
      pitch: camera.pitch,
    });
  }

  /**
   * Re-reads the container's current CSS size into the MapLibre canvas immediately,
   * instead of waiting on MapLibre's internal `ResizeObserver` tick.
   * @internal Bounded export API — used by disposable export surfaces only.
   */
  syncCanvasSize(): void {
    this.map.resize();
  }

  /**
   * Removes the soft-boundary snap-back and the fit-derived `minZoom`/`maxBounds`
   * clamp so an exact tile camera can never be silently reprojected.
   * @remarks
   * Only safe on a disposable export surface — the interactive map relies on these
   * constraints for normal navigation.
   * @internal Bounded export API — used by disposable export surfaces only.
   */
  disableNavigationConstraints(): void {
    this.navigationManager.dispose();
    this.map.setMaxBounds(undefined);
    this.map.setMinZoom(0);
  }

  /** Captures an immutable snapshot on a disposable renderer surface. */
  static async captureSnapshotPng(
    snapshot: ExportSnapshot,
    options: PngExportOptions,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    return captureSnapshotPngImpl(
      snapshot,
      options,
      signal,
      (container, exportStyle) =>
        new MapLibreRenderer(container, exportStyle, {
          preserveDrawingBuffer: true,
          releasesDemProtocol: false,
        }),
    );
  }

  /**
   * Waits until MapLibre has painted all pending sources and layers.
   * @internal Bounded export API — used by disposable export surfaces only.
   */
  waitForIdle(): Promise<void> {
    return new Promise((resolve, reject) => {
      const finish = (): void => {
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        this.map.off('idle', finish);
        reject(new Error('PNG map render timed out'));
      }, EXPORT_CAPTURE_TIMEOUT_MS);
      this.map.once('idle', finish);
      this.map.triggerRepaint();
    });
  }

  /**
   * Captures an encoded PNG after the temporary renderer has become idle.
   * @internal Bounded export API — used by disposable export surfaces only.
   */
  captureCanvasBytes(): Promise<Uint8Array> {
    return captureCanvasOnNextRender(this.map, EXPORT_CAPTURE_TIMEOUT_MS);
  }

  /** Removes the MapLibre map and releases all GPU resources. */
  dispose(): void {
    for (const cancel of [...this.pendingPreviewCaptures]) cancel();
    if (this.releasesDemProtocol) unregisterDemProtocol();
    this.navigationManager.dispose();
    const canvas = this.map.getCanvas();
    this.map.remove();
    if (!this.releasesDemProtocol) releaseTemporaryWebGlContext(canvas);
  }

  private buildPreviewSnapshot(): ExportPreviewSnapshot | null {
    return buildPreviewSnapshotImpl(
      this.map,
      this.cityData,
      this.navigationManager.getBearing(),
    );
  }

  // ─── Layer API Delegation ───────────────────────────────────────────────

  /**
   * Shows or hides a logical map layer.
   *
   * @param layer - The logical layer name (e.g. `'roads'`).
   * @param visible - `true` to show, `false` to hide.
   */
  setLayerVisibility(layer: LayerName, visible: boolean): void {
    if (this.activeLayers) {
      this.activeLayers = { ...this.activeLayers, [layer]: visible };
    }
    this.layerManager.setVisibility(layer, visible);
  }

  /**
   * Dims every non-transit layer to a fraction of its baseline opacity, or
   * restores normal opacity — used when the Transit theme is active/inactive.
   */
  setTransitDimming(enabled: boolean): void {
    this.transitDimming = enabled;
    this.layerManager.setTransitDimming(enabled);
  }

  /** Updates the transit/buildings layer filters and buildings color expression from the given options. */
  setLayerOptions(options: LayerOptions): void {
    this.layerOptions = options;
    this.layerManager.setOptions(options);
  }

  /** Shows or hides the Vellum watermark logo. */
  setWatermarkVisibility(visible: boolean): void {
    this.watermarkVisible = visible;
    this.layerManager.setWatermarkVisibility(visible);
  }

  // ─── Navigation API Delegation ──────────────────────────────────────────

  /** Fits the MapLibre viewport to the city's geographic bounding box. */
  fitToScreen(): void {
    if (this.cityData) {
      this.navigationManager.fitToCityBounds(this.cityData);
      this.navigationManager.recalculateFitZoom();
      this.navigationManager.applyConstraints(this.cityData);
    }
  }

  /**
   * Toggles between strict and soft navigation boundary modes.
   *
   * @remarks
   * Strict mode: hard pan/zoom bounds. Soft mode: allows overpanning with
   * snap-back and underzooming down to 25% of fit-to-screen zoom.
   */
  toggleNavigationMode(): void {
    this.navigationManager.toggleMode();
    if (this.cityData) {
      this.navigationManager.applyConstraints(this.cityData);
    }
  }

  /** Zooms the map in by one step. */
  zoomIn(): void {
    this.navigationManager.zoomIn();
  }

  /** Zooms the map out by one step. */
  zoomOut(): void {
    this.navigationManager.zoomOut();
  }

  /**
   * Rotates the map by the given delta in degrees.
   *
   * @param deltaDegrees - Positive = clockwise, negative = counter-clockwise.
   */
  rotateBy(deltaDegrees: number): void {
    this.navigationManager.rotateBy(deltaDegrees);
  }

  /** Resets the map bearing to 0° (north up). */
  resetBearing(): void {
    this.navigationManager.resetBearing();
  }

  /**
   * Pans the map to the given geographic coordinate without animation.
   *
   * @param lng - Longitude.
   * @param lat - Latitude.
   */
  navigateTo(lng: number, lat: number): void {
    this.navigationManager.navigateTo(lng, lat);
  }

  /** Returns the current viewport bounds, or `null` if the map is not ready. */
  getInitialViewportBounds(): ViewportBounds | null {
    return this.navigationManager.getInitialBounds();
  }

  /**
   * Syncs an external viewport state to the MapLibre camera.
   *
   * @remarks
   * In this story the Canvas-space zoom/pan values have no direct MapLibre
   * equivalent — MapLibre manages its own viewport. This method is a no-op;
   * full translation ({css_zoom, panX_px, panY_px} → {maplibre_zoom,
   * center_latlng}) is deferred to Story 4-5b / minimap integration.
   */
  updateViewport(_zoom: number, _panX: number, _panY: number): void {
    // No-op — MapLibre manages its own viewport natively.
  }

  /**
   * Sincroniza el canvas interactivo con el tamaño CSS actual del contenedor.
   * No modifica cámara, bounds ni restricciones de navegación.
   */
  resize(_width: number, _height: number): void {
    this.map.resize();
  }

  // ─── Events ──────────────────────────────────────────────────────────────

  /**
   * Subscribes to viewport changes (pan/zoom).
   *
   * @param callback - Called on every `move`, `moveend`, and the next `idle` event.
   * @returns Cleanup function that unregisters all listeners.
   */
  subscribeViewport(callback: (bounds: ViewportBounds) => void): () => void {
    return subscribeViewportImpl(this.map, callback);
  }

  /**
   * Subscribes to hover events over transit-stop and district-marker features.
   *
   * @param callback - Called with `TooltipInfo` when entering a feature, `null` when leaving.
   * @returns Cleanup function that unregisters all listeners.
   */
  subscribeHover(callback: (info: TooltipInfo | null) => void): () => void {
    return subscribeHoverImpl(this.map, callback);
  }

  /**
   * Subscribes to the service-icon legend's relevance (zoom past the
   * icon-rendering threshold, and which `ServiceGroup`s currently render).
   *
   * @param callback - Called with the current {@link ServiceIconLegendState} on every pan/zoom.
   * @returns Cleanup function that unregisters the listeners.
   */
  subscribeServiceIconLegend(
    callback: (state: ServiceIconLegendState) => void,
  ): () => void {
    return subscribeServiceIconLegendImpl(this.map, callback);
  }
}

/** Captures a snapshot through the renderer's isolated export surface. */
export function captureExportSnapshotPng(
  snapshot: ExportSnapshot,
  options: PngExportOptions,
  signal: AbortSignal,
): Promise<Uint8Array> {
  return captureExportSnapshotPngImpl(
    snapshot,
    options,
    signal,
    (container, exportStyle) =>
      new MapLibreRenderer(container, exportStyle, {
        preserveDrawingBuffer: true,
        releasesDemProtocol: false,
      }),
  );
}
