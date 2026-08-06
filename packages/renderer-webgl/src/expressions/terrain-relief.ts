/**
 * Hypsometric colour ramp for the `color-relief` terrain layer.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 *
 * This is what finally gives `RenderStyleParams.terrain.{low,mid,high}` a consumer: the
 * elevation gradient used to be baked into a PNG by the Rust parser, which put it out of
 * reach of `applyTheme()`. Expressed as a MapLibre `interpolate` over `['elevation']`,
 * the ramp becomes a plain paint property, so switching themes stays a `setPaintProperty`
 * call and honours the `IRenderer.applyTheme` sub-frame budget.
 *
 * The domain comes from the data, not from `seaLevel`: the parser measures the lowest and
 * highest **dry-land** elevations and ships them in `TerrainDem`. Deriving it from
 * `seaLevel` would be wrong — land and water elevation ranges overlap in real maps.
 *
 * Stops are in raw game units, matching what the shader actually receives — see
 * `DEM_ENCODING` in `sources/dem-protocol.ts`.
 */

import type { TerrainDem } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { DEM_PAD_OFFSET } from '../sources/dem-protocol';
import type { ResolvedColors } from '../style-adapter';
import { mixColorTokens } from './color-mix';

/** Smallest ramp domain accepted, in raw units, so a flat map never yields a zero-width interpolation. */
const MIN_DOMAIN_RAW = 64;

/**
 * Builds the `color-relief-color` ramp for a theme and a city's elevation range.
 *
 * @param terrain - The theme's terrain colours, as resolved by `style-adapter`.
 * @param dem - The city's DEM metadata, supplying the ramp's domain in raw game units.
 * @returns An `interpolate` expression mapping decoded elevation to colour.
 */
export function buildColorReliefRamp(
  terrain: ResolvedColors['terrain'],
  dem: TerrainDem,
): maplibregl.ExpressionSpecification {
  const { min, mid, max } = reliefDomain(dem);

  return [
    'interpolate',
    ['linear'],
    ['elevation'],
    // Everything at or below the out-of-map sentinel is transparent, so the relief stops
    // exactly at the world extent instead of bleeding over the app background when the
    // user zooms out. No real cell sits between this stop and `min`.
    min - DEM_PAD_OFFSET,
    'rgba(0, 0, 0, 0)',
    min,
    terrain.low,
    mid,
    terrain.mid,
    max,
    terrain.high,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/**
 * Builds the contour-line colour ramp for a theme and a city's elevation range.
 *
 * @remarks
 * Same `low → mid → high` ramp as {@link buildColorReliefRamp}, but driven by
 * each isoline's own `elevation` property instead of the DEM's decoded value,
 * so a contour is painted the colour the relief has *at that altitude*. That
 * turns the isolines from a uniform overlay into hypsometric contours: colour
 * and position then come from the same measured number and cannot disagree.
 *
 * The transparent out-of-map sentinel is deliberately not reproduced — it
 * exists so the raster relief stops at the world extent, and a line feature
 * has no such edge to fade at.
 *
 * @param terrain - The theme's terrain colours, as resolved by `style-adapter`.
 * @param dem - The city's DEM metadata, supplying the ramp's domain.
 * @returns An `interpolate` expression mapping an isoline's elevation to colour.
 */
export function buildContourColorRamp(
  terrain: ResolvedColors['terrain'],
  dem: TerrainDem,
): maplibregl.ExpressionSpecification {
  const { min, mid, max } = reliefDomain(dem);
  return [
    'interpolate',
    ['linear'],
    ['get', 'elevation'],
    min,
    terrain.low,
    mid,
    terrain.mid,
    max,
    terrain.high,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/**
 * The ramp's three anchor elevations, in raw game units.
 *
 * @remarks
 * Shared so the GPU expression above and the literal resolver below cannot
 * drift onto different domains — the whole point of colouring an exported
 * contour is that it lands on the colour the map would have painted there.
 */
function reliefDomain(dem: TerrainDem): {
  min: number;
  mid: number;
  max: number;
} {
  const min = dem.elevMin;
  const max = Math.max(dem.elevMax, min + MIN_DOMAIN_RAW);
  return { min, mid: (min + max) / 2, max };
}

/**
 * Resolves one elevation to its hypsometric colour, as a literal.
 *
 * @remarks
 * The same `low → mid → high` linear ramp `buildColorReliefRamp` hands the
 * GPU, evaluated in TypeScript for consumers with no expression engine. A
 * static exporter uses it to tint contour lines by the altitude they actually
 * sit at, so the ramp still comes from the active theme rather than from a
 * hardcoded palette.
 *
 * Elevations outside the measured dry-land range clamp to the nearest anchor;
 * the transparent out-of-map sentinel has no meaning for a line feature and is
 * deliberately not reproduced.
 *
 * @param terrain - The theme's resolved terrain colours.
 * @param dem - The city's DEM metadata, supplying the ramp domain.
 * @param elevation - Elevation in raw game units.
 * @returns A `#rrggbb` colour string.
 */
export function resolveElevationColor(
  terrain: ResolvedColors['terrain'],
  dem: TerrainDem,
  elevation: number,
): string {
  const { min, mid, max } = reliefDomain(dem);
  if (!Number.isFinite(elevation) || elevation <= min) return terrain.low;
  if (elevation >= max) return terrain.high;
  return elevation <= mid
    ? mixColorTokens(terrain.low, terrain.mid, (elevation - min) / (mid - min))
    : mixColorTokens(
        terrain.mid,
        terrain.high,
        (elevation - mid) / (max - mid),
      );
}
