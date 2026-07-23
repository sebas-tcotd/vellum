/** Road segment GeoJSON construction and tier/width classification. */

import type { CityData, RoadNode, RoadSegment, WayType } from '@vellum/core';
import { csToGeoArray } from '../../coordinate-transform';
import {
  ROAD_WIDTH_STYLES,
  ITEM_CLASS_TIER,
  EXCLUDED_ROAD_CLASSES,
} from '../config/road-classification';
import type {
  RoadFeature,
  RoadTier,
  RoadsFeatureCollection,
} from '../types/roads.types';

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
  const nodeById = createNodeMap(cityData.roadNodes);
  const features: RoadFeature[] = [];

  for (const segment of cityData.roadSegments) {
    const tier = classifyRoadTier(
      segment.itemClass,
      segment.wayType,
      segment.width,
    );

    if (!tier || !isValidSegment(segment, nodeById)) {
      continue;
    }

    features.push(createRoadFeature(segment, tier, nodeById));
  }

  return { type: 'FeatureCollection', features };
}

// ─── Internal Helpers (SLAP & SRP) ──────────────────────────────────────────

function createNodeMap(nodes: RoadNode[]): Map<string, RoadNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

function isValidSegment(
  segment: RoadSegment,
  nodeMap: Map<string, RoadNode>,
): boolean {
  return nodeMap.has(segment.startNodeId) && nodeMap.has(segment.endNodeId);
}

function classifyRoadTier(
  itemClass: string,
  wayType: WayType[],
  width: number,
): RoadTier | null {
  if (EXCLUDED_ROAD_CLASSES.has(itemClass)) return null;
  if (ITEM_CLASS_TIER[itemClass]) return ITEM_CLASS_TIER[itemClass];

  if (wayType.includes('Highway')) return 'highway';
  if (wayType.includes('Pedestrian')) return 'pedestrianWay';

  if (width >= 28) return 'largeArterial';
  if (width >= 14) return 'local';

  return 'pedestrianWay';
}

function createRoadFeature(
  segment: RoadSegment,
  tier: RoadTier,
  nodeMap: Map<string, RoadNode>,
): RoadFeature {
  const startNode = nodeMap.get(segment.startNodeId)!;
  const endNode = nodeMap.get(segment.endNodeId)!;

  const coordinates: [number, number][] = [
    csToGeoArray(startNode.position),
    ...segment.points.map(csToGeoArray),
    csToGeoArray(endNode.position),
  ];

  const { fixed, scaled } = ROAD_WIDTH_STYLES[tier];

  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
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
  };
}
