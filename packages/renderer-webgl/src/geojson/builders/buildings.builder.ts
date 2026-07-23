/**
 * Building footprint GeoJSON construction. Each footprint (`Vec3[]`) becomes
 * a closed `Polygon` ring; the parser has already filtered out non-building
 * entities.
 */

import type { Building, CityData } from '@vellum/core';
import { csToGeoArray } from '../../coordinate-transform';
import { resolveServiceGroup } from '../../service-icons';
import { resolveBuildingZoning } from '../config/building-categories';
import type { BuildingFeature, BuildingsFeatureCollection } from '../types';

/** Builds a GeoJSON FeatureCollection of building footprint polygons. */
export function buildBuildingsGeoJson(
  cityData: CityData,
): BuildingsFeatureCollection {
  const features = cityData.buildings
    .filter(isValidBuilding)
    .map(createBuildingFeature);

  return { type: 'FeatureCollection', features };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function isValidBuilding(building: Building): boolean {
  return building.footprint.length >= 3;
}

function createBuildingFeature(building: Building): BuildingFeature {
  const ring: [number, number][] = building.footprint.map(csToGeoArray);
  ring.push(ring[0]); // Close the ring per GeoJSON spec

  const { category, civicKind } = resolveBuildingZoning(building.serviceType);

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {
      id: building.id,
      itemClass: building.itemClass,
      category,
      civicKind,
      serviceGroup: resolveServiceGroup(building.itemClass),
    },
  };
}
