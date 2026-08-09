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
import { demPadElevation, demRampFloor } from '../sources/dem-protocol';
import type { ResolvedColors } from '../style-adapter';
import { adjustLightness, mixColorTokens } from './color-mix';

/** Smallest ramp domain accepted, in raw units, so a flat map never yields a zero-width interpolation. */
const MIN_DOMAIN_RAW = 64;

/**
 * Fraction each contour anchor is pulled toward black or white before it is
 * painted on the interactive map.
 *
 * @remarks
 * Without this, an isoline is *exactly* the same colour as the relief
 * beneath it at that elevation — contrast is 1:1 by construction, because
 * both come from the identical `low → mid → high` ramp. On screen that reads
 * as the contour vanishing into the terrain rather than a visible line; on a
 * flat vector document it reads as fine, since there is no antialiasing
 * blending the two together the way the GPU does.
 *
 * 30% is a starting point tuned by eye against `altavento.cslmap`; adjust
 * here if a particular theme still reads too faint or too heavy.
 */
const CONTOUR_LIGHTEN_DARKEN_RATIO = 0.3;

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
    // user zooms out. No real cell sits between this stop and `min`. Both this stop and
    // the padding colour come from the same helpers so they cannot disagree — see
    // `demRampFloor`.
    demPadElevation(dem.elevMin),
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
 * Driven by each isoline's own `elevation` property instead of the DEM's
 * decoded value, so a contour is painted the colour the relief has *at that
 * altitude* — hypsometric, not a uniform overlay. Colour and position both
 * come from the same measured number and cannot disagree.
 *
 * Each anchor is {@link adjustLightness adjusted} away from the raw relief
 * colour before it goes into the ramp — see
 * {@link CONTOUR_LIGHTEN_DARKEN_RATIO} for why. This only applies to the
 * interactive map; {@link resolveElevationColor}, which the SVG export uses,
 * stays on the unadjusted ramp on purpose.
 *
 * The transparent out-of-map sentinel {@link buildColorReliefRamp} carries is
 * deliberately not reproduced — it exists so the raster relief stops at the
 * world extent, and a line feature has no such edge to fade at.
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
  const anchor = (color: string): string =>
    adjustLightness(color, CONTOUR_LIGHTEN_DARKEN_RATIO);
  return [
    'interpolate',
    ['linear'],
    ['get', 'elevation'],
    min,
    anchor(terrain.low),
    mid,
    anchor(terrain.mid),
    max,
    anchor(terrain.high),
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
  // Floored so the transparent out-of-map sentinel one unit below always stays inside
  // the encodable (unsigned) range — see `demRampFloor`.
  const min = demRampFloor(dem.elevMin);
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
 * **Intentionally on the raw, unadjusted ramp** — unlike
 * {@link buildContourColorRamp}, which darkens or lightens each anchor for
 * the interactive map. A contour matching its terrain colour exactly is
 * correct here: it is the GPU's antialiased blending between the relief
 * raster and the line that erases it on screen, and a flat vector document
 * has no such blending to correct for.
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
