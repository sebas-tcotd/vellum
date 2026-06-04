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

import maplibregl from 'maplibre-gl';
import type {
  IRenderer,
  CityData,
  RenderParams,
  LayerName,
} from '@vellum/core';
import type { RendererTokens } from './tokens';
import {
  buildRoadsGeoJson,
  buildTransitGeoJson,
  buildBuildingsGeoJson,
  buildForestsGeoJson,
  buildDistrictsGeoJson,
  buildWaterGeoJson,
} from './geojson-builder';
import { csToGeoArray } from './coordinate-transform';

// ─── Layer ID mapping ─────────────────────────────────────────────────────────

/**
 * Maps each logical `LayerName` to the MapLibre layer IDs that implement it.
 * `terrain` is controlled by the background layer paint property, not a
 * separate layer, so its array is empty.
 */
const LAYER_ID_MAP: Record<LayerName, string[]> = {
  terrain: [],
  water: ['water-fill'],
  roads: ['roads-casing', 'roads-fill'],
  transit: ['transit-line'],
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

  // ─── Private helpers ────────────────────────────────────────────────────────

  private addSourcesAndLayers(cityData: CityData): void {
    this.addWaterLayer(cityData);
    this.addRoadsLayer(cityData);
    this.addTransitLayer(cityData);
    this.addBuildingsLayer(cityData);
    this.addForestsLayer(cityData);
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

  private addWaterLayer(cityData: CityData): void {
    this.addSourceIfAbsent('water', {
      type: 'geojson',
      data: buildWaterGeoJson(cityData),
    });
    if (!this.map.getLayer('water-fill')) {
      this.map.addLayer({
        id: 'water-fill',
        type: 'fill',
        source: 'water',
        paint: { 'fill-color': this.tokens.water, 'fill-opacity': 0.9 },
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
          'circle-color': this.tokens.green,
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
    const [swLng, swLat] = csToGeoArray({ x: bounds.minX, z: bounds.maxZ });
    const [neLng, neLat] = csToGeoArray({ x: bounds.maxX, z: bounds.minZ });
    this.map.fitBounds(
      [
        [swLng, swLat],
        [neLng, neLat],
      ],
      { padding: 20, animate: false },
    );
  }
}
