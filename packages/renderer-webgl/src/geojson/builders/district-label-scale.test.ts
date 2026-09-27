import { describe, expect, it } from 'vitest';
import { districtLabelScale } from '../index';

/** A square district `side` km across, in degrees (~111.195 km per degree). */
const square = (sideKm: number) => {
  const d = sideKm / 111.195;
  return [
    {
      exterior: [
        [0, 0],
        [d, 0],
        [d, d],
        [0, d],
        [0, 0],
      ] as [number, number][],
      holes: [],
    },
  ];
};

describe('districtLabelScale', () => {
  it('is 1 without a boundary (.cslmap)', () => {
    expect(districtLabelScale(undefined)).toBe(1);
  });

  it('grows with the side of the district and stays within its bounds', () => {
    expect(districtLabelScale(square(Math.sqrt(1.5)))).toBeCloseTo(1, 2);
    expect(districtLabelScale(square(0.1))).toBe(0.85);
    expect(districtLabelScale(square(10))).toBe(1.6);
  });
});
