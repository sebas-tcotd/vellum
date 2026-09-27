import { describe, expect, it } from 'vitest';
import { districtAreaKm2, isPointInBoundary } from './district-area';
import type { TerrainPolygon } from './types/city-data';

/** A square of side `deg` degrees at the origin, optionally with a centred hole. */
function square(deg: number, holeDeg?: number): TerrainPolygon[] {
  const ring = (d: number, o: number): [number, number][] => [
    [o, o],
    [o + d, o],
    [o + d, o + d],
    [o, o + d],
    [o, o],
  ];
  return [
    {
      exterior: ring(deg, 0),
      holes: holeDeg ? [ring(holeDeg, (deg - holeDeg) / 2)] : [],
    },
  ];
}

describe('districtAreaKm2', () => {
  it('is undefined without a boundary', () => {
    expect(districtAreaKm2(undefined)).toBeUndefined();
    expect(districtAreaKm2([])).toBeUndefined();
  });

  it('converts square degrees to km²', () => {
    // 0.01° × 0.01° = 1.11195 km × 1.11195 km
    expect(districtAreaKm2(square(0.01))).toBeCloseTo(1.11195 ** 2, 6);
  });

  it('never goes negative or NaN on a malformed boundary', () => {
    // A hole larger than its exterior.
    const inverted: TerrainPolygon[] = [
      {
        exterior: square(0.01)[0]!.exterior,
        holes: [square(0.02)[0]!.exterior],
      },
    ];
    expect(districtAreaKm2(inverted)).toBe(0);
    const broken: TerrainPolygon[] = [
      {
        exterior: [
          [0, 0],
          [Number.NaN, 0],
          [0, 1],
        ],
        holes: [],
      },
    ];
    expect(districtAreaKm2(broken)).toBe(0);
  });

  it('subtracts holes', () => {
    const full = districtAreaKm2(square(0.02))!;
    const holed = districtAreaKm2(square(0.02, 0.01))!;
    expect(holed).toBeCloseTo(full * 0.75, 6);
  });
});

describe('isPointInBoundary', () => {
  it('finds points inside the exterior and outside holes', () => {
    const b = square(0.02, 0.01);
    expect(isPointInBoundary(0.002, 0.002, b)).toBe(true);
    expect(isPointInBoundary(0.01, 0.01, b)).toBe(false); // in the hole
    expect(isPointInBoundary(0.03, 0.01, b)).toBe(false); // outside
    expect(isPointInBoundary(0.01, 0.01, undefined)).toBe(false);
  });
});
