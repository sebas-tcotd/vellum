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
  const min = dem.elevMin;
  const max = Math.max(dem.elevMax, min + MIN_DOMAIN_RAW);
  const mid = (min + max) / 2;

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
