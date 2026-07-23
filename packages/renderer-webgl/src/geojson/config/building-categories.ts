import { BUILDING_SERVICE_TYPE_CATEGORY } from '@vellum/core';
import type {
  BuildingServiceCategory,
  BuildingServiceType,
} from '@vellum/core';
import type { BuildingZoning } from '../types';

/**
 * Resolves a building's zoning group (and civic subcategory, if any) from its
 * `serviceType`, for the RICO visibility filter and the buildings color expression.
 *
 * @remarks
 * Mirrors the `'unknown' → civic.services` fallback documented on
 * `BUILDING_SERVICE_TYPE_CATEGORY` — that lookup excludes `'unknown'` from its
 * keys, so it's special-cased here instead of widening the lookup's type.
 */
export function resolveBuildingZoning(
  serviceType: BuildingServiceType,
): BuildingZoning {
  const path =
    serviceType === 'unknown'
      ? 'civic.services'
      : BUILDING_SERVICE_TYPE_CATEGORY[serviceType];
  const [group, leaf] = path.split('.');
  const category = group as BuildingServiceCategory;

  return {
    category,
    civicKind:
      category === 'civic'
        ? (leaf as 'publicTransport' | 'education' | 'services')
        : null,
  };
}
