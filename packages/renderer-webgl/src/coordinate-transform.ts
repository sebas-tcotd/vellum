/**
 * Equatorial coordinate transform: CS1 world space → geographic WGS-84.
 *
 * @remarks
 * Cities: Skylines uses a flat Euclidean coordinate system (±8640 units on X and Z).
 * MapLibre GL JS requires geographic coordinates (longitude / latitude, WGS-84).
 *
 * **The equatorial trick:** We map the CS1 bounding box to a fictitious geographic extent
 * centred exactly on the equator [0°, 0°]. At latitude = 0°, the Web Mercator scale factor
 * is exactly 1.0, so there is zero Mercator distortion regardless of the longitude extent
 * chosen. This gives us pixel-perfect proportional rendering inside MapLibre.
 *
 * **⚠ Rendering orientation — read carefully:**
 * In CS1, the Z-axis grows *southward* (positive Z = south).
 * `CS1_LAT_SIGN` controls how Z maps to latitude:
 *   - `+1` (default, **south-up**): positive Z → positive lat → CS1 south appears at the top
 *     of the rendered map. Matches the existing Canvas renderer orientation.
 *   - `-1` (**north-up**, geographic convention): positive Z → negative lat → CS1 south at
 *     the bottom. To switch, flip `CS1_LAT_SIGN` and swap the Z values used in bounding-box
 *     polygon corners and `fitToCityBounds`.
 *
 * **GeoJSON coordinate order:** [longitude, latitude] (per RFC 7946 §3.1.1).
 * MapLibre follows this convention. Use `csToGeoArray` when building GeoJSON geometries.
 *
 * **Scale convention:** 1 CS1 world unit is treated as 1 metre for the purposes of this
 * mapping. This is an arbitrary but consistent convention — CS1 has no official real-world
 * scale. What matters is internal consistency, not physical accuracy.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Controls the north-south rendering orientation of the map.
 *
 * `+1` = **south-up** (default): CS1 positive-Z / south appears at the top of the rendered
 * map. Matches the existing Canvas renderer so both renderers show the same orientation.
 *
 * `-1` = **north-up** (geographic convention): flip this to `-1` *and* swap the Z arguments
 * in `buildWorldExtentGeoJson` bounding-box corners and `MapLibreRenderer.fitToCityBounds` to
 * switch the entire renderer to north-up.
 */
export const CS1_LAT_SIGN = 1;

/**
 * Half the total world extent along a single axis, in CS1 world units.
 * CS1 maps span ±8640 units on both X and Z axes.
 */
export const CS1_WORLD_HALF = 8640;

/**
 * Total world span along one axis, in CS1 world units (17280 × 17280 total).
 */
export const CS1_WORLD_SIZE = CS1_WORLD_HALF * 2;

/**
 * The total geographic extent of the CS1 world box, in decimal degrees.
 * Derived by treating 1 CS1 unit = 1 metre, using the equatorial degree length
 * (1° ≈ 111,195 m at latitude 0°).
 *
 * `17280 m / 111 195 m·deg⁻¹ ≈ 0.15541°`
 */
export const CS1_EXTENT_DEG = CS1_WORLD_SIZE / 111_195;

/**
 * Half the geographic extent — used as the bounding radius from the origin [0°, 0°].
 * `≈ 0.07770°`
 */
export const CS1_HALF_EXTENT_DEG = CS1_EXTENT_DEG / 2;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A geographic coordinate in WGS-84 decimal degrees.
 */
export interface GeoPoint {
  /** Longitude (east-west). Positive = east. Corresponds to CS1 `worldX`. */
  lng: number;
  /**
   * Latitude (north-south). Positive = north.
   * **Inverted** relative to CS1 `worldZ` (where positive Z = south).
   */
  lat: number;
}

/**
 * A point in the flat Euclidean world space of Cities: Skylines.
 */
export interface CsPoint {
  /** East-west coordinate. Range: [-8640, +8640]. */
  x: number;
  /**
   * North-south coordinate. Positive = **south** (inverted vs geographic latitude).
   * Range: [-8640, +8640].
   */
  z: number;
}

// ─── Transform functions ──────────────────────────────────────────────────────

/**
 * Converts a CS1 world-space point to WGS-84 geographic coordinates.
 *
 * @param point - A `{x, z}` position in CS1 world units.
 * @returns The equivalent `{lng, lat}` geographic coordinate centred on the equator.
 *
 * @example
 * csToGeo({ x: 0, z: 0 })          // → { lng: 0, lat: 0 }  — map centre
 * csToGeo({ x: 8640, z: 0 })       // → { lng: +CS1_HALF_EXTENT_DEG, lat: 0 }
 * csToGeo({ x: 0, z: 8640 })       // → { lng: 0, lat: -CS1_HALF_EXTENT_DEG }  ← south
 */
export function csToGeo(point: CsPoint): GeoPoint {
  return {
    lng: (point.x / CS1_WORLD_HALF) * CS1_HALF_EXTENT_DEG,
    // CS1_LAT_SIGN controls orientation: +1 = south-up (matches Canvas), -1 = north-up (geographic).
    lat: CS1_LAT_SIGN * (point.z / CS1_WORLD_HALF) * CS1_HALF_EXTENT_DEG,
  };
}

/**
 * Converts a WGS-84 geographic coordinate back to CS1 world space.
 * This is the exact inverse of `csToGeo`.
 *
 * @param point - A `{lng, lat}` geographic coordinate.
 * @returns The equivalent `{x, z}` position in CS1 world units.
 */
export function geoToCs(point: GeoPoint): CsPoint {
  return {
    x: (point.lng / CS1_HALF_EXTENT_DEG) * CS1_WORLD_HALF,
    // Exact inverse of csToGeo: same CS1_LAT_SIGN applies symmetrically.
    z: CS1_LAT_SIGN * (point.lat / CS1_HALF_EXTENT_DEG) * CS1_WORLD_HALF,
  };
}

/**
 * Converts a CS1 world-space point to a GeoJSON coordinate pair.
 *
 * @remarks
 * GeoJSON §3.1.1 (RFC 7946) mandates `[longitude, latitude]` order.
 * MapLibre GL JS follows this convention for all geometry coordinates.
 *
 * @param point - A `{x, z}` position in CS1 world units.
 * @returns A `[longitude, latitude]` tuple suitable for GeoJSON geometries.
 */
export function csToGeoArray(point: CsPoint): [number, number] {
  const geo = csToGeo(point);
  return [geo.lng, geo.lat];
}
