import { describe, expect, it } from 'vitest';
import { makeCityData } from '@vellum/core/testing';
import {
  csToGeo,
  RICO_COLORS,
  type Building,
  type District,
  type TerrainPolygon,
} from '@vellum/core';
import {
  buildPlaceCard,
  cleanPrefabName,
  districtOfBuilding,
  isNotableBuilding,
  placeAnchor,
  type Translate,
} from './place-card-model';

/** Echoes the key, with interpolated values appended, so tests read the intent. */
const t = ((key: string, options?: { value: string }) =>
  options ? `${key}(${options.value})` : key) as Translate;

/** A square boundary of `sizeDeg` degrees around the world origin. */
function squareAroundOrigin(sizeDeg: number): TerrainPolygon[] {
  const h = sizeDeg / 2;
  return [
    {
      exterior: [
        [-h, -h],
        [h, -h],
        [h, h],
        [-h, h],
        [-h, -h],
      ],
      holes: [],
    },
  ];
}

function makeDistrict(overrides: Partial<District> = {}): District {
  return {
    id: 'd1',
    name: 'Centro',
    position: { x: 100, y: 0, z: 200 },
    ...overrides,
  };
}

function makeBuilding(overrides: Partial<Building> = {}): Building {
  return {
    id: 'b1',
    name: 'Library',
    position: { x: 0, y: 0, z: 0 },
    itemClass: 'Library',
    serviceType: 'None',
    footprint: [],
    ...overrides,
  };
}

const nativeDistrict = makeDistrict({
  population: 12430,
  homes: 5000,
  jobs: { commercial: 1200, industrial: 300, office: 800 },
  specializations: ['Tourist', 'Hightech'],
  boundary: squareAroundOrigin(0.01),
});

describe('district card', () => {
  it('shows name, specializations, population, area and the RICO bar', () => {
    const city = makeCityData({ districts: [nativeDistrict] });
    const card = buildPlaceCard(city, { kind: 'district', id: 'd1' }, t, 'en')!;

    expect(card.title).toBe('Centro');
    expect(card.subtitle).toBe(
      'placeCard.district · specializations.tourist, specializations.hightech',
    );
    expect(card.keyFacts.map((f) => [f.label, f.value])).toEqual([
      ['placeCard.population', '12,430'],
      // 0.01° square = 1.11195 km per side → 1.2 km² to one decimal.
      ['placeCard.area', 'placeCard.areaValue(1.2)'],
    ]);
    const bar = card.sections[0]!;
    expect(bar.kind).toBe('segments');
    if (bar.kind !== 'segments') return;
    expect(
      bar.segments.map((s) => [s.label, s.value, s.color, s.displayValue]),
    ).toEqual([
      ['placeCard.homes', 5000, RICO_COLORS.residential.fill, '5,000'],
      ['placeCard.commercialJobs', 1200, RICO_COLORS.commercial.fill, '1,200'],
      ['placeCard.industrialJobs', 300, RICO_COLORS.industry.fill, '300'],
      ['placeCard.officeJobs', 800, RICO_COLORS.office.fill, '800'],
    ]);
  });

  it('shows a real zero, and no specialization in the subtitle', () => {
    const city = makeCityData({
      districts: [
        makeDistrict({
          population: 0,
          homes: 0,
          jobs: { commercial: 0, industrial: 0, office: 0 },
          specializations: [],
          boundary: squareAroundOrigin(0.01),
        }),
      ],
    });
    const card = buildPlaceCard(city, { kind: 'district', id: 'd1' }, t, 'en')!;
    expect(card.subtitle).toBe('placeCard.district');
    expect(card.keyFacts[0]).toMatchObject({
      label: 'placeCard.population',
      value: '0',
    });
    const bar = card.sections[0]!;
    expect(bar.kind === 'segments' && bar.segments.map((s) => s.value)).toEqual(
      [0, 0, 0, 0],
    );
  });

  it('localizes known specializations, keeps unknown ones, drops empty ones', () => {
    const city = makeCityData({
      districts: [
        makeDistrict({ specializations: ['Selfsufficient', 'Moon', ' '] }),
      ],
    });
    const card = buildPlaceCard(city, { kind: 'district', id: 'd1' }, t)!;
    expect(card.subtitle).toBe(
      'placeCard.district · specializations.selfsufficient, Moon',
    );
  });

  it('says honestly that a .cslmap district has no data', () => {
    const city = makeCityData({
      source: 'cslmap',
      districts: [makeDistrict()],
    });
    const card = buildPlaceCard(city, { kind: 'district', id: 'd1' }, t)!;
    expect(card).toEqual({
      title: 'Centro',
      keyFacts: [],
      sections: [
        { kind: 'rows', rows: [{ value: 'placeCard.noDistrictData' }] },
      ],
      actions: [],
    });
  });

  it('a .vellummap without place data keeps its area and says so neutrally', () => {
    const city = makeCityData({
      source: 'vellummap',
      districts: [makeDistrict({ boundary: squareAroundOrigin(0.01) })],
    });
    const card = buildPlaceCard(city, { kind: 'district', id: 'd1' }, t, 'en')!;
    expect(card.title).toBe('Centro');
    expect(card.keyFacts.map((f) => f.label)).toEqual(['placeCard.area']);
    expect(card.sections).toEqual([
      { kind: 'rows', rows: [{ value: 'placeCard.noDistrictDataInFile' }] },
    ]);
  });

  it('is null for a district that is not in the city', () => {
    const city = makeCityData({ districts: [] });
    expect(buildPlaceCard(city, { kind: 'district', id: 'x' }, t)).toBeNull();
    expect(buildPlaceCard(null, { kind: 'district', id: 'x' }, t)).toBeNull();
  });
});

describe('building card', () => {
  it('unrenamed service: its name, its localized type and its district', () => {
    const city = makeCityData({
      districts: [nativeDistrict],
      buildings: [makeBuilding({ displayName: 'Administração' })],
    });
    const card = buildPlaceCard(city, { kind: 'building', id: 'b1' }, t)!;
    expect(card.title).toBe('Administração');
    expect(card.subtitle).toBeUndefined();
    expect(card.keyFacts).toEqual([
      expect.objectContaining({
        label: 'placeCard.type',
        value: 'serviceGroups.education',
      }),
    ]);
    expect(card.sections).toEqual([
      expect.objectContaining({
        kind: 'rows',
        rows: [
          expect.objectContaining({
            label: 'placeCard.district',
            value: 'Centro',
          }),
        ],
      }),
    ]);
  });

  it('omits the district row outside every district', () => {
    const city = makeCityData({
      districts: [makeDistrict()], // no boundary: .cslmap
      buildings: [makeBuilding({ displayName: 'Administração' })],
    });
    const card = buildPlaceCard(city, { kind: 'building', id: 'b1' }, t)!;
    expect(card.sections).toEqual([]);
  });

  it('renamed service: the clean prefab as subtitle, untranslated', () => {
    const city = makeCityData({
      buildings: [
        makeBuilding({
          name: '123456789.Library_Data',
          displayName: 'Biblioteca Mário',
          customName: true,
        }),
      ],
    });
    const card = buildPlaceCard(city, { kind: 'building', id: 'b1' }, t)!;
    expect(card.title).toBe('Biblioteca Mário');
    expect(card.subtitle).toBe('Library');
  });

  it('unnamed service is known by its category', () => {
    const city = makeCityData({
      buildings: [
        makeBuilding({
          name: 'Police Station',
          itemClass: 'Police Department Facility',
        }),
      ],
    });
    const card = buildPlaceCard(city, { kind: 'building', id: 'b1' }, t)!;
    expect(card.title).toBe('serviceGroups.security');
    expect(card.keyFacts).toEqual([]);
  });

  it('renamed RICO: name, localized zone, prefab subtitle', () => {
    const city = makeCityData({
      buildings: [
        makeBuilding({
          name: 'H1 2x2 Tenement01',
          itemClass: 'Low Residential',
          serviceType: 'ResidentialLow',
          displayName: 'Casa Azul',
          customName: true,
        }),
      ],
    });
    const card = buildPlaceCard(city, { kind: 'building', id: 'b1' }, t)!;
    expect(card.title).toBe('Casa Azul');
    expect(card.subtitle).toBe('H1 2x2 Tenement01');
    expect(card.keyFacts[0]?.value).toBe('buildingCategories.residential');
    expect(card.badges).toBeUndefined();
  });

  it('unnamed historical RICO: the clean prefab and the Historical badge', () => {
    const city = makeCityData({
      buildings: [
        makeBuilding({
          name: '998877.Office Tower_Data',
          itemClass: 'Office',
          serviceType: 'OfficeGeneric',
          historical: true,
        }),
      ],
    });
    const card = buildPlaceCard(city, { kind: 'building', id: 'b1' }, t)!;
    expect(card.title).toBe('Office Tower');
    expect(card.subtitle).toBeUndefined();
    expect(card.badges).toEqual(['placeCard.historical']);
    expect(card.keyFacts[0]?.value).toBe('buildingCategories.office');
  });

  it('unmodified RICO and parks have no card', () => {
    const rico = makeBuilding({
      itemClass: 'Low Commercial',
      serviceType: 'CommercialLow',
    });
    const park = makeBuilding({
      id: 'p',
      itemClass: 'Parks Item',
      customName: true,
      displayName: 'Parque',
    });
    expect(isNotableBuilding(rico)).toBe(false);
    expect(isNotableBuilding(park)).toBe(false);
    const city = makeCityData({ buildings: [rico, park] });
    expect(buildPlaceCard(city, { kind: 'building', id: 'b1' }, t)).toBeNull();
    expect(buildPlaceCard(city, { kind: 'building', id: 'p' }, t)).toBeNull();
  });

  it('never opens a card with an empty title', () => {
    const city = makeCityData({
      buildings: [
        makeBuilding({
          name: '123456._Data',
          itemClass: 'Office',
          serviceType: 'OfficeGeneric',
          historical: true,
          displayName: '   ',
        }),
      ],
    });
    expect(buildPlaceCard(city, { kind: 'building', id: 'b1' }, t)).toBeNull();
  });

  it('monuments are notable', () => {
    expect(
      isNotableBuilding(makeBuilding({ itemClass: 'Monument Facility' })),
    ).toBe(true);
  });
});

describe('helpers', () => {
  it('cleanPrefabName strips the workshop prefix and _Data suffix only', () => {
    expect(cleanPrefabName('1234567.My Tower_Data')).toBe('My Tower');
    expect(cleanPrefabName('Library')).toBe('Library');
    expect(cleanPrefabName('H1 2x2 Tenement01')).toBe('H1 2x2 Tenement01');
  });

  it('districtOfBuilding finds the containing district by point in polygon', () => {
    const outside = makeBuilding({ position: { x: 5000, y: 0, z: 5000 } });
    const city = makeCityData({ districts: [nativeDistrict] });
    expect(districtOfBuilding(city, makeBuilding())?.id).toBe('d1');
    expect(districtOfBuilding(city, outside)).toBeUndefined();
  });

  it('placeAnchor is the district label point or the building position', () => {
    const city = makeCityData({
      districts: [nativeDistrict],
      buildings: [makeBuilding({ position: { x: 10, y: 0, z: 20 } })],
    });
    const d = csToGeo({ x: 100, z: 200 });
    const b = csToGeo({ x: 10, z: 20 });
    expect(placeAnchor(city, { kind: 'district', id: 'd1' })).toEqual([
      d.lng,
      d.lat,
    ]);
    expect(placeAnchor(city, { kind: 'building', id: 'b1' })).toEqual([
      b.lng,
      b.lat,
    ]);
  });
});
