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

import type { CityData, RoadNode } from '@vellum/core';
import { csToGeoArray } from './coordinate-transform';

// ─── GeoJSON primitives (minimal subset — avoids importing @types/geojson) ───

/** A GeoJSON LineString geometry. */
interface LineStringGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

/** A GeoJSON Feature wrapping a road segment. */
interface RoadFeature {
  type: 'Feature';
  geometry: LineStringGeometry;
  properties: RoadFeatureProperties;
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
}

/** A GeoJSON FeatureCollection of road segment LineStrings. */
export interface RoadsFeatureCollection {
  type: 'FeatureCollection';
  features: RoadFeature[];
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
 * The caller is responsible for ensuring that `cityData` has already been
 * filtered by the parser (no Bus Line virtual connectors should be present).
 *
 * @param cityData - The immutable domain model produced by the CS1 parser.
 * @returns A GeoJSON FeatureCollection ready for `map.addSource()` in MapLibre.
 */
export function buildRoadsGeoJson(cityData: CityData): RoadsFeatureCollection {
  // Build a lookup map for O(1) node access
  const nodeById = new Map<string, RoadNode>(
    cityData.roadNodes.map((n) => [n.id, n]),
  );

  const features: RoadFeature[] = [];

  for (const segment of cityData.roadSegments) {
    const startNode = nodeById.get(segment.startNodeId);
    const endNode = nodeById.get(segment.endNodeId);

    // Skip orphaned segments — should not happen with a well-formed parse, but
    // we must not throw here because a missing node is not a fatal error.
    if (startNode === undefined || endNode === undefined) {
      continue;
    }

    const coordinates: [number, number][] = [
      csToGeoArray(startNode.position),
      ...segment.points.map((p) => csToGeoArray(p)),
      csToGeoArray(endNode.position),
    ];

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
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
