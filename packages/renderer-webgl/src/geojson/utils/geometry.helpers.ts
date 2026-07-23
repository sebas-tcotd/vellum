/** Shared geometry helpers for the terrain and transit builders. */

import type { TerrainPolygon } from '@vellum/core';
import type { PolygonGeometry } from '../types';

/** Converts a `TerrainPolygon` (already in WGS-84) to a GeoJSON Polygon geometry. */
export function terrainPolygonToGeometry(
  poly: TerrainPolygon,
): PolygonGeometry {
  return {
    type: 'Polygon',
    coordinates: [poly.exterior, ...poly.holes],
  };
}

/** Centroid of a station capsule ring (excluding the repeated closing vertex). */
export function calculatePolygonCentroid(ring: { x: number; z: number }[]): {
  x: number;
  z: number;
} {
  const cx = ring.reduce((sum, p) => sum + p.x, 0) / ring.length;
  const cz = ring.reduce((sum, p) => sum + p.z, 0) / ring.length;
  return { x: cx, z: cz };
}
