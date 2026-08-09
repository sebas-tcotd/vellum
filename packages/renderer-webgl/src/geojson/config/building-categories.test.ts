import { describe, it, expect } from 'vitest';
import {
  BUILDING_SERVICE_TYPE_CATEGORY,
  type BuildingServiceType,
} from '@vellum/core';
import { resolveBuildingZoning } from './building-categories';

describe('resolveBuildingZoning', () => {
  it('maps every known service type to a group the theme can colour', () => {
    const groups = new Set([
      'residential',
      'commercial',
      'office',
      'industry',
      'civic',
      'none',
    ]);
    for (const serviceType of Object.keys(
      BUILDING_SERVICE_TYPE_CATEGORY,
    ) as BuildingServiceType[]) {
      expect(groups).toContain(resolveBuildingZoning(serviceType).category);
    }
  });

  it('resolves the DLC service types real cities carry but no fixture does', () => {
    // Regression: `PublicTransportMonorail` is present in san-rico (14 buildings)
    // and springvalley (25) and in no fixture. Its absence from the lookup made
    // this function throw, which killed `addBuildingsLayer` and every layer
    // registered after it — roads, transit, grid, districts, map frame — plus
    // the camera fit, since registration order is z-order.
    const cases: Record<string, string> = {
      PublicTransportMonorail: 'civic',
      PlayerEducationLiberalArts: 'civic',
      ResidentialWallToWall: 'residential',
      CommercialWallToWall: 'commercial',
      OfficeWallToWall: 'office',
      PlayerIndustryFarming: 'industry',
      PlayerIndustryOre: 'industry',
      PlayerIndustryOil: 'industry',
    };
    for (const [serviceType, category] of Object.entries(cases)) {
      expect(
        resolveBuildingZoning(serviceType as BuildingServiceType).category,
      ).toBe(category);
    }
  });

  it('falls back instead of throwing on a service type it has never seen', () => {
    // The parser passes `.cslmap` `subsrv` through verbatim, so mods and future
    // DLC can always introduce a value this lookup does not know.
    const zoning = resolveBuildingZoning(
      'SomeFutureDlcZoning' as BuildingServiceType,
    );
    expect(zoning.category).toBe('civic');
    expect(zoning.civicKind).toBe('services');
  });
});
