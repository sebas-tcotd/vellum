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
  type IRenderer,
  type LayerName,
  type LayerOptions,
  type RenderParams,
  type RenderStyleParams,
} from '@vellum/core';
import maplibregl from 'maplibre-gl';
import {
  subscribeHover as subscribeHoverImpl,
  subscribeViewport as subscribeViewportImpl,
} from './interactions';
import { createBaseStyle } from './layers';
import { MapLayerManager } from './managers/map-layer.manager';
import { MapNavigationManager } from './managers/map-navigation.manager';
import { MapSourceManager } from './managers/map-source.manager';
import { resolveColors } from './style-adapter';
import type { TooltipInfo, ViewportBounds } from './types/renderer.types';

export type { TooltipInfo, ViewportBounds } from './types/renderer.types';

/**
 * GPU-accelerated renderer that converts `CityData` to MapLibre GL JS sources
 * and layers. Implements the `IRenderer` port defined in `@vellum/core`.
 */
export class MapLibreRenderer implements IRenderer {
  private readonly map: maplibregl.Map;

  private readonly layerManager: MapLayerManager;
  private readonly navigationManager: MapNavigationManager;
  private readonly sourceManager: MapSourceManager;

  private cityData: CityData | null = null;
  private transitDimming = false;
  private layerOptions: LayerOptions = DEFAULT_LAYER_OPTIONS;

  /**
   * Creates a new `MapLibreRenderer` and attaches it to the given container.
   *
   * @param container - A DOM div that MapLibre will populate.
   * @param style - Initial theme colors, applied to the base map style at construction.
   */
  constructor(container: HTMLDivElement, style: RenderStyleParams) {
    const initialColors = resolveColors(style);

    this.map = new maplibregl.Map({
      container,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      renderWorldCopies: false,
      maxZoom: 18,
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

    return new Promise((resolve) => {
      const executeRender = async (): Promise<void> => {
        await this.sourceManager.initializeSourcesAndLayers(cityData);
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
    this.sourceManager.clearAll();
  }

  /** Removes the MapLibre map and releases all GPU resources. */
  dispose(): void {
    this.navigationManager.dispose();
    this.map.remove();
  }

  // ─── Layer API Delegation ───────────────────────────────────────────────

  /**
   * Shows or hides a logical map layer.
   *
   * @param layer - The logical layer name (e.g. `'roads'`).
   * @param visible - `true` to show, `false` to hide.
   */
  setLayerVisibility(layer: LayerName, visible: boolean): void {
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

  // ─── Navigation API Delegation ──────────────────────────────────────────

  /** Fits the MapLibre viewport to the city's geographic bounding box. */
  fitToScreen(): void {
    if (this.cityData) {
      this.navigationManager.fitToCityBounds(this.cityData);
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
   * Subscribes to hover events over transit-stop features.
   *
   * @param callback - Called with `TooltipInfo` when entering a stop, `null` when leaving.
   * @returns Cleanup function that unregisters both listeners.
   */
  subscribeHover(callback: (info: TooltipInfo | null) => void): () => void {
    return subscribeHoverImpl(this.map, callback);
  }
}
