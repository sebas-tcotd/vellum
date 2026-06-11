/**
 * GPU-accelerated city renderer backed by MapLibre GL JS.
 *
 * @remarks
 * `MapLibreRenderer` implements `IRenderer` so it can be swapped in place of
 * `CanvasRenderer` without changing the React component contract.
 *
 * The renderer owns the `maplibregl.Map` instance and delegates all geometry
 * management to MapLibre's internal Web Workers. No RAF loop is needed —
 * MapLibre is event-driven and repaints only on viewport changes or source
 * updates.
 *
 * Coordinate system: all city-data coordinates are converted to equatorial
 * WGS-84 by `csToGeoArray` before being added as GeoJSON sources. This keeps
 * the Mercator distortion at zero (scale factor = 1.0 at the equator).
 */

import type {
  CityData,
  IRenderer,
  LayerName,
  RenderParams,
  TransitMode,
} from '@vellum/core';
import maplibregl from 'maplibre-gl';
import { getCityBoundsGeoJSON } from './helpers';
import {
  subscribeHover as subscribeHoverImpl,
  subscribeViewport as subscribeViewportImpl,
} from './interactions';
import {
  addBaseLayer,
  addBuildingsLayer,
  addDistrictsLayer,
  addForestsLayer,
  addGridPattern,
  addRoadsLayer,
  addTerrainLayers,
  addTransitLayers,
  createBaseStyle,
} from './layers';
import type { RendererTokens } from './tokens';

// ─── Hover tooltip types ──────────────────────────────────────────────────────

type TransitLineInfo = { name: string; color: string; mode: TransitMode };

/** Info emitted by the hover subscription when the cursor enters a transit-stop feature. */
export interface TooltipInfo {
  /** Canvas-relative X pixel of the cursor (matches MapLibre event.point.x). */
  screenX: number;
  /** Canvas-relative Y pixel of the cursor (matches MapLibre event.point.y). */
  screenY: number;
  /**
   * All transit lines serving the hovered stop (or cluster of stops).
   * Note: individual stops have no name in the .cslmap — only lines have names.
   */
  lines: TransitLineInfo[];
}

// ─── Layer ID mapping ─────────────────────────────────────────────────────────

/**
 * Maps each logical `LayerName` to the MapLibre layer IDs that implement it.
 * `terrain` is controlled by the background layer paint property, not a
 * separate layer, so its array is empty.
 */
const LAYER_ID_MAP: Record<LayerName, string[]> = {
  terrain: ['terrain-fill', 'terrain-lines-layer', 'coastline-layer'],
  water: ['base-water', 'base-land'],
  roads: [
    'roads-casing',
    'roads-fill',
    'roads-tunnel-bridge-casing',
    'roads-tunnel-bridge-fill',
  ],
  transit: ['transit-line', 'transit-stops'],
  buildings: ['buildings-fill', 'buildings-outline'],
  forests: ['forests-circles'],
  districts: ['districts-points'],
};

// ─── Viewport ─────────────────────────────────────────────────────────────────

/** Geographic viewport state emitted by the minimap subscription. */
export interface ViewportBounds {
  westLng: number;
  eastLng: number;
  northLat: number;
  southLat: number;
}

// ─── Renderer ────────────────────────────────────────────────────────────────

/**
 * GPU-accelerated renderer that converts `CityData` to MapLibre GL JS sources
 * and layers. Implements the `IRenderer` port defined in `@vellum/core`.
 */
export class MapLibreRenderer implements IRenderer {
  private readonly map: maplibregl.Map;
  private readonly tokens: RendererTokens;
  private cityData: CityData | null = null;
  private navigationMode: 'strict' | 'soft' = 'soft';
  private isSnappingBack = false;
  private fitToScreenZoom = 0;

  /**
   * Creates a new `MapLibreRenderer` and attaches it to the given container.
   *
   * @param container - A DOM div that MapLibre will populate.
   * @param tokens - Design tokens read from CSS custom properties at mount time.
   */
  constructor(container: HTMLDivElement, tokens: RendererTokens) {
    this.tokens = tokens;

    this.map = new maplibregl.Map({
      container,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      renderWorldCopies: false,
      maxZoom: 18,
      style: createBaseStyle(tokens),
    });
  }

  /**
   * Loads city data into MapLibre sources and layers.
   *
   * @remarks
   * If the style is not yet loaded, rendering is deferred to the `load` event.
   * After sources are added, the map is fitted to the city bounding box.
   */
  render(cityData: CityData, _params: RenderParams): Promise<void> {
    this.cityData = cityData;

    return new Promise((resolve) => {
      const doRender = async (): Promise<void> => {
        await this.addSourcesAndLayers(cityData);
        this.fitToCityBounds(cityData);
        this.fitToScreenZoom = this.map.getZoom();
        this.applyNavigationConstraints(cityData);
        this.registerMoveEndListener();
        resolve();
      };

      if (this.map.isStyleLoaded()) {
        doRender();
      } else {
        this.map.once('load', doRender);
      }
    });
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
   * No-op: MapLibre responds to `ResizeObserver` internally.
   */
  resize(_width: number, _height: number): void {
    // MapLibre listens to container resize via ResizeObserver automatically.
  }

  /** Removes the MapLibre map and releases all GPU resources. */
  dispose(): void {
    this.map.remove();
  }

  /**
   * Clears all city-specific data from the map, leaving only the base background.
   *
   * @remarks
   * Called when loading starts so the old map is not visible during the transition
   * to a new city. Removes all city-specific layers and sources, and resets the
   * grid pattern to a solid background color.
   */
  clear(): void {
    this.cityData = null;

    const allLayerIds = new Set(Object.values(LAYER_ID_MAP).flat());
    allLayerIds.add('roads-railway-casing');

    for (const id of allLayerIds) {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
      }
    }

    const sourceIds = [
      'base',
      'terrain',
      'coastline-source',
      'terrain-lines-source',
      'forests',
      'buildings',
      'roads',
      'transit',
      'transit-stops',
      'districts',
    ];

    for (const id of sourceIds) {
      if (this.map.getSource(id)) {
        this.map.removeSource(id);
      }
    }

    this.map.setPaintProperty('background', 'background-pattern', null);
  }

  /**
   * Shows or hides a logical map layer.
   *
   * @param layer - The logical layer name (e.g. `'roads'`).
   * @param visible - `true` to show, `false` to hide.
   */
  setLayerVisibility(layer: LayerName, visible: boolean): void {
    const ids = LAYER_ID_MAP[layer];
    for (const id of ids) {
      if (!this.map.getLayer(id)) continue;
      this.map.setLayoutProperty(
        id,
        'visibility',
        visible ? 'visible' : 'none',
      );
    }
  }

  /** Fits the MapLibre viewport to the city's geographic bounding box. */
  fitToScreen(): void {
    if (!this.cityData) return;
    this.fitToCityBounds(this.cityData);
    this.applyNavigationConstraints(this.cityData);
  }

  /**
   * Toggles between strict and soft navigation boundary modes.
   *
   * @remarks
   * Strict mode: hard pan/zoom bounds. Soft mode: allows overpanning with
   * snap-back and underzooming down to 25% of fit-to-screen zoom.
   */
  toggleNavigationMode(): void {
    this.navigationMode = this.navigationMode === 'strict' ? 'soft' : 'strict';
    if (this.cityData) {
      this.applyNavigationConstraints(this.cityData);
    }
  }

  /** Zooms the map in by one step. */
  zoomIn(): void {
    this.map.zoomIn();
  }

  /** Zooms the map out by one step. */
  zoomOut(): void {
    this.map.zoomOut();
  }

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
   * Returns the current viewport bounds, or `null` if the map is not ready.
   */
  getInitialViewportBounds(): ViewportBounds | null {
    try {
      const b = this.map.getBounds();
      return {
        westLng: b.getWest(),
        eastLng: b.getEast(),
        northLat: b.getNorth(),
        southLat: b.getSouth(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Pans the map to the given geographic coordinate without animation.
   *
   * @param lng - Longitude.
   * @param lat - Latitude.
   */
  navigateTo(lng: number, lat: number): void {
    this.map.flyTo({ center: [lng, lat], animate: false });
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

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async addSourcesAndLayers(cityData: CityData): Promise<void> {
    await addGridPattern(this.map);
    addBaseLayer(this.map, cityData, this.tokens);
    addTerrainLayers(this.map, cityData, this.tokens);
    addForestsLayer(this.map, cityData);
    addBuildingsLayer(this.map, cityData, this.tokens);
    addRoadsLayer(this.map, cityData, this.tokens);
    addTransitLayers(this.map, cityData);
    addDistrictsLayer(this.map, cityData, this.tokens);
  }

  /** Fits the MapLibre viewport to the city's geographic bounding box. */
  private fitToCityBounds(cityData: CityData): void {
    this.map.fitBounds(getCityBoundsGeoJSON(cityData), {
      padding: 20,
      animate: false,
    });
  }

  /**
   * Applies pan and zoom constraints derived from the city's geographic bounds.
   *
   * @remarks
   * Must be called **after** {@link fitToCityBounds} so that `minZoom` reflects
   * the zoom level required to fit the entire city in the viewport.
   *
   * In strict mode: sets `maxBounds` to city bounds (hard pan limit).
   * In soft mode: removes `maxBounds` (allows overpanning) and sets `minZoom`
   * to 25% of the fit-to-screen zoom.
   */
  private applyNavigationConstraints(cityData: CityData): void {
    if (this.navigationMode === 'strict') {
      this.map.setMaxBounds(getCityBoundsGeoJSON(cityData));
      this.map.setMinZoom(this.map.getZoom());
    } else {
      this.map.setMaxBounds(undefined);
      this.map.setMinZoom(Math.max(this.fitToScreenZoom * 0.25, 0));
    }
  }

  /**
   * Registers the `moveend` listener for soft-boundary snap-back.
   *
   * @remarks
   * In soft mode, when the user releases the pan and the map center is outside
   * the city bounds, the map snaps back to fit the city at the current zoom.
   */
  private registerMoveEndListener(): void {
    this.map.on('moveend', () => {
      if (
        this.navigationMode !== 'soft' ||
        !this.cityData ||
        this.isSnappingBack
      )
        return;

      const center = this.map.getCenter();
      const [[swLng, swLat], [neLng, neLat]] = getCityBoundsGeoJSON(
        this.cityData,
      );

      const isOutside =
        center.lng < swLng ||
        center.lng > neLng ||
        center.lat < swLat ||
        center.lat > neLat;

      if (isOutside) {
        this.isSnappingBack = true;
        this.map.fitBounds(
          [
            [swLng, swLat],
            [neLng, neLat],
          ],
          { padding: 20, animate: true, duration: 300 },
        );
        this.map.once('moveend', () => {
          this.isSnappingBack = false;
        });
      }
    });
  }
}
