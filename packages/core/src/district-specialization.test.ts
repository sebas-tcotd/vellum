import { describe, it, expect } from 'vitest';
import {
  classifyDistrictSpecialization,
  DISTRICT_SPECIALIZATIONS,
} from './district-specialization';
import type { District } from './types/city-data';
const district = (
  specializations?: string[],
  extra: Partial<District> = {},
): District => ({
  id: 'd',
  name: 'D',
  position: { x: 0, y: 0, z: 0 },
  ...(specializations === undefined ? {} : { specializations }),
  ...extra,
});
describe('district specialization', () => {
  it.each(Object.entries(DISTRICT_SPECIALIZATIONS))(
    'maps %s without composition',
    (name, classification) => {
      expect(
        classifyDistrictSpecialization(district([` ${name.toUpperCase()} `])),
      ).toBe(classification);
    },
  );
  it('uses unique positive maximum regardless of input order and deduplicates names', () => {
    const names = ['Tourist', 'Hightech', 'ResidentialWallToWall'];
    for (const first of names)
      for (const second of names.filter((x) => x !== first)) {
        const order = [
          first,
          second,
          ...names.filter((x) => x !== first && x !== second),
        ];
        expect(
          classifyDistrictSpecialization(
            district(order, {
              homes: 5,
              jobs: { commercial: 2, office: 9, industrial: 100 },
            }),
          ),
        ).toBe('office.tech');
      }
    expect(classifyDistrictSpecialization(district(['Forest', 'forest']))).toBe(
      'industry.forestry',
    );
    expect(
      classifyDistrictSpecialization(district(['Farming', 'Forest'])),
    ).toBe('industry.generic');
  });
  it('stays neutral for absent, unknown, zero, ties and missing required counters', () => {
    for (const names of [undefined, [], ['Future']])
      expect(classifyDistrictSpecialization(district(names))).toBe('neutral');
    for (const extra of [
      {},
      { homes: 100 },
      { homes: 0, jobs: { commercial: 0, office: 0, industrial: 0 } },
      { homes: 4, jobs: { commercial: 4, office: 1, industrial: 0 } },
    ]) {
      expect(
        classifyDistrictSpecialization(
          district(['Tourist', 'ResidentialWallToWall'], extra),
        ),
      ).toBe('neutral');
    }
  });
  it('stays neutral when known and unknown names are mixed in either order', () => {
    for (const names of [
      ['Forest', 'Future'],
      ['Future', 'Forest'],
      [' FOREST ', 'forest', ' Future '],
    ]) {
      const input = district(names);
      expect(classifyDistrictSpecialization(input)).toBe('neutral');
      expect(input.specializations).toEqual(names);
    }
  });
});
