/** Building-feature GeoJSON types and zoning classification. */

import type { BuildingServiceCategory } from '@vellum/core';
import type { ServiceGroup } from '../../service-icons';
import type {
  Feature,
  FeatureCollection,
  PolygonGeometry,
} from './geojson-primitives';

/**
 * A building's zoning group plus, for civic buildings, which of the 3 civic
 * subcategory colors applies. `civicKind` is `null` for every non-civic group.
 */
export interface BuildingZoning {
  category: BuildingServiceCategory;
  civicKind: 'publicTransport' | 'education' | 'services' | null;
}

/** Properties attached to each building GeoJSON feature. */
export interface BuildingFeatureProperties {
  /** The building's unique CS1 identifier. */
  id: string;
  /** The original asset class from the game. */
  itemClass: string;
  /** Top-level zoning group, used by the RICO visibility filter and color expression. */
  category: BuildingServiceCategory;
  /** Civic subcategory (`publicTransport`/`education`/`services`), or `null` for non-civic buildings. */
  civicKind: 'publicTransport' | 'education' | 'services' | null;
  /** Service-icon group (mirrors CS1's HUD categories), or `null` if `itemClass` has no icon. */
  serviceGroup: ServiceGroup | null;
}

/** A GeoJSON Feature wrapping a building footprint. */
export type BuildingFeature = Feature<
  PolygonGeometry,
  BuildingFeatureProperties
>;
/** A GeoJSON FeatureCollection of building polygons. */
export type BuildingsFeatureCollection = FeatureCollection<BuildingFeature>;
