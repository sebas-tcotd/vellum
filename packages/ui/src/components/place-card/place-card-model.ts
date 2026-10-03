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
  DISTRICT_SPECIALIZATIONS,
  districtAreaKm2,
  isLocalizationKey,
  isPointInBoundary,
  resolveServiceGroup,
  RICO_COLORS,
  type Building,
  type CitySource,
  type RicoZone,
  type CityData,
  type District,
  type DistrictSpecialization,
  type ParkArea,
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

/** Specializations Vellum localizes: the same list the map colours by. */
const isKnownSpecialization = (name: string): name is DistrictSpecialization =>
  Object.hasOwn(DISTRICT_SPECIALIZATIONS, name);

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
 * The district a building or park area stands in, by point in polygon on the
 * districts' boundaries. `undefined` without boundaries (`.cslmap`) or
 * outside every one.
 */
export function districtOfBuilding(
  cityData: CityData,
  place: { position: { x: number; z: number } },
): District | undefined {
  const [lng, lat] = toLngLat(place.position);
  return cityData.districts.find((district) =>
    isPointInBoundary(lng, lat, district.boundary),
  );
}

/** The pinned place in the city, whatever its kind. */
function findPlace(
  cityData: CityData,
  pinned: PinnedEntity,
): { position: { x: number; z: number } } | undefined {
  switch (pinned.kind) {
    case 'district':
      return cityData.districts.find((d) => d.id === pinned.id);
    case 'park':
      return cityData.parkAreas.find((p) => p.id === pinned.id);
    case 'building':
      return cityData.buildings.find((b) => b.id === pinned.id);
  }
}

/** Where "Center on map" goes: the place's label anchor or position. */
export function placeAnchor(
  cityData: CityData,
  pinned: PinnedEntity,
): [number, number] | null {
  const place = findPlace(cityData, pinned);
  return place ? toLngLat(place.position) : null;
}

/** A game name worth showing: trimmed, and never an unresolved localization key. */
function readableName(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  return trimmed && !isLocalizationKey(trimmed) ? trimmed : undefined;
}

/** The "District: X" details row, when the place stands in a known district. */
function districtSection(
  cityData: CityData,
  place: { position: { x: number; z: number } },
  t: Translate,
): PlaceCardSection[] {
  const district = districtOfBuilding(cityData, place);
  return district
    ? [
        {
          kind: 'rows',
          heading: t('placeCard.details'),
          rows: [
            {
              label: t('placeCard.district'),
              value: district.name,
              icon: MapPin,
            },
          ],
        },
      ]
    : [];
}

/**
 * A game identifier made readable — `SomeNewPolicy` → `Some New Policy` — for
 * a specialization Vellum does not localize yet, rather than raw CamelCase.
 */
export function humanizeIdentifier(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

/** Localized specialization names; unknown ones humanized, empty ones dropped. */
function specializationLabels(
  names: readonly string[] | undefined,
  t: Translate,
): string[] {
  return (names ?? [])
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => {
      const key = name.toLowerCase();
      return isKnownSpecialization(key)
        ? t(`specializations.${key}`)
        : humanizeIdentifier(name);
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
  // An unnamed district is titled by its kind, so the subtitle skips it.
  const name = readableName(district.name);
  const title = name ?? t('placeCard.district');
  const subtitle = [
    name !== undefined ? t('placeCard.district') : '',
    specializations.join(', '),
  ]
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
      title,
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

  return {
    title,
    ...(subtitle.length > 0 ? { subtitle } : {}),
    keyFacts,
    sections,
    actions: [],
  };
}

function buildingCard(
  cityData: CityData,
  building: Building,
  t: Translate,
): PlaceCardData {
  const prefab = cleanPrefabName(building.name);
  // A sub-building of a unique building has no name of its own: CS1 hands
  // back `BUILDING_TITLE[…]:0`, which is not a name (Bridge 0.8.2 drops it).
  const displayName = readableName(building.displayName);
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

  const sections = districtSection(cityData, building, t);

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

function parkCard(
  cityData: CityData,
  park: ParkArea,
  t: Translate,
  locale: string | undefined,
): PlaceCardData {
  const type = t(`parkTypes.${park.parkType}`);
  const name = readableName(park.name);
  const keyFacts: PlaceCardFact[] = [];
  const area = districtAreaKm2(park.boundary);
  if (area !== undefined) {
    const oneDecimal = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    keyFacts.push({
      label: t('placeCard.area'),
      value: t('placeCard.areaValue', { value: oneDecimal.format(area) }),
      icon: Ruler,
    });
  }
  return {
    // An unnamed area is known by its type, like an unnamed service building.
    title: name ?? type,
    ...(name !== undefined ? { subtitle: type } : {}),
    keyFacts,
    sections: districtSection(cityData, park, t),
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
  if (pinned.kind === 'park') {
    const park = cityData.parkAreas.find((p) => p.id === pinned.id);
    return park ? parkCard(cityData, park, t, locale) : null;
  }
  const building = cityData.buildings.find((b) => b.id === pinned.id);
  if (!building || !isNotableBuilding(building)) return null;
  const card = buildingCard(cityData, building, t);
  // A card must be named; an empty title would open an unlabelled dialog.
  return card.title.trim().length > 0 ? card : null;
}
