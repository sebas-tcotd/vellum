/**
 * Converts Vellum `CityData` domain objects into GeoJSON FeatureCollections
 * suitable for ingestion by MapLibre GL JS.
 *
 * @remarks
 * All coordinate conversions go through `csToGeoArray`, which applies the
 * equatorial CS1→WGS-84 transform and produces [longitude, latitude] pairs
 * in the order required by RFC 7946 (GeoJSON spec) and MapLibre.
 *
 * This module is a pure data transformer — it has no side effects and does
 * not import MapLibre. It can be unit-tested in jsdom without WebGL.
 */

import type {
  BuildingServiceCategory,
  BuildingServiceType,
  CityData,
  RoadNode,
  TerrainPolygon,
  WayType,
} from '@vellum/core';
import { BUILDING_SERVICE_TYPE_CATEGORY } from '@vellum/core';
import { csToGeoArray, CS1_WORLD_HALF } from './coordinate-transform';
import type { ServiceGroup } from './service-icons';
import { resolveServiceGroup } from './service-icons';
import { buildTransitLineGraph } from './transit/line-graph';
import { computeLineOrder } from './transit/ordering';
import { buildRenderGeometry } from './transit/render-geometry';

// ─── GeoJSON primitives (minimal subset — avoids importing @types/geojson) ───

/** A GeoJSON LineString geometry. */
interface LineStringGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

/** A GeoJSON Point geometry. */
interface PointGeometry {
  type: 'Point';
  coordinates: [number, number];
}

/** A GeoJSON Polygon geometry. */
interface PolygonGeometry {
  type: 'Polygon';
  coordinates: [number, number][][];
}

/** A GeoJSON Feature wrapping a road segment. */
interface RoadFeature {
  type: 'Feature';
  geometry: LineStringGeometry;
  properties: RoadFeatureProperties;
}

/** A GeoJSON Feature wrapping a transit line. */
interface TransitFeature {
  type: 'Feature';
  geometry: LineStringGeometry;
  properties: TransitFeatureProperties;
}

/** A GeoJSON Feature wrapping a building footprint. */
interface BuildingFeature {
  type: 'Feature';
  geometry: PolygonGeometry;
  properties: BuildingFeatureProperties;
}

/** A GeoJSON Feature wrapping a forest cell point. */
interface ForestFeature {
  type: 'Feature';
  geometry: PointGeometry;
  properties: ForestFeatureProperties;
}

/** A GeoJSON Feature wrapping a district label point. */
interface DistrictFeature {
  type: 'Feature';
  geometry: PointGeometry;
  properties: DistrictFeatureProperties;
}

/** A GeoJSON Feature wrapping a water polygon. */
interface WaterFeature {
  type: 'Feature';
  geometry: PolygonGeometry;
  properties: Record<string, never>;
}

/** A GeoJSON Feature wrapping a station polygon (rotated rectangle across its corridor). */
interface TransitStopFeature {
  type: 'Feature';
  geometry: PolygonGeometry;
  properties: TransitStopFeatureProperties;
}

interface ContourLineFeature {
  type: 'Feature';
  geometry: LineStringGeometry;
  properties: { elevation: number };
}

/**
 * Properties attached to each road segment GeoJSON feature.
 * Used by MapLibre Data-Driven Styling expressions (e.g., `['get', 'tier']`).
 */
export interface RoadFeatureProperties {
  /** The segment's unique CS1 identifier. */
  id: string;
  /** The item class from CS1 (e.g. "Large Road", "Highway"). */
  itemClass: string;
  /** Classified road tier used for color and width expressions. */
  tier: RoadTier;
  /** Whether the segment's wayType includes Tunnel. */
  isTunnel: boolean;
  /** Whether the segment's wayType includes Bridge. */
  isBridge: boolean;
  /** Physical base width in CS1 world units. Used for `line-width` expressions. */
  width: number;
  /** Comma-separated WayType flags (e.g. "Road,Bridge"). */
  wayType: string;
  /** Fixed component of the line width model: totalWidth = fixed + scaled * zoomFactor. */
  fixedWidth: number;
  /** Scaled component of the line width model: totalWidth = fixed + scaled * zoomFactor. */
  scaledWidth: number;
}

/**
 * Properties attached to each transit line GeoJSON feature.
 */
export interface TransitFeatureProperties {
  /** The line's unique CS1 identifier. */
  id: string;
  /** Hexadecimal color string defined in-game (e.g., '#FF6600'). */
  color: string;
  /** Transportation mode (Bus, Tram, Train, etc.). */
  mode: string;
  /**
   * Signed slot index of this line within its corridor bundle — the paper's
   * `p − (|L(e)|−1)/2`. Position 0 is the leftmost line relative to the
   * feature's coordinate direction; the index is consumed by MapLibre
   * `line-offset` calibrated to `SLOT_M` world meters per unit
   * (see layers/layer-transit.ts). Inner-connection features carry 0 —
   * their displacement is baked into the geometry.
   */
  offsetIdx: number;
}

/**
 * Properties attached to each building GeoJSON feature.
 */
export interface BuildingFeatureProperties {
  /** The building's unique CS1 identifier. */
  id: string;
  /** The original asset class from the game. */
  itemClass: string;
  /** Top-level zoning group, used by the RICO visibility filter and color expression. */
  category: BuildingServiceCategory;
  /** Civic subcategory (`publicTransport`/`education`/`services`), or `null` for non-civic buildings. */
  civicKind: 'publicTransport' | 'education' | 'services' | null;
  /** Service-icon group (mirrors CS1's HUD categories), or `null` if `itemClass` has no icon. */
  serviceGroup: ServiceGroup | null;
}

/**
 * Properties attached to each forest cell GeoJSON feature.
 */
export interface ForestFeatureProperties {
  /** Normalized density of the forest cover (0.0 to 1.0). */
  density: number;
}

/**
 * Properties attached to each district GeoJSON feature.
 */
export interface DistrictFeatureProperties {
  /** The district's unique CS1 identifier. */
  id: string;
  /** Name assigned to the district in-game. */
  name: string;
}

/** A GeoJSON FeatureCollection of road segment LineStrings. */
export interface RoadsFeatureCollection {
  type: 'FeatureCollection';
  features: RoadFeature[];
}

/** A GeoJSON FeatureCollection of transit line LineStrings. */
export interface TransitFeatureCollection {
  type: 'FeatureCollection';
  features: TransitFeature[];
}

/** A GeoJSON FeatureCollection of building polygons. */
export interface BuildingsFeatureCollection {
  type: 'FeatureCollection';
  features: BuildingFeature[];
}

/** A GeoJSON FeatureCollection of forest cell points. */
export interface ForestsFeatureCollection {
  type: 'FeatureCollection';
  features: ForestFeature[];
}

/** A GeoJSON FeatureCollection of district label points. */
export interface DistrictsFeatureCollection {
  type: 'FeatureCollection';
  features: DistrictFeature[];
}

/** A GeoJSON FeatureCollection of water polygons. */
export interface WaterFeatureCollection {
  type: 'FeatureCollection';
  features: WaterFeature[];
}

/**
 * Properties attached to each station GeoJSON feature.
 */
export interface TransitStopFeatureProperties {
  /** Deterministic station identifier (first member stop's CS1 node ID). */
  id: string;
  /** Transportation mode of the first serving line. */
  mode: string;
  /** Hexadecimal color string of the first serving transit line. */
  color: string;
  /**
   * JSON-encoded array of all lines serving this stop.
   * Parsed in hover callbacks to display multi-line tooltips.
   * Note: stop names are not available in the .cslmap format.
   * Format: Array<{ name: string; color: string; mode: string }>
   */
  lines: string;
}

/** A GeoJSON FeatureCollection of station polygons. */
export interface TransitStopsFeatureCollection {
  type: 'FeatureCollection';
  features: TransitStopFeature[];
}

// Terrain GeoJSON types for vectorized polygon sources.

/** Properties on a land or inland-water polygon feature. */
export interface LandPolygonProperties {
  type: 'land' | 'inland_water';
}

/** Properties on a terrain elevation band feature. */
export interface TerrainBandProperties {
  type: 'terrain_band';
  elevationMin: number;
  elevationMax: number;
}

/** A GeoJSON FeatureCollection of vectorized land / inland-water polygons. */
export interface LandPolygonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: PolygonGeometry;
    properties: LandPolygonProperties | TerrainBandProperties;
  }>;
}

export interface ContourLineCollection {
  type: 'FeatureCollection';
  features: Array<ContourLineFeature>;
}

// ─── Road tier / width model ──────────────────────────────────────────────────

export type RoadTier =
  | 'highway'
  | 'train'
  | 'metro'
  | 'largeArterial'
  | 'mediumArterial'
  | 'local'
  | 'gravel'
  | 'pedestrian'
  | 'pedestrianWay';

interface RoadWidthStyle {
  fixed: number;
  scaled: number;
}

const ROAD_WIDTH_STYLES: Record<RoadTier, RoadWidthStyle> = {
  highway: { fixed: 0.3, scaled: 3.0 },
  train: { fixed: 0.3, scaled: 1.2 },
  metro: { fixed: 0.3, scaled: 1.2 },
  largeArterial: { fixed: 0.3, scaled: 2.0 },
  mediumArterial: { fixed: 0.3, scaled: 1.5 },
  local: { fixed: 0.2, scaled: 0.8 },
  gravel: { fixed: 0.2, scaled: 0.5 },
  pedestrian: { fixed: 0.2, scaled: 0.4 },
  pedestrianWay: { fixed: 0.1, scaled: 0.3 },
};

const ITEM_CLASS_TIER: Readonly<Record<string, RoadTier>> = {
  Highway: 'highway',
  'Large Road': 'largeArterial',
  'Medium Road': 'mediumArterial',
  'Small Road': 'local',
  'Gravel Road': 'gravel',
  'Pedestrian Way': 'pedestrianWay',
  'Pedestrian Path': 'pedestrianWay',
  'Train Track': 'train',
  'Train Track Tunnel': 'train',
  'Metro Track': 'metro',
  'Metro Track Tunnel': 'metro',
  'Highway Tunnel': 'highway',
  'Large Road Tunnel': 'largeArterial',
  'Medium Road Tunnel': 'mediumArterial',
  'Small Road Tunnel': 'local',
  'Pedestrian Tunnel': 'pedestrianWay',
  'Pedestrian Bridge': 'pedestrian',
};

const ROAD_EXCLUDED_ITEM_CLASSES = new Set([
  'Electricity Wire',
  'Airplane Path',
  'Ship Path',
  'Tram Line',
  'Tram Facility',
]);

function classifyRoadTier(
  itemClass: string,
  wayType: WayType[],
  width: number,
): RoadTier | null {
  if (ROAD_EXCLUDED_ITEM_CLASSES.has(itemClass)) return null;
  const tier = ITEM_CLASS_TIER[itemClass];
  if (tier !== undefined) return tier;
  if (wayType.includes('Highway')) return 'highway';
  if (wayType.includes('Pedestrian')) return 'pedestrianWay';
  if (width >= 28) return 'largeArterial';
  if (width >= 14) return 'local';
  return 'pedestrianWay';
}

// ─── Builder functions ────────────────────────────────────────────────────────

/**
 * Builds a GeoJSON FeatureCollection of road segments from parsed `CityData`.
 *
 * @remarks
 * Each segment becomes a `LineString` whose coordinates are: the start node
 * position, any intermediate curve points, and the end node position — all
 * converted to equatorial WGS-84 via `csToGeoArray`.
 *
 * Each feature includes `fixedWidth` and `scaledWidth` properties for use in
 * MapLibre `interpolate` expressions: `totalWidth = fixed + scaled * zoomFactor`.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildRoadsGeoJson(cityData: CityData): RoadsFeatureCollection {
  const nodeById = new Map<string, RoadNode>(
    cityData.roadNodes.map((n) => [n.id, n]),
  );

  const features: RoadFeature[] = [];

  for (const segment of cityData.roadSegments) {
    const tier = classifyRoadTier(
      segment.itemClass,
      segment.wayType,
      segment.width,
    );
    if (tier === null) continue;

    const startNode = nodeById.get(segment.startNodeId);
    const endNode = nodeById.get(segment.endNodeId);

    if (startNode === undefined || endNode === undefined) {
      continue;
    }

    const coordinates: [number, number][] = [
      csToGeoArray(startNode.position),
      ...segment.points.map((p) => csToGeoArray(p)),
      csToGeoArray(endNode.position),
    ];

    const { fixed, scaled } = ROAD_WIDTH_STYLES[tier];

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
      properties: {
        id: segment.id,
        itemClass: segment.itemClass,
        tier,
        isTunnel: segment.wayType.includes('Tunnel'),
        isBridge: segment.wayType.includes('Bridge'),
        width: segment.width,
        wayType: segment.wayType.join(','),
        fixedWidth: fixed,
        scaledWidth: scaled,
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

// ─── Transit pipeline (paper-faithful: line graph → MLNCM-S → render geometry) ─

/** A GeoJSON FeatureCollection of inner-connection LineStrings at junction nodes. */
export interface TransitConnectorsFeatureCollection {
  type: 'FeatureCollection';
  features: TransitFeature[];
}

/** A GeoJSON Feature wrapping a station center point (min-size dot marker). */
interface StationDotFeature {
  type: 'Feature';
  geometry: PointGeometry;
  properties: TransitStopFeatureProperties;
}

/** A GeoJSON FeatureCollection of station center points. */
export interface StationDotsFeatureCollection {
  type: 'FeatureCollection';
  features: StationDotFeature[];
}

/** All GeoJSON products of the transit rendering pipeline. */
export interface TransitRenderData {
  /** Trimmed corridor centerlines, one feature per (line × corridor). */
  lines: TransitFeatureCollection;
  /** Precomputed inner connections (Bézier) at junction nodes. */
  connectors: TransitConnectorsFeatureCollection;
  /** Station capsule polygons (detail-zoom marker). */
  stations: TransitStopsFeatureCollection;
  /**
   * Station center points, carrying the same properties as the capsules. Drawn
   * as a min-pixel-size `circle` marker so stations stay discoverable and
   * clickable when zoomed out, where the world-locked capsule is sub-pixel.
   */
  stationDots: StationDotsFeatureCollection;
}

/**
 * Runs the full transit pipeline: line graph construction (with corridor
 * contraction and Lemma-4.1 bundling), MLNCM-S line ordering, and render
 * geometry (trims, inner connections, stations). See the modules under
 * `./transit/` for the methodology references.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns Line, connector, and station FeatureCollections for MapLibre.
 */
export function buildTransitRenderData(cityData: CityData): TransitRenderData {
  const graph = buildTransitLineGraph(cityData);
  const { lineOrder } = computeLineOrder(graph);
  const geometry = buildRenderGeometry(graph, lineOrder, cityData);

  const lineFeatures: TransitFeature[] = [];
  for (const corridor of geometry.corridors) {
    const coordinates: [number, number][] = corridor.path.map((pt) =>
      csToGeoArray(pt),
    );
    const n = corridor.lineIds.length;
    for (let p = 0; p < n; p++) {
      const info = graph.lines.get(corridor.lineIds[p]);
      if (info === undefined) continue;
      lineFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {
          id: info.id,
          color: info.color,
          mode: info.mode,
          offsetIdx: p - (n - 1) / 2,
        },
      });
    }
  }

  const connectorFeatures: TransitFeature[] = geometry.connectors.flatMap(
    (conn) => {
      const info = graph.lines.get(conn.lineId);
      if (info === undefined) return [];
      return [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: conn.path.map((pt) => csToGeoArray(pt)),
          },
          properties: {
            id: info.id,
            color: info.color,
            mode: info.mode,
            offsetIdx: 0,
          },
        },
      ];
    },
  );

  const stationFeatures: TransitStopFeature[] = [];
  const stationDotFeatures: StationDotFeature[] = [];
  for (const station of geometry.stations) {
    const properties: TransitStopFeatureProperties = {
      id: station.id,
      mode: station.lines[0]?.mode ?? 'Unknown',
      color: station.lines[0]?.color ?? '#ffffff',
      lines: JSON.stringify(station.lines),
    };
    stationFeatures.push({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [station.polygon.map((pt) => csToGeoArray(pt))],
      },
      properties,
    });
    // Centroid of the capsule ring (excluding the repeated closing vertex).
    const ring = station.polygon.slice(0, -1);
    const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
    const cz = ring.reduce((s, p) => s + p.z, 0) / ring.length;
    stationDotFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: csToGeoArray({ x: cx, z: cz }) },
      properties,
    });
  }

  return {
    lines: { type: 'FeatureCollection', features: lineFeatures },
    connectors: { type: 'FeatureCollection', features: connectorFeatures },
    stations: { type: 'FeatureCollection', features: stationFeatures },
    stationDots: { type: 'FeatureCollection', features: stationDotFeatures },
  };
}

/**
 * Builds the transit-line FeatureCollection (corridor centerlines with
 * `offsetIdx` for `line-offset` rendering).
 *
 * @remarks
 * Thin wrapper over {@link buildTransitRenderData}; prefer that function when
 * the connector and station collections are also needed, to avoid running the
 * ordering pipeline three times.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildTransitGeoJson(
  cityData: CityData,
): TransitFeatureCollection {
  return buildTransitRenderData(cityData).lines;
}

/** A building's zoning group plus, for civic buildings, which of the 3 civic
 * subcategory colors applies. `civicKind` is `null` for every non-civic group. */
interface BuildingZoning {
  category: BuildingServiceCategory;
  civicKind: 'publicTransport' | 'education' | 'services' | null;
}

/**
 * Resolves a building's zoning group (and civic subcategory, if any) from its
 * `serviceType`, for the RICO visibility filter and the buildings color expression.
 * @remarks
 * Mirrors the `'unknown' → civic.services` fallback documented on
 * `BUILDING_SERVICE_TYPE_CATEGORY` — that lookup excludes `'unknown'` from its
 * keys, so it's special-cased here instead of widening the lookup's type.
 */
function resolveBuildingZoning(
  serviceType: BuildingServiceType,
): BuildingZoning {
  const path =
    serviceType === 'unknown'
      ? 'civic.services'
      : BUILDING_SERVICE_TYPE_CATEGORY[serviceType];
  const [group, leaf] = path.split('.');
  const category = group as BuildingServiceCategory;
  return {
    category,
    civicKind:
      category === 'civic'
        ? (leaf as 'publicTransport' | 'education' | 'services')
        : null,
  };
}

/**
 * Builds a GeoJSON FeatureCollection of building footprint polygons.
 *
 * @remarks
 * Each `Building` footprint (`Vec3[]`) is converted to a closed `Polygon` ring.
 * The parser has already filtered out non-building entities.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildBuildingsGeoJson(
  cityData: CityData,
): BuildingsFeatureCollection {
  const features: BuildingFeature[] = [];

  for (const building of cityData.buildings) {
    if (building.footprint.length < 3) continue;

    const ring: [number, number][] = building.footprint.map((v) =>
      csToGeoArray(v),
    );
    // Close the ring per GeoJSON spec
    ring.push(ring[0]);

    const { category, civicKind } = resolveBuildingZoning(building.serviceType);
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        id: building.id,
        itemClass: building.itemClass,
        category,
        civicKind,
        serviceGroup: resolveServiceGroup(building.itemClass),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Builds a GeoJSON FeatureCollection of forest cell points.
 *
 * @remarks
 * Each `ForestCell` becomes a `Point` at its grid centre. The `density`
 * property (0.0–1.0) is used for data-driven circle-radius and circle-opacity.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildForestsGeoJson(
  cityData: CityData,
): ForestsFeatureCollection {
  const features: ForestFeature[] = cityData.forestCells.map((cell) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: csToGeoArray({ x: cell.x, z: cell.z }),
    },
    properties: { density: cell.density },
  }));

  return { type: 'FeatureCollection', features };
}

/**
 * Builds a GeoJSON FeatureCollection of district label points.
 *
 * @remarks
 * `.cslmap` only exports a single position per district (no polygon boundary).
 * Each district is rendered as a `Point` labelled with `name`.
 * Actual text labels require `glyphs` in the MapLibre style — for this story
 * districts are rendered as CircleLayer points; labels are deferred to Story 4-6.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildDistrictsGeoJson(
  cityData: CityData,
): DistrictsFeatureCollection {
  const features: DistrictFeature[] = cityData.districts.map((district) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: csToGeoArray(district.position),
    },
    properties: { id: district.id, name: district.name },
  }));

  return { type: 'FeatureCollection', features };
}

/**
 * Builds a GeoJSON FeatureCollection containing a single full-world-extent water polygon.
 *
 * @remarks
 * **Rendering strategy:** Water is rendered as a solid backdrop covering the entire
 * CS1 world extent. The `land_polygon` fill layer (`buildLandPolygonGeoJson`) is then
 * drawn on top, covering actual land. The visual result is that water appears wherever
 * land is absent — ocean, rivers, and lakes all reveal the water layer beneath.
 *
 * Inland water bodies appear through this water backdrop naturally, since
 * `inlandWaterPolygons` renders above `landPolygon` in the layer stack.
 *
 * Polygon winding is CCW (geographic exterior) consistent with the south-up convention
 * (see `CS1_LAT_SIGN` in coordinate-transform).
 *
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildWaterGeoJson(): WaterFeatureCollection {
  // South-up CCW ring covering ±CS1_WORLD_HALF in both axes.
  const sw = csToGeoArray({ x: -CS1_WORLD_HALF, z: -CS1_WORLD_HALF });
  const se = csToGeoArray({ x: CS1_WORLD_HALF, z: -CS1_WORLD_HALF });
  const ne = csToGeoArray({ x: CS1_WORLD_HALF, z: CS1_WORLD_HALF });
  const nw = csToGeoArray({ x: -CS1_WORLD_HALF, z: CS1_WORLD_HALF });
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[sw, se, ne, nw, sw]] },
        properties: {},
      },
    ],
  };
}

/**
 * Builds the station-polygon FeatureCollection (paper §5.4 adapted to CSLMap:
 * proximity-grouped stops rendered as rotated rectangles across their
 * corridor's full bundle width).
 *
 * @remarks
 * Thin wrapper over {@link buildTransitRenderData}; prefer that function when
 * the line and connector collections are also needed.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildTransitStopsGeoJson(
  cityData: CityData,
): TransitStopsFeatureCollection {
  return buildTransitRenderData(cityData).stations;
}

// ─── Terrain vectorized polygon builders ─────────────────────────────────────

/** Converts a `TerrainPolygon` (already in WGS-84) to a GeoJSON Polygon geometry. */
function terrainPolygonToGeometry(poly: TerrainPolygon): PolygonGeometry {
  return {
    type: 'Polygon',
    coordinates: [poly.exterior, ...poly.holes],
  };
}

/**
 * Builds a GeoJSON FeatureCollection from `cityData.landPolygon`.
 *
 * @remarks
 * The coordinates are already in WGS-84 `[lng, lat]` — no conversion needed.
 * The Rust parser emits `{ type: 'land' }` as the semantic property.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildLandPolygonGeoJson(
  cityData: CityData,
): LandPolygonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cityData.landPolygon.map((poly) => ({
      type: 'Feature',
      geometry: terrainPolygonToGeometry(poly),
      properties: { type: 'land' as const },
    })),
  };
}

/**
 * Builds a GeoJSON FeatureCollection from `cityData.terrainBands`.
 *
 * @remarks
 * Each feature carries `{ type: 'terrain_band', elevationMin, elevationMax }`.
 * The MapLibre style maps `elevationMin`/`elevationMax` to `terrainLow/Mid/High` tokens.
 * Coordinates are already in WGS-84 — no conversion needed.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
/*export function buildTerrainBandsGeoJson(
  cityData: CityData,
): LandPolygonFeatureCollection {
  const features: LandPolygonFeatureCollection['features'] = [];
  for (const band of cityData.terrainBands) {
    for (const poly of band.polygons) {
      features.push({
        type: 'Feature',
        geometry: terrainPolygonToGeometry(poly),
        properties: {
          type: 'terrain_band' as const,
          elevationMin: band.elevationMin,
          elevationMax: band.elevationMax,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}*/

export function buildContourLinesGeoJson(
  city: CityData,
): ContourLineCollection {
  return {
    type: 'FeatureCollection',
    features: city.contourLines.flatMap((isoline) =>
      isoline.lines.map((lineCoords) => ({
        type: 'Feature',
        properties: { elevation: isoline.elevation },
        geometry: {
          type: 'LineString',
          coordinates: lineCoords,
        },
      })),
    ),
  };
}

/**
 * Builds a GeoJSON FeatureCollection from `cityData.coastline`.
 *
 * @remarks
 * The coastline isoline is extracted directly from the land polygon rings,
 * so its geometry is guaranteed to be pixel-perfect aligned with `landPolygon`.
 * Coordinates are already in WGS-84 — no conversion needed.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildCoastlineGeoJson(city: CityData): ContourLineCollection {
  return {
    type: 'FeatureCollection',
    features: city.coastline.lines.map((lineCoords) => ({
      type: 'Feature',
      properties: { elevation: city.coastline.elevation },
      geometry: {
        type: 'LineString',
        coordinates: lineCoords,
      },
    })),
  };
}
