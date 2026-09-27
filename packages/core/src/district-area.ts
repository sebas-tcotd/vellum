import type { TerrainPolygon } from './types/city-data';

/** Metres per degree near the equator, on both axes (see `coordinate-transform`). */
const METRES_PER_DEGREE = 111_195;

/** Shoelace area of a `[lng, lat]` ring, in square degrees (signed). */
function ringArea(ring: readonly (readonly number[])[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j]![0]! * ring[i]![1]! - ring[i]![0]! * ring[j]![1]!;
  }
  return sum / 2;
}

/**
 * Area of a district's boundary, in km², with its holes subtracted.
 *
 * @param boundary - The district's WGS-84 polygons; absent for `.cslmap`.
 * @returns The area in km², or `undefined` when there is no boundary to measure.
 */
export function districtAreaKm2(
  boundary: readonly TerrainPolygon[] | undefined,
): number | undefined {
  if (!boundary || boundary.length === 0) return undefined;
  let deg2 = 0;
  for (const polygon of boundary) {
    deg2 += Math.abs(ringArea(polygon.exterior));
    for (const hole of polygon.holes) deg2 -= Math.abs(ringArea(hole));
  }
  const km2 = (deg2 * METRES_PER_DEGREE ** 2) / 1_000_000;
  // A malformed boundary (holes larger than the exterior, non-finite
  // coordinates) must not surface as a negative or NaN area.
  return Number.isFinite(km2) ? Math.max(0, km2) : 0;
}

/** Even-odd ray cast of `[lng, lat]` against one ring. */
function insideRing(
  lng: number,
  lat: number,
  ring: readonly (readonly number[])[],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Whether a WGS-84 point falls inside a district boundary (outside its holes).
 *
 * @param lng - Longitude of the point.
 * @param lat - Latitude of the point.
 * @param boundary - The district's polygons; absent for `.cslmap`.
 * @returns `true` if the point lies inside any polygon of the boundary.
 */
export function isPointInBoundary(
  lng: number,
  lat: number,
  boundary: readonly TerrainPolygon[] | undefined,
): boolean {
  if (!boundary) return false;
  return boundary.some(
    (polygon) =>
      insideRing(lng, lat, polygon.exterior) &&
      !polygon.holes.some((hole) => insideRing(lng, lat, hole)),
  );
}
