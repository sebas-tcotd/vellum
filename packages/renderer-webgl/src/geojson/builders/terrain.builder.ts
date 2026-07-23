/** Terrain vectorized polygon and isoline GeoJSON construction. */

import type { CityData } from '@vellum/core';
import type {
  ContourLineCollection,
  LandPolygonFeatureCollection,
} from '../types';
import { terrainPolygonToGeometry } from '../utils/geometry.helpers';

/**
 * Builds a GeoJSON FeatureCollection from `cityData.landPolygon`.
 *
 * @remarks
 * The coordinates are already in WGS-84 `[lng, lat]` — no conversion needed.
 * The Rust parser emits `{ type: 'land' }` as the semantic property.
 */
export function buildLandPolygonGeoJson(
  cityData: CityData,
): LandPolygonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cityData.landPolygon.map((poly) => ({
      type: 'Feature',
      geometry: terrainPolygonToGeometry(poly),
      properties: { type: 'land' },
    })),
  };
}

/**
 * Builds a GeoJSON FeatureCollection from `cityData.contourLines`.
 *
 * @remarks
 * Each isoline's `elevation` becomes a shared feature property. Coordinates
 * are already in WGS-84 — no conversion needed.
 */
export function buildContourLinesGeoJson(
  cityData: CityData,
): ContourLineCollection {
  const features = cityData.contourLines.flatMap((isoline) =>
    isoline.lines.map((lineCoords) => ({
      type: 'Feature' as const,
      properties: { elevation: isoline.elevation },
      geometry: { type: 'LineString' as const, coordinates: lineCoords },
    })),
  );
  return { type: 'FeatureCollection', features };
}

/**
 * Builds a GeoJSON FeatureCollection from `cityData.coastline`.
 *
 * @remarks
 * The coastline isoline is extracted directly from the land polygon rings,
 * so its geometry is guaranteed to be pixel-perfect aligned with `landPolygon`.
 * Coordinates are already in WGS-84 — no conversion needed.
 */
export function buildCoastlineGeoJson(
  cityData: CityData,
): ContourLineCollection {
  return {
    type: 'FeatureCollection',
    features: cityData.coastline.lines.map((lineCoords) => ({
      type: 'Feature',
      properties: { elevation: cityData.coastline.elevation },
      geometry: { type: 'LineString', coordinates: lineCoords },
    })),
  };
}
