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

import {
  DEFAULT_LAYER_OPTIONS,
  LAYER_NAMES,
  type CityData,
  type IRenderer,
  type LayerName,
  type LayerOptions,
  type RenderParams,
  type RenderStyleParams,
  type TransitMode,
} from '@vellum/core';
import maplibregl from 'maplibre-gl';
import { buildBuildingColorExpression } from './expressions/building-color';
import { buildRoadColorExpression } from './expressions/road-color';
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
  addServiceIconsLayer,
  addTerrainLayers,
  addTransitLayers,
  createBaseStyle,
} from './layers';
import { resolveColors, type ResolvedColors } from './style-adapter';

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
    'roads-ferry',
    'roads-railway-casing',
  ],
  transit: [
    'transit-connector',
    'transit-line',
    'transit-stops',
    'transit-stops-outline',
    'transit-stops-dot',
  ],
  buildings: ['buildings-fill', 'buildings-outline', 'service-icons'],
  forests: ['forests-circles'],
  districts: ['districts-points'],
};

/** Multiplier applied to each non-transit layer's baseline opacity when the Transit theme is active (Story 5.3). */
const TRANSIT_DIM_FACTOR = 0.15;

/**
 * Baseline opacity (and paint property) for every non-transit layer id, used to
 * compute the dimmed value (`baseline * TRANSIT_DIM_FACTOR`) in `setTransitDimming`.
 * `forests-circles` uses a data-driven expression instead of a plain number — its
 * dimmed variant scales the existing expression via `['*', expr, factor]`.
 */
const NON_TRANSIT_OPACITY: Record<
  string,
  {
    prop: 'fill-opacity' | 'line-opacity' | 'circle-opacity' | 'icon-opacity';
    base: unknown;
  }
> = {
  'terrain-lines-layer': { prop: 'line-opacity', base: 0.5 },
  'coastline-layer': { prop: 'line-opacity', base: 0.8 },
  'base-water': { prop: 'fill-opacity', base: 1 },
  'base-land': { prop: 'fill-opacity', base: 1 },
  'roads-casing': { prop: 'line-opacity', base: 1 },
  'roads-fill': { prop: 'line-opacity', base: 1 },
  'roads-tunnel-bridge-casing': { prop: 'line-opacity', base: 1 },
  'roads-tunnel-bridge-fill': { prop: 'line-opacity', base: 1 },
  'roads-ferry': { prop: 'line-opacity', base: 0.65 },
  'roads-railway-casing': { prop: 'line-opacity', base: 1 },
  'buildings-fill': { prop: 'fill-opacity', base: 0.85 },
  'buildings-outline': { prop: 'line-opacity', base: 1 },
  'service-icons': { prop: 'icon-opacity', base: 1 },
  'forests-circles': {
    prop: 'circle-opacity',
    base: [
      'interpolate',
      ['linear'],
      ['get', 'density'],
      0,
      0.3,
      1,
      0.7,
    ] as unknown,
  },
  'districts-points': { prop: 'circle-opacity', base: 1 },
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
  private colors: ResolvedColors;
  private cityData: CityData | null = null;
  private navigationMode: 'strict' | 'soft' = 'soft';
  private isSnappingBack = false;
  private fitToScreenZoom = 0;
  private transitDimming = false;
  private layerOptions: LayerOptions = DEFAULT_LAYER_OPTIONS;

  /**
   * Creates a new `MapLibreRenderer` and attaches it to the given container.
   *
   * @param container - A DOM div that MapLibre will populate.
   * @param style - Initial theme colors, applied to the base map style at construction.
   */
  constructor(container: HTMLDivElement, style: RenderStyleParams) {
    this.colors = resolveColors(style);

    this.map = new maplibregl.Map({
      container,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
      renderWorldCopies: false,
      maxZoom: 18,
      style: createBaseStyle(this.colors),
    });
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
      const doRender = async (): Promise<void> => {
        await this.addSourcesAndLayers(cityData);
        for (const layer of LAYER_NAMES) {
          this.setLayerVisibility(layer, params.activeLayers[layer]);
        }
        this.setTransitDimming(this.transitDimming);
        this.setLayerOptions(this.layerOptions);
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

  /**
   * Applies a new set of theme colors to every currently-registered layer via
   * `map.setPaintProperty()` — no source re-processing, no renderer teardown.
   *
   * @remarks
   * Safe to call before a city is loaded (layers that don't exist yet are
   * skipped) and safe to call repeatedly. Road colors are re-derived as
   * data-driven `match` expressions since road color varies by tier.
   */
  async applyTheme(style: RenderStyleParams): Promise<void> {
    this.colors = resolveColors(style);
    const c = this.colors;

    this.setPaintIfExists('background', 'background-color', c.background);
    this.setPaintIfExists('base-water', 'fill-color', c.water);
    this.setPaintIfExists('base-land', 'fill-color', c.land);
    this.setPaintIfExists('coastline-layer', 'line-color', c.coastlineStroke);
    this.setPaintIfExists('forests-circles', 'circle-color', c.forests);
    const { colorByCategory } = this.layerOptions.buildings;
    this.setPaintIfExists(
      'buildings-fill',
      'fill-color',
      buildBuildingColorExpression(c, 'fill', colorByCategory),
    );
    this.setPaintIfExists(
      'buildings-outline',
      'line-color',
      buildBuildingColorExpression(c, 'stroke', colorByCategory),
    );
    this.setPaintIfExists('districts-points', 'circle-color', c.districtFill);
    this.setPaintIfExists(
      'districts-points',
      'circle-stroke-color',
      c.districtLabel,
    );

    const fillExpr = buildRoadColorExpression(c, 'fill');
    const casingExpr = buildRoadColorExpression(c, 'casing');
    this.setPaintIfExists('roads-fill', 'line-color', fillExpr);
    this.setPaintIfExists('roads-tunnel-bridge-fill', 'line-color', fillExpr);
    this.setPaintIfExists('roads-casing', 'line-color', casingExpr);
    this.setPaintIfExists(
      'roads-tunnel-bridge-casing',
      'line-color',
      casingExpr,
    );
    this.setPaintIfExists('roads-railway-casing', 'line-color', casingExpr);
    this.setPaintIfExists('roads-ferry', 'line-color', c.ferry);
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
      'transit-connectors',
      'transit-stops',
      'transit-stops-dots',
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

  /**
   * Dims every non-transit layer (`terrain`, `water`, `roads`, `buildings`,
   * `forests`, `districts`) to `TRANSIT_DIM_FACTOR` of its baseline opacity, or
   * restores normal opacity — used when the Transit theme is active/inactive.
   *
   * @remarks
   * Orthogonal to {@link setLayerVisibility}: this only touches paint-property
   * opacity, never `visibility`. A hidden layer stays hidden regardless of its
   * dimmed opacity, and re-showing it restores the dimmed (not full) opacity
   * for free, since the paint property was never reset while hidden.
   */
  setTransitDimming(enabled: boolean): void {
    this.transitDimming = enabled;
    for (const [id, { prop, base }] of Object.entries(NON_TRANSIT_OPACITY)) {
      const value = enabled
        ? (['*', base, TRANSIT_DIM_FACTOR] as unknown)
        : base;
      this.setPaintIfExists(id, prop, value);
    }
  }

  /**
   * Updates the `transit` and `buildings` layer filters to only show features
   * whose `mode`/`category` is in the given visible set, and re-applies the
   * buildings color expression for the RICO "color by category" toggle — the
   * "advanced layer options" panel.
   *
   * @remarks
   * A multi-modal transit stop's marker carries only its first-serving line's
   * `mode` ({@link TransitStopFeatureProperties} in `geojson/index.ts`), so
   * hiding that mode hides the whole marker even if the stop also serves a
   * still-visible mode. Known limitation, not fixed here.
   */
  setLayerOptions(options: LayerOptions): void {
    this.layerOptions = options;

    const transitFilter = [
      'in',
      ['get', 'mode'],
      ['literal', options.transit.visibleModes],
    ] as unknown as maplibregl.FilterSpecification;
    for (const id of LAYER_ID_MAP.transit) {
      this.setFilterIfExists(id, transitFilter);
    }

    const buildingsFilter = [
      'in',
      ['get', 'category'],
      ['literal', options.buildings.visibleCategories],
    ] as unknown as maplibregl.FilterSpecification;
    for (const id of LAYER_ID_MAP.buildings) {
      this.setFilterIfExists(id, buildingsFilter);
    }

    const { colorByCategory } = options.buildings;
    this.setPaintIfExists(
      'buildings-fill',
      'fill-color',
      buildBuildingColorExpression(this.colors, 'fill', colorByCategory),
    );
    this.setPaintIfExists(
      'buildings-outline',
      'line-color',
      buildBuildingColorExpression(this.colors, 'stroke', colorByCategory),
    );
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
    addBaseLayer(this.map, cityData, this.colors);
    addTerrainLayers(this.map, cityData, this.colors);
    addForestsLayer(this.map, cityData, this.colors);
    addBuildingsLayer(this.map, cityData, this.colors);
    await addServiceIconsLayer(this.map);
    addRoadsLayer(this.map, cityData, this.colors);
    addTransitLayers(this.map, cityData);
    addDistrictsLayer(this.map, cityData, this.colors);
  }

  /** Sets a paint property only if the layer currently exists (a theme may be applied before a city is loaded). */
  private setPaintIfExists(
    layerId: string,
    prop: string,
    value: unknown,
  ): void {
    if (!this.map.getLayer(layerId)) return;
    this.map.setPaintProperty(layerId, prop as never, value as never);
  }

  /** Sets a layer's `filter` only if the layer currently exists (a theme/options update may run before a city is loaded). */
  private setFilterIfExists(
    layerId: string,
    filter: maplibregl.FilterSpecification,
  ): void {
    if (!this.map.getLayer(layerId)) return;
    this.map.setFilter(layerId, filter);
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
