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
 *
 * The same fallback also catches values the lookup has never heard of. The Rust
 * parser passes the `.cslmap` `subsrv` attribute straight through as a string
 * (`handlers/buildings.rs`), so `BuildingServiceType` is a closed union over an
 * open set: every DLC and every mod can add a variant. Before this fallback
 * existed, one such value (`PublicTransportMonorail`, present in real cities but
 * in no fixture) made this function throw, which took down `addBuildingsLayer`
 * and — registration order being z-order — every layer after it, including the
 * roads, the map frame, and the camera fit.
 */
export function resolveBuildingZoning(
  serviceType: BuildingServiceType,
): BuildingZoning {
  const path =
    serviceType === 'unknown'
      ? 'civic.services'
      : (BUILDING_SERVICE_TYPE_CATEGORY[serviceType] ?? 'civic.services');
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
