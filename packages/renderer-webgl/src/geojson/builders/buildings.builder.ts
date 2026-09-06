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

/**
 * Item classes that are never drawn as buildings.
 *
 * @remarks
 * The mandatory `ItemClass` exclusions from the project rules: decorative and
 * utility assets with no cartographic footprint. La lista se originó en el
 * adapter `renderer-canvas`, retirado por ADR-0001; este builder no la tenía,
 * así que un mástil `Radio` o un `Earthquake Sensor` se dibujaban como
 * edificio en el mapa vivo — `aurelia-del-delta` contiene uno.
 *
 * `Beautification Item` is deliberately *absent* here even though the project
 * rules list it. That class covers both natural props (rocks, cliffs) and
 * artificial ones the game gives no distinct class to — ruins, piers,
 * abandoned buildings — which are real cartography. {@link isNaturalDecoration}
 * separates them by name, which is the only axis available; excluding the
 * whole class would delete the piers along with the boulders.
 *
 * Exported so tests can assert coverage of every excluded class.
 */
export const BUILDING_EXCLUDED_ITEM_CLASSES: ReadonlySet<string> = new Set([
  'Airplane Path',
  'Ship Path',
  'Water Facility',
  'Earthquake Sensor',
  'Firewatch',
  'Radio',
  'Tsunami Buoy',
]);

/** Builds a GeoJSON FeatureCollection of building footprint polygons. */
export function buildBuildingsGeoJson(
  cityData: CityData,
): BuildingsFeatureCollection {
  const features = cityData.buildings
    .filter(isValidBuilding)
    .filter(
      (building) => !BUILDING_EXCLUDED_ITEM_CLASSES.has(building.itemClass),
    )
    .filter((building) => !isNaturalDecoration(building))
    .map(createBuildingFeature);

  return { type: 'FeatureCollection', features };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function isValidBuilding(building: Building): boolean {
  return building.footprint.length >= 3;
}

/**
 * Matches the vanilla natural-terrain decoration props (rock formations,
 * boulders, cliffs, caves) that share `itemClass: 'Beautification Item'` with
 * artificial decorations (ruins, abandoned buildings, piers, parks) the game
 * gives no distinct class for. Name is the only axis that separates them.
 */
const NATURAL_DECORATION_NAME =
  /^(Rock Formation|Rock Area|Boulder|Cliff|Cave)\b/i;

function isNaturalDecoration(building: Building): boolean {
  return (
    building.itemClass === 'Beautification Item' &&
    NATURAL_DECORATION_NAME.test(building.name)
  );
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
