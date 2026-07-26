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
 * Builds every visible water surface: the sea with each landmass punched out, plus the
 * inland lakes and rivers.
 *
 * @remarks
 * This is painted *above* the terrain relief, not below it. `color-relief` and
 * `hillshade` cover the whole DEM including the sea floor, and MapLibre cannot clip a
 * raster layer to a polygon. Clipping by elevation is impossible too — measured on real
 * maps, land and water elevation ranges **overlap** (altavento: land 146.8…633.1 m vs.
 * water 25.0…215.7 m, with 31 % of land cells below the highest water cell). The exact
 * vector coastline the parser already produced is the only boundary available.
 *
 * The sea is the full world extent with every `landPolygon` exterior cut out as a hole;
 * inland bodies come from `inlandWaterPolygons`, which live *inside* those exteriors and
 * so are not covered by the sea ring.
 */
export function buildWaterSurfaceGeoJson(
  cityData: CityData,
): WaterFeatureCollection {
  const [outerRing] =
    buildWorldExtentGeoJson().features[0]?.geometry.coordinates ?? [];

  const sea: WaterFeatureCollection['features'] = outerRing
    ? [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              outerRing,
              ...cityData.landPolygon.map((poly) => poly.exterior),
            ],
          },
          properties: {},
        },
      ]
    : [];

  const inland: WaterFeatureCollection['features'] =
    cityData.inlandWaterPolygons.map((poly) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [poly.exterior, ...poly.holes],
      },
      properties: {},
    }));

  return { type: 'FeatureCollection', features: [...sea, ...inland] };
}

/**
 * Builds a GeoJSON FeatureCollection containing a single polygon covering the full
 * CS1 world extent.
 *
 * @remarks
 * Used as the outer ring of the water surface and as the clip boundary for anything
 * that must not spill past the map.
 *
 * Polygon winding is CCW (geographic exterior) consistent with the south-up
 * convention (see `CS1_LAT_SIGN` in coordinate-transform).
 */
export function buildWorldExtentGeoJson(): WaterFeatureCollection {
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
