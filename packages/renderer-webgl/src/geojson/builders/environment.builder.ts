/** Forest cell, district label, and water-backdrop GeoJSON construction. */

import type { CityData } from '@vellum/core';
import { CS1_WORLD_HALF, csToGeoArray } from '../../coordinate-transform';
import type {
  DistrictFeature,
  DistrictsFeatureCollection,
  ForestFeature,
  ForestsFeatureCollection,
  WaterFeatureCollection,
} from '../types';

/** Builds a GeoJSON FeatureCollection of forest cell points. */
export function buildForestsGeoJson(
  cityData: CityData,
): ForestsFeatureCollection {
  const features: ForestFeature[] = cityData.forestCells.map((cell) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: csToGeoArray({ x: cell.x, z: cell.z }),
    },
    properties: { density: cell.density },
  }));
  return { type: 'FeatureCollection', features };
}

/**
 * Builds a GeoJSON FeatureCollection of district label points.
 *
 * @remarks
 * `.cslmap` only exports a single position per district (no polygon boundary).
 * Each district is rendered as a `Point` labelled with `name`.
 */
export function buildDistrictsGeoJson(
  cityData: CityData,
): DistrictsFeatureCollection {
  const features: DistrictFeature[] = cityData.districts.map((district) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: csToGeoArray(district.position) },
    properties: { id: district.id, name: district.name },
  }));
  return { type: 'FeatureCollection', features };
}

/**
 * Builds a GeoJSON FeatureCollection containing a single full-world-extent
 * water polygon.
 *
 * @remarks
 * **Rendering strategy:** Water is rendered as a solid backdrop covering the
 * entire CS1 world extent. The `land_polygon` fill layer
 * (`buildLandPolygonGeoJson`) is then drawn on top, covering actual land. The
 * visual result is that water appears wherever land is absent — ocean,
 * rivers, and lakes all reveal the water layer beneath.
 *
 * Polygon winding is CCW (geographic exterior) consistent with the south-up
 * convention (see `CS1_LAT_SIGN` in coordinate-transform).
 */
export function buildWaterGeoJson(): WaterFeatureCollection {
  // South-up CCW ring covering ±CS1_WORLD_HALF in both axes.
  const sw = csToGeoArray({ x: -CS1_WORLD_HALF, z: -CS1_WORLD_HALF });
  const se = csToGeoArray({ x: CS1_WORLD_HALF, z: -CS1_WORLD_HALF });
  const ne = csToGeoArray({ x: CS1_WORLD_HALF, z: CS1_WORLD_HALF });
  const nw = csToGeoArray({ x: -CS1_WORLD_HALF, z: CS1_WORLD_HALF });

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[sw, se, ne, nw, sw]] },
        properties: {},
      },
    ],
  };
}
