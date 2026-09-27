/**
 * Turns a pinned place into the data the generic `PlaceCard` shows.
 *
 * @remarks
 * Pure functions over `CityData`: no React, no renderer. The atlas test is the
 * rule here — name, type, population, area, land use and specializations, and
 * nothing a data source does not carry. An absent value (`undefined`) is left
 * out; a real zero is shown.
 */
import {
  BUILDING_SERVICE_TYPE_CATEGORY,
  csToGeo,
  districtAreaKm2,
  isPointInBoundary,
  resolveServiceGroup,
  RICO_COLORS,
  type Building,
  type CitySource,
  type RicoZone,
  type CityData,
  type District,
  type ServiceGroup,
} from '@vellum/core';
import type { ParseKeys } from 'i18next';
import { MapPin, Ruler, Tag, Users } from 'lucide-react';
import type { PinnedEntity } from '../../shell/shell-session';
import type {
  PlaceCardData,
  PlaceCardFact,
  PlaceCardSection,
  PlaceCardSegment,
} from './PlaceCard';

/** The slice of `t` the model needs; typed keys, so a typo fails to compile. */
export interface Translate {
  (key: ParseKeys): string;
  (key: ParseKeys, options: { value: string }): string;
}

/** Specializations Vellum localizes, by the game's name lowercased. */
const KNOWN_SPECIALIZATIONS = [
  'forest',
  'farming',
  'oil',
  'ore',
  'leisure',
  'tourist',
  'organic',
  'selfsufficient',
  'hightech',
  'financial',
] as const;
type KnownSpecialization = (typeof KNOWN_SPECIALIZATIONS)[number];

const isKnownSpecialization = (name: string): name is KnownSpecialization =>
  (KNOWN_SPECIALIZATIONS as readonly string[]).includes(name);

/** The four RICO zones, in the order the bar draws them; the keys of the shared colours. */
const RICO_ZONES = Object.keys(RICO_COLORS) as RicoZone[];

/** Service groups that open a card. Parks never do (atlas test). */
function cardServiceGroup(building: Building): ServiceGroup | null {
  const group = resolveServiceGroup(building.itemClass);
  return group === 'parks' ? null : group;
}

/** RICO zone of a zoned building, or `null` for anything else. */
function ricoZone(building: Building): RicoZone | null {
  if (building.serviceType === 'unknown') return null;
  const path = BUILDING_SERVICE_TYPE_CATEGORY[building.serviceType];
  const zone = path?.split('.')[0];
  return zone && (RICO_ZONES as readonly string[]).includes(zone)
    ? (zone as RicoZone)
    : null;
}

/**
 * Whether a building has a card: a service building or a monument, or one the
 * player renamed or marked historical. Unmodified RICO and parks never do.
 */
export function isNotableBuilding(building: Building): boolean {
  if (resolveServiceGroup(building.itemClass) === 'parks') return false;
  return (
    building.customName === true ||
    building.historical === true ||
    cardServiceGroup(building) !== null
  );
}

/**
 * The prefab name as a reader would write it: without the Steam Workshop
 * numeric prefix (`123456789.`) and the `_Data` suffix. Never translated.
 */
export function cleanPrefabName(name: string): string {
  return name
    .trim()
    .replace(/^\d+\./, '')
    .replace(/_Data$/, '')
    .trim();
}

/** The WGS-84 point of a world-space position. */
function toLngLat(position: { x: number; z: number }): [number, number] {
  const { lng, lat } = csToGeo(position);
  return [lng, lat];
}

/**
 * The district a building stands in, by point in polygon on the districts'
 * boundaries. `undefined` without boundaries (`.cslmap`) or outside every one.
 */
export function districtOfBuilding(
  cityData: CityData,
  building: Building,
): District | undefined {
  const [lng, lat] = toLngLat(building.position);
  return cityData.districts.find((district) =>
    isPointInBoundary(lng, lat, district.boundary),
  );
}

/** Where "Center on map" goes: the district's label anchor or the building. */
export function placeAnchor(
  cityData: CityData,
  pinned: PinnedEntity,
): [number, number] | null {
  const place =
    pinned.kind === 'district'
      ? cityData.districts.find((d) => d.id === pinned.id)
      : cityData.buildings.find((b) => b.id === pinned.id);
  return place ? toLngLat(place.position) : null;
}

/** Localized specialization names; unknown ones as-is, empty ones dropped. */
function specializationLabels(
  names: readonly string[] | undefined,
  t: Translate,
): string[] {
  return (names ?? [])
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => {
      const key = name.toLowerCase();
      return isKnownSpecialization(key) ? t(`specializations.${key}`) : name;
    });
}

function districtCard(
  district: District,
  source: CitySource,
  t: Translate,
  locale: string | undefined,
): PlaceCardData {
  const integer = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const oneDecimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const specializations = specializationLabels(district.specializations, t);
  const subtitle = [t('placeCard.district'), specializations.join(', ')]
    .filter((part) => part.length > 0)
    .join(' · ');

  const keyFacts: PlaceCardFact[] = [];
  if (district.population !== undefined) {
    keyFacts.push({
      label: t('placeCard.population'),
      value: integer.format(district.population),
      icon: Users,
    });
  }
  const area = districtAreaKm2(district.boundary);
  if (area !== undefined) {
    keyFacts.push({
      label: t('placeCard.area'),
      value: t('placeCard.areaValue', { value: oneDecimal.format(area) }),
      icon: Ruler,
    });
  }

  const segments: PlaceCardSegment[] = [];
  const segment = (label: string, value: number, zone: RicoZone) =>
    segments.push({
      label,
      value,
      color: RICO_COLORS[zone].fill,
      displayValue: integer.format(value),
    });
  if (district.homes !== undefined) {
    segment(t('placeCard.homes'), district.homes, 'residential');
  }
  if (district.jobs !== undefined) {
    segment(
      t('placeCard.commercialJobs'),
      district.jobs.commercial,
      'commercial',
    );
    segment(
      t('placeCard.industrialJobs'),
      district.jobs.industrial,
      'industry',
    );
    segment(t('placeCard.officeJobs'), district.jobs.office, 'office');
  }

  const sections: PlaceCardSection[] = [];
  if (segments.length > 0) {
    sections.push({
      kind: 'segments',
      heading: t('placeCard.landUse'),
      segments,
    });
  }

  const hasStats =
    district.population !== undefined ||
    district.homes !== undefined ||
    district.jobs !== undefined ||
    district.specializations !== undefined;
  if (!hasStats && source === 'cslmap') {
    // `.cslmap` carries only the name: say so honestly instead of showing dashes.
    return {
      title: district.name,
      keyFacts: [],
      sections: [
        { kind: 'rows', rows: [{ value: t('placeCard.noDistrictData') }] },
      ],
      actions: [],
    };
  }
  if (!hasStats) {
    // A native document without place data (`districts` 1.0): keep what it
    // does carry (the area) and say the rest is missing, neutrally.
    sections.push({
      kind: 'rows',
      rows: [{ value: t('placeCard.noDistrictDataInFile') }],
    });
  }

  return { title: district.name, subtitle, keyFacts, sections, actions: [] };
}

function buildingCard(
  cityData: CityData,
  building: Building,
  t: Translate,
): PlaceCardData {
  const prefab = cleanPrefabName(building.name);
  const displayName = building.displayName?.trim() || undefined;
  const group = cardServiceGroup(building);
  const zone = group === null ? ricoZone(building) : null;
  const type =
    group !== null
      ? t(`serviceGroups.${group}`)
      : zone !== null
        ? t(`buildingCategories.${zone}`)
        : undefined;

  // A named building carries its name; an unnamed service is known by its
  // category (Bridge only names renamed and unique buildings); an unnamed
  // historical building falls back to its prefab.
  const title =
    displayName ?? (group !== null && type !== undefined ? type : prefab);
  const subtitle =
    building.customName === true && prefab.length > 0 && prefab !== title
      ? prefab
      : undefined;

  const keyFacts: PlaceCardFact[] = [];
  if (type !== undefined && type !== title) {
    keyFacts.push({ label: t('placeCard.type'), value: type, icon: Tag });
  }

  const sections: PlaceCardSection[] = [];
  const district = districtOfBuilding(cityData, building);
  if (district) {
    sections.push({
      kind: 'rows',
      heading: t('placeCard.details'),
      rows: [
        { label: t('placeCard.district'), value: district.name, icon: MapPin },
      ],
    });
  }

  return {
    title,
    ...(subtitle !== undefined ? { subtitle } : {}),
    ...(building.historical === true
      ? { badges: [t('placeCard.historical')] }
      : {}),
    keyFacts,
    sections,
    actions: [],
  };
}

/**
 * The card for a pinned place, or `null` when there is nothing to show (the
 * place is gone, or it is a building that does not have a card).
 *
 * @param cityData - The city on screen.
 * @param pinned - The pinned place, or `null`.
 * @param t - Translation function.
 * @param locale - Locale for number formatting; the runtime default if absent.
 * @returns The card data, with no actions — the caller adds them.
 */
export function buildPlaceCard(
  cityData: CityData | null,
  pinned: PinnedEntity | null,
  t: Translate,
  locale?: string,
): PlaceCardData | null {
  if (!cityData || !pinned) return null;
  if (pinned.kind === 'district') {
    const district = cityData.districts.find((d) => d.id === pinned.id);
    return district ? districtCard(district, cityData.source, t, locale) : null;
  }
  const building = cityData.buildings.find((b) => b.id === pinned.id);
  if (!building || !isNotableBuilding(building)) return null;
  const card = buildingCard(cityData, building, t);
  // A card must be named; an empty title would open an unlabelled dialog.
  return card.title.trim().length > 0 ? card : null;
}
