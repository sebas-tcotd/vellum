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

import type { CityData, RoadNode, WaterTile, WayType } from '@vellum/core';
import { SEA_LEVEL_DEFAULT } from '@vellum/core';
import { csToGeoArray, CS1_WORLD_SIZE } from './coordinate-transform';

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

/** A GeoJSON Feature wrapping a transit stop point. */
interface TransitStopFeature {
  type: 'Feature';
  geometry: PointGeometry;
  properties: TransitStopFeatureProperties;
}

/**
 * Properties attached to each road segment GeoJSON feature.
 * Used by MapLibre Data-Driven Styling expressions (e.g., `['get', 'hierarchy']`).
 */
export interface RoadFeatureProperties {
  /** The segment's unique CS1 identifier. */
  id: string;
  /** The item class from CS1 (e.g. "Large Road", "Highway"). Used for color mapping. */
  itemClass: string;
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
}

/**
 * Properties attached to each building GeoJSON feature.
 */
export interface BuildingFeatureProperties {
  /** The building's unique CS1 identifier. */
  id: string;
  /** The original asset class from the game. */
  itemClass: string;
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
 * Properties attached to each transit stop GeoJSON feature.
 */
export interface TransitStopFeatureProperties {
  /** The stop's unique CS1 identifier. */
  id: string;
  /** Transportation mode (Bus, Tram, Train, etc.). */
  mode: string;
  /** Hexadecimal color string of the first transit line that services this stop. */
  color: string;
}

/** A GeoJSON FeatureCollection of transit stop points. */
export interface TransitStopsFeatureCollection {
  type: 'FeatureCollection';
  features: TransitStopFeature[];
}

// ─── Road tier / width model ──────────────────────────────────────────────────

type RoadTier =
  | 'highway'
  | 'railway'
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
  highway: { fixed: 2.5, scaled: 2 },
  railway: { fixed: 1.2, scaled: 0.2 },
  largeArterial: { fixed: 4, scaled: 1 },
  mediumArterial: { fixed: 4, scaled: 0.8 },
  local: { fixed: 2, scaled: 0.5 },
  gravel: { fixed: 1.5, scaled: 0.4 },
  pedestrian: { fixed: 1.5, scaled: 0.3 },
  pedestrianWay: { fixed: 1, scaled: 0.2 },
};

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

// Water tile threshold above which we use the bounding-box approximation.
const WATER_TILE_BBOX_THRESHOLD = 50_000;

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

/**
 * Builds a GeoJSON FeatureCollection of transit lines from parsed `CityData`.
 *
 * @remarks
 * Each `TransitLine` becomes one or more `LineString` features by reconstructing
 * geometry from its `route: PathSegment[]` via the road segment graph.
 * Properties include `id`, `color` (CSS hex from .cslmap), and `mode`.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildTransitGeoJson(
  cityData: CityData,
): TransitFeatureCollection {
  const nodeById = new Map<string, RoadNode>(
    cityData.roadNodes.map((n) => [n.id, n]),
  );
  const segById = new Map(cityData.roadSegments.map((s) => [s.id, s]));

  const features: TransitFeature[] = [];

  for (const line of cityData.transitLines) {
    for (const pathSeg of line.route) {
      for (const segId of pathSeg.segmentIds) {
        const seg = segById.get(segId);
        if (seg === undefined) continue;

        const startNode = nodeById.get(seg.startNodeId);
        const endNode = nodeById.get(seg.endNodeId);
        if (startNode === undefined || endNode === undefined) continue;

        // One Feature per road segment: avoids diagonal artifacts that appear when
        // consecutive segments share no common node and coords are merged into one LineString.
        const coords: [number, number][] = [
          csToGeoArray(startNode.position),
          ...seg.points.map((p) => csToGeoArray(p)),
          csToGeoArray(endNode.position),
        ];

        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { id: line.id, color: line.color, mode: line.mode },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
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

    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: { id: building.id, itemClass: building.itemClass },
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
 * Builds a GeoJSON FeatureCollection of water polygons.
 *
 * @remarks
 * Renders both ocean/sea tiles (`waterTiles`, elevation ≤ sea level) and inland water
 * tiles (`landTiles` where `resolution > SEA_LEVEL_DEFAULT` — rivers and lakes).
 *
 * If combined count < 50 000: each tile becomes a small square polygon sized to one
 * grid cell (world extent / 1081 columns).
 * If combined count ≥ 50 000: returns a single bounding-box polygon derived from
 * `cityData.bounds` as a performance approximation.
 *
 * Polygon corner order is CCW (geographic exterior ring) consistent with the south-up
 * rendering convention used by this renderer (see `CS1_LAT_SIGN` in coordinate-transform).
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildWaterGeoJson(cityData: CityData): WaterFeatureCollection {
  const { waterTiles, landTiles, bounds } = cityData;

  const inlandTiles = landTiles.filter((t) => t.resolution > SEA_LEVEL_DEFAULT);
  const totalCount = waterTiles.length + inlandTiles.length;

  if (totalCount === 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  if (totalCount >= WATER_TILE_BBOX_THRESHOLD) {
    // Bounding-box approximation for large cities.
    // South-up CCW ring: SW(minX, minZ) → SE(maxX, minZ) → NE(maxX, maxZ) → NW(minX, maxZ)
    const sw = csToGeoArray({ x: bounds.minX, z: bounds.minZ });
    const se = csToGeoArray({ x: bounds.maxX, z: bounds.minZ });
    const ne = csToGeoArray({ x: bounds.maxX, z: bounds.maxZ });
    const nw = csToGeoArray({ x: bounds.minX, z: bounds.maxZ });
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

  // One square polygon per tile — cell size = world extent / 1081 grid columns.
  // South-up CCW ring: SW(x-h, z-h) → SE(x+h, z-h) → NE(x+h, z+h) → NW(x-h, z+h)
  const cellSize = CS1_WORLD_SIZE / 1081;
  const halfCell = cellSize / 2;

  function makeTilePolygon(tile: { x: number; z: number }): WaterFeature {
    const sw = csToGeoArray({ x: tile.x - halfCell, z: tile.z - halfCell });
    const se = csToGeoArray({ x: tile.x + halfCell, z: tile.z - halfCell });
    const ne = csToGeoArray({ x: tile.x + halfCell, z: tile.z + halfCell });
    const nw = csToGeoArray({ x: tile.x - halfCell, z: tile.z + halfCell });
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[sw, se, ne, nw, sw]] },
      properties: {},
    };
  }

  const features: WaterFeature[] = [
    ...(waterTiles as WaterTile[]).map(makeTilePolygon),
    ...inlandTiles.map(makeTilePolygon),
  ];

  return { type: 'FeatureCollection', features };
}

/**
 * Builds a GeoJSON FeatureCollection of transit stop points.
 *
 * @remarks
 * Each unique stop (deduplicated by `id`) becomes a `Point` feature. When a stop
 * is served by multiple lines, the color of the first line encountered is used.
 * Rendered as circles in MapLibre; shape-per-mode differentiation is deferred to a
 * later story using symbol layers.
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildTransitStopsGeoJson(
  cityData: CityData,
): TransitStopsFeatureCollection {
  const seen = new Set<string>();
  const features: TransitStopFeature[] = [];

  for (const line of cityData.transitLines) {
    for (const stop of line.stops) {
      if (seen.has(stop.id)) continue;
      seen.add(stop.id);
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: csToGeoArray(stop.position),
        },
        properties: { id: stop.id, mode: stop.mode, color: line.color },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}
