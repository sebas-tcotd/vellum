import type { District } from './types/city-data';
import type { RenderStyleParams } from './types/theme';

/** Existing theme palette paths; wall-to-wall is a palette choice, not measured density. */
export const DISTRICT_SPECIALIZATIONS = {
  forest: 'industry.forestry',
  farming: 'industry.farming',
  oil: 'industry.oil',
  ore: 'industry.ore',
  tourist: 'commercial.tourism',
  leisure: 'commercial.leisure',
  organic: 'commercial.organic',
  hightech: 'office.tech',
  financial: 'office.financial',
  selfsufficient: 'residential.selfSufficient',
  residentialwalltowall: 'residential.high',
  commercialwalltowall: 'commercial.high',
  officewalltowall: 'office.generic',
} as const;
/** Canonical normalized name of a recognized district specialization. */
export type DistrictSpecialization = keyof typeof DISTRICT_SPECIALIZATIONS;
/** Theme palette path selected by the resolver, or neutral for ambiguous data. */
export type DistrictClassification =
  | (typeof DISTRICT_SPECIALIZATIONS)[DistrictSpecialization]
  | 'industry.generic'
  | 'neutral';
type Sector = 'residential' | 'commercial' | 'industry' | 'office';
const BASES = {
  residential: 'residential.high',
  commercial: 'commercial.high',
  industry: 'industry.generic',
  office: 'office.generic',
} as const;

/** Canonical, deduplicated known names. Unknown names remain untouched in CityData. */
export function districtSpecializations(
  district: District,
): DistrictSpecialization[] {
  return [
    ...new Set(
      (district.specializations ?? [])
        .map((name) => name.trim().toLowerCase())
        .filter((name): name is DistrictSpecialization =>
          Object.hasOwn(DISTRICT_SPECIALIZATIONS, name),
        ),
    ),
  ].sort();
}

/** Resolve only from declared specializations and required household/job counters. */
export function classifyDistrictSpecialization(
  district: District,
): DistrictClassification {
  if (
    district.specializations?.some(
      (name) =>
        !Object.hasOwn(DISTRICT_SPECIALIZATIONS, name.trim().toLowerCase()),
    )
  )
    return 'neutral';
  const names = districtSpecializations(district);
  const sectors = [
    ...new Set(
      names.map(
        (name) => DISTRICT_SPECIALIZATIONS[name].split('.')[0] as Sector,
      ),
    ),
  ];
  if (!sectors.length) return 'neutral';
  let winner = sectors[0];
  if (sectors.length > 1) {
    const counts = {
      residential: district.homes,
      commercial: district.jobs?.commercial,
      industry: district.jobs?.industrial,
      office: district.jobs?.office,
    };
    if (
      sectors.some(
        (sector) =>
          counts[sector] === undefined || !Number.isFinite(counts[sector]),
      )
    )
      return 'neutral';
    const max = Math.max(...sectors.map((sector) => counts[sector]!));
    const winners = sectors.filter((sector) => counts[sector] === max);
    if (max <= 0 || winners.length !== 1) return 'neutral';
    winner = winners[0];
  }
  const winningNames = names.filter((name) =>
    DISTRICT_SPECIALIZATIONS[name].startsWith(`${winner}.`),
  );
  return winningNames.length === 1
    ? DISTRICT_SPECIALIZATIONS[winningNames[0]]
    : BASES[winner];
}

/** Resolve against the active theme, never the fixed building/card RICO colors. */
export function districtSpecializationColor(
  classification: DistrictClassification,
  style: RenderStyleParams,
): string {
  if (classification === 'neutral') return style.districts.fill;
  const [sector, variant] = classification.split('.');
  const palette = style.buildings[sector as Sector] as Record<
    string,
    { fill: string }
  >;
  return palette[variant].fill;
}

/** Complete palette for render expressions, including generic sector fallbacks. */
export function districtSpecializationPalette(
  style: RenderStyleParams,
): Record<DistrictClassification, string> {
  const keys = new Set<DistrictClassification>([
    'neutral',
    ...Object.values(BASES),
    ...Object.values(DISTRICT_SPECIALIZATIONS),
  ]);
  return Object.fromEntries(
    [...keys].map((key) => [key, districtSpecializationColor(key, style)]),
  ) as Record<DistrictClassification, string>;
}
