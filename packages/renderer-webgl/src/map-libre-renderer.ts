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
import { CS1_HALF_EXTENT_DEG, csToGeoArray } from './coordinate-transform';
import type { TransitStopFeatureProperties } from './geojson-builder';
import {
  buildBuildingsGeoJson,
  buildContourLinesGeoJson,
  buildDistrictsGeoJson,
  buildForestsGeoJson,
  buildLandPolygonGeoJson,
  buildRoadsGeoJson,
  buildTransitGeoJson,
  buildTransitStopsGeoJson,
  buildWaterGeoJson,
} from './geojson-builder';
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
  terrain: ['terrain-fill', 'terrain-lines-layer'],
  water: ['base-water', 'base-land'],
  roads: ['roads-casing', 'roads-fill'],
  transit: ['transit-line', 'transit-stops'],
  buildings: ['buildings-fill', 'buildings-outline'],
  forests: ['forests-circles'],
  districts: ['districts-points'],
};

// ─── Road colour mapping ──────────────────────────────────────────────────────

type RoadTier =
  | 'highway'
  | 'railway'
  | 'largeArterial'
  | 'mediumArterial'
  | 'local'
  | 'gravel'
  | 'pedestrian'
  | 'pedestrianWay';

const ITEM_CLASS_TIER: Readonly<Record<string, RoadTier>> = {
  Highway: 'highway',
  'Large Road': 'largeArterial',
  'Medium Road': 'mediumArterial',
  'Small Road': 'local',
  'Gravel Road': 'gravel',
  'Pedestrian Way': 'pedestrianWay',
  'Pedestrian Path': 'pedestrianWay',
  'Train Track': 'railway',
  'Highway Tunnel': 'highway',
  'Large Road Tunnel': 'largeArterial',
  'Medium Road Tunnel': 'mediumArterial',
  'Small Road Tunnel': 'local',
  'Pedestrian Tunnel': 'pedestrianWay',
  'Pedestrian Bridge': 'pedestrian',
};

function getTierFillToken(tier: RoadTier, tokens: RendererTokens): string {
  switch (tier) {
    case 'highway':
      return tokens.roadHighway;
    case 'railway':
      return tokens.roadRailway;
    case 'largeArterial':
      return tokens.roadLargeArterial;
    case 'mediumArterial':
      return tokens.roadMediumArterial;
    case 'local':
      return tokens.roadLocal;
    case 'gravel':
      return tokens.roadGravel;
    case 'pedestrian':
      return tokens.roadPedestrian;
    case 'pedestrianWay':
      return tokens.roadPedestrianWay;
  }
}

function getTierCasingToken(tier: RoadTier, tokens: RendererTokens): string {
  switch (tier) {
    case 'highway':
      return tokens.roadHighwayCasing;
    case 'railway':
      return tokens.roadRailwayCasing;
    case 'largeArterial':
      return tokens.roadLargeArterialCasing;
    case 'mediumArterial':
      return tokens.roadMediumArterialCasing;
    case 'local':
      return tokens.roadLocalCasing;
    case 'gravel':
      return tokens.roadGravelCasing;
    case 'pedestrian':
      return tokens.roadPedestrianCasing;
    case 'pedestrianWay':
      return tokens.roadPedestrianWay;
  }
}

/** Builds a MapLibre data-driven color expression mapping itemClass → color. */
function buildRoadColorExpression(
  tokens: RendererTokens,
  type: 'fill' | 'casing',
): maplibregl.ExpressionSpecification {
  const getToken = type === 'fill' ? getTierFillToken : getTierCasingToken;

  const itemClasses = Object.keys(
    ITEM_CLASS_TIER,
  ) as (keyof typeof ITEM_CLASS_TIER)[];
  const matchArgs: (string | maplibregl.ExpressionSpecification)[] = [
    ['get', 'itemClass'] as maplibregl.ExpressionSpecification,
  ];

  // Build match pairs
  for (const cls of itemClasses) {
    const tier = ITEM_CLASS_TIER[cls];
    matchArgs.push(cls);
    matchArgs.push(getToken(tier, tokens));
  }

  // Default fallback
  matchArgs.push(tokens.roadLocal);

  return [
    'match',
    ...matchArgs,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** Builds the `interpolate`-by-zoom line-width expression using stored properties. */
const ROAD_WIDTH_EXPR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  8,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 0.1]],
  14,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 1.0]],
  18,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 3.0]],
] as unknown as maplibregl.ExpressionSpecification;

const ROAD_CASING_WIDTH_EXPR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  8,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 0.1], 1],
  14,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 1.0], 2],
  18,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 3.0], 3],
] as unknown as maplibregl.ExpressionSpecification;

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
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': tokens.terrain },
          },
        ],
      },
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
      const doRender = (): void => {
        this.addSourcesAndLayers(cityData);
        this.fitToCityBounds(cityData);
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
   * Shows or hides a logical map layer.
   *
   * @param layer - The logical layer name (e.g. `'roads'`).
   * @param visible - `true` to show, `false` to hide.
   */
  setLayerVisibility(layer: LayerName, visible: boolean): void {
    // No isStyleLoaded() guard: that check was too aggressive — MapLibre temporarily
    // returns false while processing newly-added sources/layers after render(), causing
    // the first several layer toggles to be silently dropped.
    // Safety is provided by `if (!this.map.getLayer(id)) continue` below, which skips
    // any layer that doesn't exist yet (e.g. if setLayerVisibility is called before render).
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
   * @remarks
   * Also fires once on the next `idle` event so that Minimap receives an
   * initial viewport state even when `render()` deferred `fitBounds` to the
   * MapLibre `load` event (style not yet ready at render time).
   *
   * @param callback - Called on every `move`, `moveend`, and the next `idle` event.
   * @returns Cleanup function that unregisters all listeners.
   */
  subscribeViewport(callback: (bounds: ViewportBounds) => void): () => void {
    const handler = () => {
      const b = this.map.getBounds();
      callback({
        westLng: b.getWest(),
        eastLng: b.getEast(),
        northLat: b.getNorth(),
        southLat: b.getSouth(),
      });
    };

    // Fire once on next `idle` so the minimap gets the initial viewport
    // even when fitBounds runs after the style load event.
    let idleFired = false;
    const idleHandler = () => {
      if (idleFired) return;
      idleFired = true;
      handler();
    };

    this.map.on('move', handler);
    this.map.on('moveend', handler);
    this.map.on('idle', idleHandler);

    return () => {
      this.map.off('move', handler);
      this.map.off('moveend', handler);
      this.map.off('idle', idleHandler);
    };
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
   * @remarks
   * Uses layer-filtered MapLibre events (`mousemove`/`mouseleave` on
   * `transit-stops`) so the handler only fires when the cursor is over a stop
   * feature — not on every pixel of mouse movement. A ±6px bbox query handles
   * visually overlapping stops (cluster case described in AC2).
   *
   * @param callback - Called with `TooltipInfo` when entering a stop, `null` when leaving.
   * @returns Cleanup function that unregisters both listeners.
   *
   * @errors Does not throw — if the layer does not exist, MapLibre events simply never fire.
   */
  subscribeHover(callback: (info: TooltipInfo | null) => void): () => void {
    const handleMove = (
      e: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ) => {
      const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 6, e.point.y - 6],
        [e.point.x + 6, e.point.y + 6],
      ];
      const nearby = this.map.queryRenderedFeatures(bbox, {
        layers: ['transit-stops'],
      });
      if (nearby.length === 0) return;

      const linesSeen = new Set<string>();
      const allLines: Array<TransitLineInfo> = [];

      for (const feature of nearby) {
        if (!feature.properties) continue;
        const props = feature.properties as TransitStopFeatureProperties;
        let parsed: Array<TransitLineInfo>;
        try {
          parsed = JSON.parse(props.lines) as Array<TransitLineInfo>;
        } catch {
          continue;
        }
        if (!Array.isArray(parsed)) continue;
        for (const line of parsed) {
          const key = `${line.name}:${line.color}`;
          if (!linesSeen.has(key)) {
            linesSeen.add(key);
            allLines.push(line);
          }
        }
      }

      if (allLines.length === 0) return;

      this.map.getCanvas().style.cursor = 'pointer';
      callback({ screenX: e.point.x, screenY: e.point.y, lines: allLines });
    };

    const handleLeave = () => {
      this.map.getCanvas().style.cursor = '';
      callback(null);
    };

    this.map.on('mousemove', 'transit-stops', handleMove);
    this.map.on('mouseleave', 'transit-stops', handleLeave);

    return () => {
      this.map.off('mousemove', 'transit-stops', handleMove);
      this.map.off('mouseleave', 'transit-stops', handleLeave);
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private addSourcesAndLayers(cityData: CityData): void {
    // Layer order (bottom → top):
    //   water · terrain · forests · buildings · roads · transit lines · transit stops · districts
    // Each addXLayer call appends to the top of the current stack (no beforeId).
    this.addBaseLayer(cityData);
    this.addTerrainLayer(cityData);
    this.addForestsLayer(cityData);
    this.addBuildingsLayer(cityData);
    this.addRoadsLayer(cityData);
    this.addTransitLayer(cityData);
    this.addTransitStopsLayer(cityData);
    this.addDistrictsLayer(cityData);
  }

  private addSourceIfAbsent(
    id: string,
    data: maplibregl.SourceSpecification,
  ): void {
    if (this.map.getSource(id)) {
      (this.map.getSource(id) as maplibregl.GeoJSONSource).setData(
        (data as maplibregl.GeoJSONSourceSpecification).data as Parameters<
          maplibregl.GeoJSONSource['setData']
        >[0],
      );
    } else {
      this.map.addSource(id, data);
    }
  }

  private addTerrainLayer(cityData: CityData): void {
    // The terrain_texture is a 1081×1081 RGBA PNG covering the full CS1 world extent
    // (±8640 units = ±CS1_HALF_EXTENT_DEG degrees at the equator). Water pixels are
    // transparent, so the water-fill layer underneath shows through.
    //
    // MapLibre image-source corners: [top-left, top-right, bottom-right, bottom-left] as [lng, lat].
    // CS1_LAT_SIGN=+1 (south-up): positive Z maps to positive lat, so:
    //   top-left  = [-half, +half]  (west, north in geo = low-X, high-Z in CS1)
    //   top-right = [+half, +half]
    //   bottom-right = [+half, -half]
    //   bottom-left  = [-half, -half]
    const h = CS1_HALF_EXTENT_DEG;
    const imageCoordinates: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ] = [
      [-h, h],
      [h, h],
      [h, -h],
      [-h, -h],
    ];

    if (!this.map.getSource('terrain')) {
      this.map.addSource('terrain', {
        type: 'image',
        url: cityData.terrainTexture,
        coordinates: imageCoordinates,
      });
    } else {
      (this.map.getSource('terrain') as maplibregl.ImageSource).updateImage({
        url: cityData.terrainTexture,
        coordinates: imageCoordinates,
      });
    }

    if (!this.map.getLayer('terrain-fill')) {
      this.map.addLayer({
        id: 'terrain-fill',
        type: 'raster',
        source: 'terrain',
        paint: {
          'raster-opacity': 1,
          'raster-fade-duration': 0,
          'raster-resampling': 'nearest',
        },
      });
    }

    this.addSourceIfAbsent('terrain-lines-source', {
      type: 'geojson',
      data: buildContourLinesGeoJson(cityData),
    });

    if (!this.map.getLayer('terrain-lines-layer')) {
      this.map.addLayer({
        id: 'terrain-lines-layer',
        type: 'line',
        source: 'terrain-lines-source',
        paint: {
          'line-color': '#000000',
          'line-width': 1,
          'line-opacity': 0.15,
        },
      });
    }
  }

  /**
   * Adds the base background layer: a single GeoJSON source that holds both the
   * full-world-extent water polygon and the vectorised land polygons. Two fill
   * layers (`base-water`, `base-land`) filter by `kind` property so each can be
   * styled independently while sharing one source update path.
   *
   * Toggling the `water` logical layer hides/shows both sub-layers together.
   */
  private addBaseLayer(cityData: CityData): void {
    const waterFeatures = buildWaterGeoJson().features.map((f) => ({
      ...f,
      properties: { kind: 'water' as const },
    }));
    const landFeatures = buildLandPolygonGeoJson(cityData).features.map(
      (f) => ({ ...f, properties: { kind: 'land' as const } }),
    );

    this.addSourceIfAbsent('base', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [...waterFeatures, ...landFeatures],
      },
    });

    if (!this.map.getLayer('base-water')) {
      this.map.addLayer({
        id: 'base-water',
        type: 'fill',
        source: 'base',
        filter: [
          '==',
          ['get', 'kind'],
          'water',
        ] as unknown as maplibregl.ExpressionSpecification,
        paint: { 'fill-color': this.tokens.water, 'fill-opacity': 0.9 },
      });
    }

    if (!this.map.getLayer('base-land')) {
      this.map.addLayer({
        id: 'base-land',
        type: 'fill',
        source: 'base',
        filter: [
          '==',
          ['get', 'kind'],
          'land',
        ] as unknown as maplibregl.ExpressionSpecification,
        paint: { 'fill-color': this.tokens.terrain, 'fill-opacity': 1 },
      });
    }
  }

  private addRoadsLayer(cityData: CityData): void {
    this.addSourceIfAbsent('roads', {
      type: 'geojson',
      data: buildRoadsGeoJson(cityData),
    });

    if (!this.map.getLayer('roads-casing')) {
      this.map.addLayer({
        id: 'roads-casing',
        type: 'line',
        source: 'roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': buildRoadColorExpression(this.tokens, 'casing'),
          'line-width': ROAD_CASING_WIDTH_EXPR,
        },
      });
    }

    if (!this.map.getLayer('roads-fill')) {
      this.map.addLayer({
        id: 'roads-fill',
        type: 'line',
        source: 'roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': buildRoadColorExpression(this.tokens, 'fill'),
          'line-width': ROAD_WIDTH_EXPR,
        },
      });
    }
  }

  private addTransitLayer(cityData: CityData): void {
    this.addSourceIfAbsent('transit', {
      type: 'geojson',
      data: buildTransitGeoJson(cityData),
    });
    if (!this.map.getLayer('transit-line')) {
      this.map.addLayer({
        id: 'transit-line',
        type: 'line',
        source: 'transit',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'get',
            'color',
          ] as unknown as maplibregl.ExpressionSpecification,
          'line-width': 2,
          'line-opacity': 0.85,
        },
      });
    }
  }

  private addTransitStopsLayer(cityData: CityData): void {
    this.addSourceIfAbsent('transit-stops', {
      type: 'geojson',
      data: buildTransitStopsGeoJson(cityData),
    });
    if (!this.map.getLayer('transit-stops')) {
      this.map.addLayer({
        id: 'transit-stops',
        type: 'circle',
        source: 'transit-stops',
        paint: {
          'circle-color': [
            'get',
            'color',
          ] as unknown as maplibregl.ExpressionSpecification,
          'circle-radius': 4,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });
    }
  }

  private addBuildingsLayer(cityData: CityData): void {
    this.addSourceIfAbsent('buildings', {
      type: 'geojson',
      data: buildBuildingsGeoJson(cityData),
    });
    if (!this.map.getLayer('buildings-fill')) {
      this.map.addLayer({
        id: 'buildings-fill',
        type: 'fill',
        source: 'buildings',
        paint: {
          'fill-color': this.tokens.buildingFill,
          'fill-opacity': 0.85,
        },
      });
    }
    if (!this.map.getLayer('buildings-outline')) {
      this.map.addLayer({
        id: 'buildings-outline',
        type: 'line',
        source: 'buildings',
        paint: {
          'line-color': this.tokens.buildingStroke,
          'line-width': 0.5,
        },
      });
    }
  }

  private addForestsLayer(cityData: CityData): void {
    this.addSourceIfAbsent('forests', {
      type: 'geojson',
      data: buildForestsGeoJson(cityData),
    });
    if (!this.map.getLayer('forests-circles')) {
      this.map.addLayer({
        id: 'forests-circles',
        type: 'circle',
        source: 'forests',
        paint: {
          'circle-color': '#14592a',
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'density'],
            0,
            1,
            1,
            4,
          ] as unknown as maplibregl.ExpressionSpecification,
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['get', 'density'],
            0,
            0.3,
            1,
            0.7,
          ] as unknown as maplibregl.ExpressionSpecification,
        },
      });
    }
  }

  private addDistrictsLayer(cityData: CityData): void {
    this.addSourceIfAbsent('districts', {
      type: 'geojson',
      data: buildDistrictsGeoJson(cityData),
    });
    if (!this.map.getLayer('districts-points')) {
      this.map.addLayer({
        id: 'districts-points',
        type: 'circle',
        source: 'districts',
        paint: {
          'circle-color': this.tokens.districtFill,
          'circle-radius': 6,
          'circle-stroke-color': this.tokens.districtLabel,
          'circle-stroke-width': 1,
        },
      });
    }
  }

  private fitToCityBounds(cityData: CityData): void {
    const { bounds } = cityData;
    // South-up: CS1 minZ (north) → small lat → geographic SW; maxZ (south) → large lat → geographic NE.
    const [swLng, swLat] = csToGeoArray({ x: bounds.minX, z: bounds.minZ });
    const [neLng, neLat] = csToGeoArray({ x: bounds.maxX, z: bounds.maxZ });
    this.map.fitBounds(
      [
        [swLng, swLat],
        [neLng, neLat],
      ],
      { padding: 20, animate: false },
    );
  }
}
