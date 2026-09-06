/**
 * Re-export shim: the CS1 world → WGS-84 transform now lives in `@vellum/core`.
 *
 * @remarks
 * The transform is pure arithmetic over CS1 world coordinates and carries no
 * MapLibre dependency, so ADR-0001 moved it to the domain layer where
 * `@vellum/ui` can consume it without importing this adapter. This module
 * stays as a barrel so the adapter's own relative imports keep working and
 * `@vellum/renderer-webgl`'s public surface is unchanged.
 *
 * @see {@link https://github.com/sebas-tcotd/vellum/blob/main/docs/adr/0001-rendering-ownership.md | ADR-0001}
 */
export {
  CS1_EXTENT_DEG,
  CS1_HALF_EXTENT_DEG,
  CS1_LAT_SIGN,
  CS1_WORLD_HALF,
  CS1_WORLD_SIZE,
  csToGeo,
  csToGeoArray,
  geoToCs,
  type CsPoint,
  type GeoPoint,
} from '@vellum/core';
