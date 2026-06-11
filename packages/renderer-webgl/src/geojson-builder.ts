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
  CityData,
  RoadNode,
  RoadSegment,
  TerrainPolygon,
  TransitMode,
  WayType,
} from '@vellum/core';
import { csToGeoArray, CS1_WORLD_HALF } from './coordinate-transform';

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
   * Decreasing-width multiplier for MapLibre stacked-band rendering.
   * Among N lines sharing a segment, the first (background) gets N and the
   * last (foreground) gets 1.  Paint: `lineWidthMultiplier × baseWidth(zoom)`.
   * Features must be sorted descending by this value so wide strokes are drawn
   * before narrow ones, producing equal-width visible colour bands.
   */
  lineWidthMultiplier: number;
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
  /** The stop's unique CS1 identifier (road node ID). */
  id: string;
  /** Transportation mode (Bus, Tram, Train, etc.) — used for circle styling. */
  mode: string;
  /** Hexadecimal color string of the first transit line (used for circle fill). */
  color: string;
  /**
   * JSON-encoded array of all lines serving this stop.
   * Parsed in hover callbacks to display multi-line tooltips.
   * Note: stop names are not available in the .cslmap format.
   * Format: Array<{ name: string; color: string; mode: string }>
   */
  lines: string;
}

/** A GeoJSON FeatureCollection of transit stop points. */
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
  highway: { fixed: 0.3, scaled: 3.0 },
  railway: { fixed: 0.3, scaled: 1.2 },
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

// ─── LOOM-style greedy ordering ──────────────────────────────────────────────

// Priority order for transit modes when assigning parallel offsets.
// Lower value = closer to centre of the bundle (higher visual priority).
const MODE_PRIORITY: Record<TransitMode, number> = {
  Metro: 0,
  Train: 1,
  Monorail: 2,
  Tram: 3,
  Trolleybus: 4,
  CableCar: 5,
  Ferry: 6,
  Blimp: 7,
  Bus: 8,
  Unknown: 9,
};

/**
 * When looking at a segment from `nodeId`, returns true if the canonical
 * ordering (position 0 = leftmost in canonical direction) must be reversed.
 * Canonical direction: smaller nodeId → larger nodeId.
 */
function isReversedFromNode(seg: RoadSegment, nodeId: string): boolean {
  const canonicalStart =
    seg.startNodeId < seg.endNodeId ? seg.startNodeId : seg.endNodeId;
  return nodeId !== canonicalStart;
}

/**
 * LOOM `smallerThanAt`: asks "should l1 come before l2 in this segment's
 * ordering?" by consulting already-settled adjacent segments at `nodeId`.
 * Returns `before=null` when there is no evidence.
 */
function smallerThanAtNode(
  l1Id: string,
  l2Id: string,
  nodeId: string,
  orderConfig: Map<string, string[]>,
  nodeSegIds: Map<string, string[]>,
  segById: Map<string, RoadSegment>,
  segLineIds: Map<string, string[]>,
): { before: boolean | null; evidence: number } {
  const positionsL1: number[] = [];
  const positionsL2: number[] = [];
  let offset = 0;

  for (const adjSegId of nodeSegIds.get(nodeId) ?? []) {
    const cardinality = (segLineIds.get(adjSegId) ?? []).length;
    const order = orderConfig.get(adjSegId);
    if (order !== undefined) {
      const idxL1 = order.indexOf(l1Id);
      const idxL2 = order.indexOf(l2Id);
      if (idxL1 !== -1 && idxL2 !== -1) {
        const adjSeg = segById.get(adjSegId);
        if (adjSeg !== undefined) {
          const rev = isReversedFromNode(adjSeg, nodeId);
          const n = order.length;
          positionsL1.push(offset + (rev ? n - 1 - idxL1 : idxL1));
          positionsL2.push(offset + (rev ? n - 1 - idxL2 : idxL2));
        }
      }
    }
    offset += cardinality;
  }

  if (positionsL1.length === 0) return { before: null, evidence: 0 };

  const maxL1 = Math.max(...positionsL1);
  const minL1 = Math.min(...positionsL1);
  const maxL2 = Math.max(...positionsL2);
  const minL2 = Math.min(...positionsL2);

  if (maxL1 < minL2) return { before: true, evidence: positionsL1.length };
  if (minL1 > maxL2) return { before: false, evidence: positionsL1.length };
  return { before: null, evidence: 0 };
}

/**
 * LOOM-style greedy ordering. Propagates ordering decisions from settled
 * segments to their neighbours, minimising visual line crossings at nodes.
 * Falls back to mode-priority + ID sort when there is no settled evidence.
 *
 * @returns OrderConfig — `segId → lineIds[]` in left-to-right display order.
 */
function computeGreedyOrder(
  segLineIds: Map<string, string[]>,
  nodeSegIds: Map<string, string[]>,
  segById: Map<string, RoadSegment>,
  lineMode: Map<string, TransitMode>,
): Map<string, string[]> {
  const orderConfig = new Map<string, string[]>();
  const settled = new Set<string>();

  const modeIdCmp = (a: string, b: string): number => {
    const pa = MODE_PRIORITY[lineMode.get(a) ?? 'Unknown'];
    const pb = MODE_PRIORITY[lineMode.get(b) ?? 'Unknown'];
    return pa !== pb ? pa - pb : a.localeCompare(b);
  };

  const remaining = new Set(segLineIds.keys());

  while (remaining.size > 0) {
    // Pick: adjacent-to-settled first, then highest cardinality, then id
    let bestId: string | null = null;
    let bestIsAdj = false;
    let bestCard = -1;

    for (const segId of remaining) {
      const seg = segById.get(segId);
      if (seg === undefined) continue;
      const card = (segLineIds.get(segId) ?? []).length;
      const isAdj =
        (nodeSegIds.get(seg.startNodeId) ?? []).some((s) => settled.has(s)) ||
        (nodeSegIds.get(seg.endNodeId) ?? []).some((s) => settled.has(s));

      if (
        bestId === null ||
        (!bestIsAdj && isAdj) ||
        (bestIsAdj === isAdj && card > bestCard)
      ) {
        bestId = segId;
        bestIsAdj = isAdj;
        bestCard = card;
      }
    }

    if (bestId === null) break;
    remaining.delete(bestId);

    const lineIds = segLineIds.get(bestId) ?? [];
    if (lineIds.length <= 1) {
      orderConfig.set(bestId, [...lineIds]);
      settled.add(bestId);
      continue;
    }

    const seg = segById.get(bestId);
    if (seg === undefined) {
      orderConfig.set(bestId, [...lineIds].sort(modeIdCmp));
      settled.add(bestId);
      continue;
    }

    // For each ordered pair, gather votes from both endpoints; prefer the
    // endpoint with more settled neighbours (higher evidence count).
    const pairBefore = new Map<string, boolean | null>();
    for (const l1 of lineIds) {
      for (const l2 of lineIds) {
        if (l1 === l2) continue;
        const fromV = smallerThanAtNode(
          l1,
          l2,
          seg.startNodeId,
          orderConfig,
          nodeSegIds,
          segById,
          segLineIds,
        );
        const toV = smallerThanAtNode(
          l1,
          l2,
          seg.endNodeId,
          orderConfig,
          nodeSegIds,
          segById,
          segLineIds,
        );
        const winner = fromV.evidence >= toV.evidence ? fromV : toV;
        pairBefore.set(`${l1}\0${l2}`, winner.before);
      }
    }

    const sorted = [...lineIds].sort((a, b) => {
      const vote = pairBefore.get(`${a}\0${b}`);
      if (vote === true) return -1;
      if (vote === false) return 1;
      return modeIdCmp(a, b);
    });

    orderConfig.set(bestId, sorted);
    settled.add(bestId);
  }

  return orderConfig;
}

/**
 * Builds a GeoJSON FeatureCollection of transit lines from parsed `CityData`.
 *
 * @remarks
 * Each `TransitLine` becomes one `LineString` feature **per road segment** it
 * traverses. When multiple lines share the same road segment, their coordinates
 * are pre-displaced in **geographic space** (WGS-84 degrees) perpendicular to
 * the segment's actual direction, using:
 *
 * ```
 * displacement = offsetMultiplier × spacingDeg × perpUnitVector
 * ```
 *
 * where `perpUnitVector` is the 90°-clockwise rotation of the segment's
 * stacking approach: the N lines sharing a segment are assigned decreasing
 * `lineWidthMultiplier` values (N … 1). Each is painted at `multiplier × baseWidth`
 * pixels, so they are drawn widest-first (background) to narrowest-last (foreground),
 * producing equal-width visible colour bands — identical to CSLMapView's SVG technique.
 * No perpendicular coordinate displacement is applied, so curves look clean.
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

  // ── Step 1: collect unique line IDs per road segment ─────────────────────
  // segmentId → ordered, deduplicated list of line IDs sharing that segment.
  const segLineIds = new Map<string, string[]>();
  const lineMode = new Map<string, TransitMode>();

  for (const line of cityData.transitLines) {
    lineMode.set(line.id, line.mode);
    for (const pathSeg of line.route) {
      for (const segId of pathSeg.segmentIds) {
        let ids = segLineIds.get(segId);
        if (ids === undefined) {
          ids = [];
          segLineIds.set(segId, ids);
        }
        if (!ids.includes(line.id)) ids.push(line.id);
      }
    }
  }

  // ── Step 1b: node → transit-segment adjacency (needed by greedy ordering) ──
  const nodeSegIds = new Map<string, string[]>();
  for (const segId of segLineIds.keys()) {
    const seg = segById.get(segId);
    if (seg === undefined) continue;
    for (const nodeId of [seg.startNodeId, seg.endNodeId]) {
      let bucket = nodeSegIds.get(nodeId);
      if (bucket === undefined) {
        bucket = [];
        nodeSegIds.set(nodeId, bucket);
      }
      bucket.push(segId);
    }
  }

  // ── Step 2: LOOM-style greedy ordering to minimise visual crossings ────────
  const orderConfig = computeGreedyOrder(
    segLineIds,
    nodeSegIds,
    segById,
    lineMode,
  );

  // ── Step 3: emit one Feature per (line × road-segment) ───────────────────
  const features: TransitFeature[] = [];

  for (const line of cityData.transitLines) {
    for (const pathSeg of line.route) {
      for (const segId of pathSeg.segmentIds) {
        const seg = segById.get(segId);
        if (seg === undefined) continue;

        const startNode = nodeById.get(seg.startNodeId);
        const endNode = nodeById.get(seg.endNodeId);
        if (startNode === undefined || endNode === undefined) continue;

        // Canonicalize direction: always emit coords from the lexicographically-smaller
        // nodeId to the larger. This guarantees that every transit feature for the same
        // road segment points in the same direction, so a consistent offsetMultiplier
        // always lands on the same physical side of the road — even when the game stores
        // adjacent segments in opposite directions along the same corridor.
        const isCanonical = seg.startNodeId <= seg.endNodeId;
        const coords: [number, number][] = isCanonical
          ? [
              csToGeoArray(startNode.position),
              ...seg.points.map((p) => csToGeoArray(p)),
              csToGeoArray(endNode.position),
            ]
          : [
              csToGeoArray(endNode.position),
              ...[...seg.points].reverse().map((p) => csToGeoArray(p)),
              csToGeoArray(startNode.position),
            ];

        const ids = orderConfig.get(segId) ?? [line.id];
        const n = ids.length;
        const i = ids.indexOf(line.id);
        // Background route (rank 0) gets the widest stroke (n); foreground (rank n-1) gets 1.
        const lineWidthMultiplier = n - i;

        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {
            id: line.id,
            color: line.color,
            mode: line.mode,
            lineWidthMultiplier,
          },
        });
      }
    }
  }

  // Sort widest-first so MapLibre draws background strokes before foreground ones,
  // producing equal-width visible colour bands via the painter's algorithm.
  features.sort(
    (a, b) =>
      b.properties.lineWidthMultiplier - a.properties.lineWidthMultiplier,
  );

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
  interface StopAccumulator {
    stop: (typeof cityData.transitLines)[number]['stops'][number];
    lines: Array<{ name: string; color: string; mode: string }>;
  }
  const stopMap = new Map<string, StopAccumulator>();

  for (const line of cityData.transitLines) {
    const lineEntry = { name: line.name, color: line.color, mode: line.mode };
    // Deduplicate stops within the same line to handle circular routes where
    // the terminal stop appears at both the start and end of line.stops.
    const seenInLine = new Set<string>();
    for (const stop of line.stops) {
      if (seenInLine.has(stop.id)) continue;
      seenInLine.add(stop.id);
      if (!stopMap.has(stop.id)) {
        stopMap.set(stop.id, { stop, lines: [] });
      }
      stopMap.get(stop.id)!.lines.push(lineEntry);
    }
  }

  const features: TransitStopFeature[] = [];
  for (const { stop, lines } of stopMap.values()) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: csToGeoArray(stop.position),
      },
      properties: {
        id: stop.id,
        mode: stop.mode,
        color: lines[0].color,
        lines: JSON.stringify(lines),
      },
    });
  }

  return { type: 'FeatureCollection', features };
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
