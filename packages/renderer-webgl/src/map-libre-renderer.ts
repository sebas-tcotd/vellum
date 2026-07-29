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
  type ExportPreviewAnnotation,
  type ExportPreviewScale,
  type ExportPreviewSnapshot,
  type ExportArea,
  type ExportBackground,
  type ExportRequest,
  type ExportSnapshot,
  type IRenderer,
  type LayerName,
  type LayerOptions,
  type RenderParams,
  type RenderStyleParams,
  createExportSnapshot,
  exportScaleForFormat,
} from '@vellum/core';
import maplibregl from 'maplibre-gl';
import { csToGeo, geoToCs } from './coordinate-transform';
import {
  subscribeHover as subscribeHoverImpl,
  subscribeServiceIconLegend as subscribeServiceIconLegendImpl,
  subscribeViewport as subscribeViewportImpl,
} from './interactions';
import { createBaseStyle } from './layers';
import { MapLayerManager } from './managers/map-layer.manager';
import { MapNavigationManager } from './managers/map-navigation.manager';
import { MapSourceManager } from './managers/map-source.manager';
import { unregisterDemProtocol } from './sources/dem-protocol';
import { resolveColors } from './style-adapter';
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
const SCALE_SAMPLE_PIXELS = 100;
const SCALE_TARGET_PIXELS = 80;
const EXPORT_CAPTURE_TIMEOUT_MS = 8_000;
const MAX_EXPORT_PIXELS = 64_000_000;

/** Options for producing an isolated PNG raster from the current map state. */
export interface PngExportOptions {
  /** Requested raster density. */
  scale: 1 | 2 | 4;
  /** Current viewport or the full city extent. */
  area: ExportArea;
  /** Background treatment applied by the isolated export surface. */
  background: ExportBackground;
}

function niceScaleDistance(distance: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(distance));
  const normalized = distance / magnitude;
  const multiplier = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return multiplier * magnitude;
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
  private readonly pendingPreviewCaptures = new Set<
    (snapshot: ExportPreviewSnapshot | null) => void
  >();

  /**
   * Creates a new `MapLibreRenderer` and attaches it to the given container.
   *
   * @param container - A DOM div that MapLibre will populate.
   * @param style - Initial theme colors, applied to the base map style at construction.
   * @param preserveDrawingBuffer - Enables readback only for a disposable export surface.
   * @param releasesDemProtocol - Whether disposing this renderer may unregister the shared DEM protocol.
   */
  constructor(
    container: HTMLDivElement,
    style: RenderStyleParams,
    preserveDrawingBuffer = false,
    releasesDemProtocol = true,
  ) {
    this.style = style;
    this.releasesDemProtocol = releasesDemProtocol;
    const initialColors = resolveColors(style);

    this.map = new maplibregl.Map({
      container,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      renderWorldCopies: false,
      maxZoom: 18,
      canvasContextAttributes: { preserveDrawingBuffer },
      style: createBaseStyle(initialColors),
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

    return new Promise((resolve) => {
      const executeRender = async (): Promise<void> => {
        await this.sourceManager.initializeSourcesAndLayers(cityData);
        this.layerManager.setTerrainDem(cityData.terrainDem);
        this.applyInitialState(params);
        this.navigationManager.fitAndConstrain(cityData);
        resolve();
      };

      if (this.map.isStyleLoaded()) {
        executeRender();
      } else {
        this.map.once('load', executeRender);
      }
    });
  }

  /** Applies the requested layer visibility, transit dimming, and layer options for a freshly rendered city. */
  private applyInitialState(params: RenderParams): void {
    for (const layer of LAYER_NAMES) {
      this.layerManager.setVisibility(layer, params.activeLayers[layer]);
    }
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
    return new Promise((resolve) => {
      let settled = false;
      const finish = (snapshot: ExportPreviewSnapshot | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.pendingPreviewCaptures.delete(finish);
        try {
          this.map.off('render', handleRender);
        } catch {
          // The map may already have been removed during component teardown.
        }
        resolve(snapshot);
      };
      const handleRender = (): void => {
        try {
          finish(this.buildPreviewSnapshot());
        } catch {
          finish(null);
        }
      };
      const timeout = setTimeout(
        () => finish(null),
        PREVIEW_CAPTURE_TIMEOUT_MS,
      );
      this.pendingPreviewCaptures.add(finish);
      try {
        this.map.once('render', handleRender);
        this.map.triggerRepaint();
      } catch {
        finish(null);
      }
    });
  }

  /**
   * Renders a temporary, isolated MapLibre surface and returns its PNG bytes.
   *
   * The interactive renderer is never resized or reconfigured, preserving its
   * camera and WebGL performance settings. Exports are intentionally limited
   * to 64 million pixels to avoid exhausting GPU or process memory.
   */
  async capturePng(options: PngExportOptions): Promise<Uint8Array> {
    if (!this.cityData || !this.activeLayers) {
      throw new Error('No map is available for export');
    }
    const sourceCanvas = this.map.getCanvas();
    const baseWidth = sourceCanvas.clientWidth || sourceCanvas.width;
    const baseHeight = sourceCanvas.clientHeight || sourceCanvas.height;
    const width = baseWidth * options.scale;
    const height = baseHeight * options.scale;
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width * height > MAX_EXPORT_PIXELS
    ) {
      throw new Error('Requested export dimensions exceed the safe limit');
    }

    const container = document.createElement('div');
    container.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;`;
    document.body.append(container);
    // `toBlob()` runs asynchronously. The export-only context must retain the
    // completed frame until that encoder reads it; the interactive map remains
    // on MapLibre's performant default (`preserveDrawingBuffer: false`).
    const exportRenderer = new MapLibreRenderer(
      container,
      this.style,
      true,
      false,
    );
    try {
      await exportRenderer.render(this.cityData, {
        activeLayers: this.activeLayers,
      });
      exportRenderer.setTransitDimming(this.transitDimming);
      exportRenderer.setLayerOptions(this.layerOptions);
      if (options.area === 'viewport') {
        const center = this.map.getCenter();
        exportRenderer.map.jumpTo({
          center,
          zoom: this.map.getZoom(),
          bearing: this.map.getBearing(),
        });
      }
      exportRenderer.map.setPaintProperty(
        'background',
        'background-color',
        this.exportBackgroundColor(options.background),
      );
      await exportRenderer.waitForIdle();
      return await exportRenderer.captureCanvasBytes();
    } finally {
      exportRenderer.dispose();
      container.remove();
    }
  }

  /** Captures all export inputs without exposing the MapLibre instance. */
  createExportSnapshot(request: ExportRequest): ExportSnapshot | null {
    if (!this.cityData || !this.activeLayers) return null;
    const canvas = this.map.getCanvas();
    // Logical (CSS) pixels only. `canvas.width` is the backing store, i.e.
    // CSS px x devicePixelRatio, so falling back to it would silently report a
    // DPR-inflated surface for a canvas whose container is hidden.
    const baseWidth = canvas.clientWidth;
    const baseHeight = canvas.clientHeight;
    if (
      !Number.isFinite(baseWidth) ||
      !Number.isFinite(baseHeight) ||
      baseWidth <= 0 ||
      baseHeight <= 0
    )
      return null;
    const extent = this.exportExtent(request.area);
    if (!extent) return null;
    const scale = exportScaleForFormat(request.format);
    const center = this.map.getCenter();
    return createExportSnapshot({
      cityData: this.cityData,
      style: this.style,
      activeLayers: this.activeLayers,
      layerOptions: this.layerOptions,
      transitDimming: this.transitDimming,
      watermarkVisible: this.watermarkVisible,
      camera: {
        longitude: center.lng,
        latitude: center.lat,
        zoom: this.map.getZoom(),
        bearing: this.map.getBearing(),
        pitch: this.map.getPitch(),
      },
      extent,
      // The surface is the final output, matching how the legacy `capturePng`
      // path sizes its container — this is what capability checks measure.
      surface: { width: baseWidth * scale, height: baseHeight * scale },
      request,
    });
  }

  /** Resolves the world extent an export request actually covers. */
  private exportExtent(area: ExportArea): ExportSnapshot['extent'] | null {
    if (!this.cityData) return null;
    const { bounds } = this.cityData;
    if (area === 'full-map') {
      return {
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
      };
    }
    try {
      const viewport = this.map.getBounds();
      // Latitude is inverted relative to CS1 Z (positive Z = south), so the
      // northern edge yields the smaller Z. Sort rather than assume.
      const west = geoToCs({
        lng: viewport.getWest(),
        lat: viewport.getNorth(),
      });
      const east = geoToCs({
        lng: viewport.getEast(),
        lat: viewport.getSouth(),
      });
      return {
        minX: Math.min(west.x, east.x),
        maxX: Math.max(west.x, east.x),
        minZ: Math.min(west.z, east.z),
        maxZ: Math.max(west.z, east.z),
      };
    } catch {
      return null;
    }
  }

  /** Resolves export backgrounds from theme tokens instead of CSS literals. */
  private exportBackgroundColor(background: ExportBackground): string {
    if (background === 'transparent') return 'rgba(0, 0, 0, 0)';
    return background === 'dark'
      ? this.style.transitBackground
      : this.style.mapBackground;
  }

  /** Waits until MapLibre has painted all pending sources and layers. */
  private waitForIdle(): Promise<void> {
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

  /** Captures an encoded PNG after the temporary renderer has become idle. */
  private captureCanvasBytes(): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (result: Uint8Array | Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.map.off('render', capture);
        result instanceof Error ? reject(result) : resolve(result);
      };
      const capture = (): void => {
        const canvas = this.map.getCanvas();
        canvas.toBlob((blob) => {
          if (!blob) return finish(new Error('PNG encoding failed'));
          void blob.arrayBuffer().then(
            (buffer) => finish(new Uint8Array(buffer)),
            () => finish(new Error('PNG encoding failed')),
          );
        }, 'image/png');
      };
      const timeout = setTimeout(
        () => finish(new Error('PNG capture timed out')),
        EXPORT_CAPTURE_TIMEOUT_MS,
      );
      this.map.once('render', capture);
      this.map.triggerRepaint();
    });
  }

  /** Removes the MapLibre map and releases all GPU resources. */
  dispose(): void {
    for (const finish of [...this.pendingPreviewCaptures]) finish(null);
    if (this.releasesDemProtocol) unregisterDemProtocol();
    this.navigationManager.dispose();
    this.map.remove();
  }

  private buildPreviewSnapshot(): ExportPreviewSnapshot | null {
    const canvas = this.map.getCanvas();
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    if (!this.cityData || width <= 0 || height <= 0) return null;
    const scale = this.buildPreviewScale(width, height);
    if (!scale) return null;
    return {
      dataUrl: canvas.toDataURL('image/png'),
      bearingDegrees: this.navigationManager.getBearing(),
      scale,
      annotations: this.buildPreviewAnnotations(width, height),
    };
  }

  private buildPreviewScale(
    width: number,
    height: number,
  ): ExportPreviewScale | null {
    const centerX = width / 2;
    const centerY = height / 2;
    const start = geoToCs(this.map.unproject([centerX, centerY]));
    const end = geoToCs(
      this.map.unproject([centerX + SCALE_SAMPLE_PIXELS, centerY]),
    );
    const metresPerPixel =
      Math.hypot(end.x - start.x, end.z - start.z) / SCALE_SAMPLE_PIXELS;
    if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) return null;
    const distanceMeters = niceScaleDistance(
      metresPerPixel * SCALE_TARGET_PIXELS,
    );
    return {
      distanceMeters,
      widthPercent: (distanceMeters / metresPerPixel / width) * 100,
    };
  }

  private buildPreviewAnnotations(
    width: number,
    height: number,
  ): ExportPreviewAnnotation[] {
    if (!this.cityData) return [];
    const annotations = [
      ...this.cityData.districts.map((district) => ({
        id: district.id,
        name: district.name,
        kind: 'district' as const,
        position: district.position,
      })),
      ...this.cityData.parkAreas.map((park) => ({
        id: park.id,
        name: park.name,
        kind: 'park' as const,
        position: park.position,
      })),
    ];
    return annotations.flatMap(({ id, name, kind, position }) => {
      const point = this.map.project(csToGeo(position));
      const xPercent = (point.x / width) * 100;
      const yPercent = (point.y / height) * 100;
      if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) {
        return [];
      }
      return [{ id, name, kind, xPercent, yPercent }];
    });
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

  /** No-op: MapLibre responds to `ResizeObserver` internally. */
  resize(_width: number, _height: number): void {
    // MapLibre listens to container resize via ResizeObserver automatically.
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
