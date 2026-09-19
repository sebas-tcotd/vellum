/**
 * Domain of the hypsometric colour-relief ramp, in raw `.cslmap` elevation units.
 *
 * @remarks
 * Single source of truth for where `terrain.low`, `terrain.mid` and
 * `terrain.high` sit. The renderer's `color-relief` and contour ramps read it,
 * and so does the export marginalia's elevation legend, so the legend's stops
 * and range labels are the map's own — not an evenly spread approximation.
 * Pure arithmetic over `TerrainDem`; lives in core so both can reach it
 * (ADR-0001).
 */

import type { TerrainDem } from '../types/city-data';

/**
 * Raw `.cslmap` elevation units per metre — mirrors `ELEVATION_UNITS_PER_METER` in Rust.
 *
 * Exported because anything reasoning about *slope* rather than altitude has to divide
 * by it: MapLibre computes hillshade gradients against real-world tile spacing, so a DEM
 * carrying raw units reads 64× too steep.
 */
export const ELEVATION_UNITS_PER_METER = 64;

/**
 * How far below the lowest land elevation the out-of-map padding sits, in raw units.
 *
 * @remarks
 * Tiles overlap the map edge, so the area outside the world extent has to be filled with
 * *something* — and whatever that is, `color-relief` will paint it. Filling with the
 * lowest land elevation made the terrain colour bleed past the map and over the app
 * background at low zoom.
 *
 * The fix is a sentinel the ramp can key a fully transparent stop on. One raw unit
 * (1.56 cm) is enough to be distinguishable while leaving no cliff for the hillshade to
 * catch: no real cell ever falls between this value and `elevMin`, because water cells
 * are clamped to `elevMin` and land starts there by definition.
 */
export const DEM_PAD_OFFSET = 1;

/**
 * Lowest elevation the hypsometric ramp is allowed to start at, in raw units.
 *
 * @remarks
 * The sentinel lives one unit *below* the ramp floor, so the floor has to leave room for
 * it inside the encodable range — raw values are unsigned, and `packElevation` clamps at
 * zero. A city whose `elevMin` is 0 therefore packs its padding as elevation 0, which is
 * the ramp's `terrain.low` stop rather than the transparent sentinel, and the terrain
 * colour floods the whole viewport outside the map extent.
 *
 * That is not hypothetical: `san-rico`, `springvalley` and `atlantic-keys` all report
 * `elevMin = 0`, produced by a few dozen degenerate cells (both `elev` and `res` zero —
 * no data rather than land at absolute zero) among half a million. Every fixture in the
 * repo happens to have `elevMin > 0`, which is why the sentinel worked there and this
 * went unnoticed.
 *
 * Lifting the floor to 1 raw unit (1.56 cm) costs nothing visually and makes the sentinel
 * representable for any city.
 */
export const DEM_RAMP_FLOOR = DEM_PAD_OFFSET;

/**
 * The ramp's `terrain.low` anchor for a city, in raw units.
 *
 * @remarks
 * Single source of truth for the floor: `registerDemProtocol` derives the padding colour
 * from it and `buildColorReliefRamp` derives the transparent stop from it. The bug this
 * guards against is precisely the two sides disagreeing — the ramp asked for a stop at
 * `elevMin - 1` while the padding could only encode `max(0, elevMin - 1)`.
 */
export function demRampFloor(elevMin: number): number {
  return Math.max(elevMin, DEM_RAMP_FLOOR);
}

/** The out-of-map sentinel elevation for a city, in raw units. Always encodable. */
export function demPadElevation(elevMin: number): number {
  return demRampFloor(elevMin) - DEM_PAD_OFFSET;
}

/** Smallest ramp domain accepted, in raw units, so a flat map never yields a zero-width interpolation. */
export const MIN_RELIEF_DOMAIN_RAW = 64;

/** Anchors of the hypsometric ramp, in raw units. */
export interface ReliefDomain {
  /** `terrain.low` anchor — the floored lowest dry-land elevation. */
  readonly min: number;
  /** `terrain.mid` anchor. */
  readonly mid: number;
  /** `terrain.high` anchor. */
  readonly max: number;
}

/**
 * Resolves the ramp anchors for a city's DEM.
 *
 * @param dem - The city's DEM metadata.
 * @returns Where `low`, `mid` and `high` sit, in raw units.
 */
export function reliefDomain(
  dem: Pick<TerrainDem, 'elevMin' | 'elevMax'>,
): ReliefDomain {
  // Floored so the transparent out-of-map sentinel one unit below always stays inside
  // the encodable (unsigned) range — see `demRampFloor`.
  const min = demRampFloor(dem.elevMin);
  const max = Math.max(dem.elevMax, min + MIN_RELIEF_DOMAIN_RAW);
  return { min, mid: (min + max) / 2, max };
}
