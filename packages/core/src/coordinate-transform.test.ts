import { describe, it, expect } from 'vitest';
import {
  csToGeo,
  geoToCs,
  csToGeoArray,
  CS1_WORLD_HALF,
  CS1_HALF_EXTENT_DEG,
  CS1_EXTENT_DEG,
  CS1_WORLD_SIZE,
} from './coordinate-transform';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Maximum allowed floating-point error for round-trip tests. */
const ROUND_TRIP_EPSILON = 1e-9;

function expectClose(
  actual: number,
  expected: number,
  epsilon = ROUND_TRIP_EPSILON,
): void {
  expect(Math.abs(actual - expected)).toBeLessThan(epsilon);
}

// ─── Constants sanity ─────────────────────────────────────────────────────────

describe('coordinate-transform constants', () => {
  it('WORLD_HALF is 8640', () => {
    expect(CS1_WORLD_HALF).toBe(8640);
  });

  it('WORLD_SIZE is 17280', () => {
    expect(CS1_WORLD_SIZE).toBe(17280);
  });

  it('CS1_EXTENT_DEG ≈ 0.15541°', () => {
    // 17280 m / 111195 m·deg⁻¹ ≈ 0.15541°
    expect(CS1_EXTENT_DEG).toBeCloseTo(0.15541, 4);
  });

  it('CS1_HALF_EXTENT_DEG is exactly half of CS1_EXTENT_DEG', () => {
    expect(CS1_HALF_EXTENT_DEG).toBe(CS1_EXTENT_DEG / 2);
  });
});

// ─── AC-TRANSFORM-001: Z-axis south-up orientation ───────────────────────────

describe('AC-TRANSFORM-001 — Z-axis south-up orientation (CS1_LAT_SIGN = +1)', () => {
  it('positive worldZ (south in CS1) maps to positive latitude (top of south-up map)', () => {
    const result = csToGeo({ x: 0, z: 8640 });
    expect(result.lat).toBeGreaterThan(0);
    expect(result.lng).toBe(0);
  });

  it('negative worldZ (north in CS1) maps to negative latitude (bottom of south-up map)', () => {
    const result = csToGeo({ x: 0, z: -8640 });
    expect(result.lat).toBeLessThan(0);
    expect(result.lng).toBe(0);
  });

  it('CS1 south corner maps to positive-latitude pole of bounding box', () => {
    const result = csToGeo({ x: 0, z: CS1_WORLD_HALF });
    expectClose(result.lat, +CS1_HALF_EXTENT_DEG);
  });

  it('CS1 north corner maps to negative-latitude pole of bounding box', () => {
    const result = csToGeo({ x: 0, z: -CS1_WORLD_HALF });
    expectClose(result.lat, -CS1_HALF_EXTENT_DEG);
  });
});

// ─── Origin ───────────────────────────────────────────────────────────────────

describe('origin mapping', () => {
  it('csToGeo({x:0, z:0}) maps to [0°, 0°]', () => {
    const result = csToGeo({ x: 0, z: 0 });
    // Use expectClose: IEEE 754 can produce −0 from -(0 * k), which differs from +0 under Object.is
    expectClose(result.lng, 0);
    expectClose(result.lat, 0);
  });

  it('geoToCs({lng:0, lat:0}) maps to {x:0, z:0}', () => {
    const result = geoToCs({ lng: 0, lat: 0 });
    // Use expectClose: same −0 vs +0 consideration
    expectClose(result.x, 0);
    expectClose(result.z, 0);
  });
});

// ─── Corners ──────────────────────────────────────────────────────────────────

describe('corner mappings', () => {
  it('east edge (+x max) maps to +CS1_HALF_EXTENT_DEG longitude', () => {
    const result = csToGeo({ x: CS1_WORLD_HALF, z: 0 });
    expectClose(result.lng, +CS1_HALF_EXTENT_DEG);
    expectClose(result.lat, 0); // z=0 → −0 in IEEE 754; tolerance check avoids Object.is mismatch
  });

  it('west edge (-x max) maps to -CS1_HALF_EXTENT_DEG longitude', () => {
    const result = csToGeo({ x: -CS1_WORLD_HALF, z: 0 });
    expectClose(result.lng, -CS1_HALF_EXTENT_DEG);
    expectClose(result.lat, 0); // same −0 guard
  });

  it('CS1 NE corner {x:+8640, z:-8640} maps to {lng:+H, lat:-H} (north → neg lat in south-up)', () => {
    const result = csToGeo({ x: CS1_WORLD_HALF, z: -CS1_WORLD_HALF });
    expectClose(result.lng, +CS1_HALF_EXTENT_DEG);
    expectClose(result.lat, -CS1_HALF_EXTENT_DEG);
  });

  it('CS1 SE corner {x:+8640, z:+8640} maps to {lng:+H, lat:+H} (south → pos lat in south-up)', () => {
    const result = csToGeo({ x: CS1_WORLD_HALF, z: CS1_WORLD_HALF });
    expectClose(result.lng, +CS1_HALF_EXTENT_DEG);
    expectClose(result.lat, +CS1_HALF_EXTENT_DEG);
  });

  it('CS1 SW corner {x:-8640, z:+8640} maps to {lng:-H, lat:+H}', () => {
    const result = csToGeo({ x: -CS1_WORLD_HALF, z: CS1_WORLD_HALF });
    expectClose(result.lng, -CS1_HALF_EXTENT_DEG);
    expectClose(result.lat, +CS1_HALF_EXTENT_DEG);
  });

  it('CS1 NW corner {x:-8640, z:-8640} maps to {lng:-H, lat:-H}', () => {
    const result = csToGeo({ x: -CS1_WORLD_HALF, z: -CS1_WORLD_HALF });
    expectClose(result.lng, -CS1_HALF_EXTENT_DEG);
    expectClose(result.lat, -CS1_HALF_EXTENT_DEG);
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe('round-trip fidelity (epsilon < 1e-9)', () => {
  const testPoints: Array<{ x: number; z: number; label: string }> = [
    { x: 0, z: 0, label: 'origin' },
    { x: 8640, z: 0, label: 'east edge' },
    { x: -8640, z: 0, label: 'west edge' },
    { x: 0, z: 8640, label: 'south edge' },
    { x: 0, z: -8640, label: 'north edge' },
    { x: 8640, z: -8640, label: 'NE corner' },
    { x: -8640, z: 8640, label: 'SW corner' },
    { x: 1234.567, z: -3456.789, label: 'arbitrary interior point' },
    { x: -7777, z: 4321, label: 'another interior point' },
  ];

  for (const point of testPoints) {
    it(`geoToCs(csToGeo(p)) ≈ p for ${point.label}`, () => {
      const geo = csToGeo(point);
      const back = geoToCs(geo);
      expectClose(back.x, point.x, ROUND_TRIP_EPSILON);
      expectClose(back.z, point.z, ROUND_TRIP_EPSILON);
    });
  }
});

// ─── GeoJSON array order ──────────────────────────────────────────────────────

describe('csToGeoArray — GeoJSON [lng, lat] order', () => {
  it('returns [longitude, latitude] tuple per RFC 7946', () => {
    const [lng, lat] = csToGeoArray({ x: CS1_WORLD_HALF, z: -CS1_WORLD_HALF });
    // CS1 NE corner: east (+lng), CS1-north → negative lat in south-up convention
    expect(lng).toBeGreaterThan(0);
    expect(lat).toBeLessThan(0);
  });

  it('first element is longitude (east-west), second is latitude (north-south)', () => {
    // A point with distinct x and z to verify order isn't swapped
    const [lng, lat] = csToGeoArray({ x: 4320, z: 0 });
    const geo = csToGeo({ x: 4320, z: 0 });
    expect(lng).toBe(geo.lng);
    expect(lat).toBe(geo.lat);
  });

  it('csToGeoArray result is consistent with csToGeo', () => {
    const point = { x: -1500, z: 3000 };
    const geo = csToGeo(point);
    const [lng, lat] = csToGeoArray(point);
    expect(lng).toBe(geo.lng);
    expect(lat).toBe(geo.lat);
  });
});

// ─── Scale symmetry ───────────────────────────────────────────────────────────

describe('scale symmetry', () => {
  it('X and Z axes are scaled identically (square world)', () => {
    const fromX = csToGeo({ x: 5000, z: 0 });
    const fromZ = csToGeo({ x: 0, z: 5000 });
    // Both should have the same absolute degree offset
    expectClose(Math.abs(fromX.lng), Math.abs(fromZ.lat));
  });

  it('midpoint of world maps to midpoint of geographic extent', () => {
    const mid = csToGeo({ x: CS1_WORLD_HALF / 2, z: 0 });
    expectClose(mid.lng, CS1_HALF_EXTENT_DEG / 2);
  });
});

// ─── Inverse property ─────────────────────────────────────────────────────────

describe('geoToCs is the exact inverse of csToGeo', () => {
  it('csToGeo(geoToCs(g)) ≈ g for the bounding box midpoints', () => {
    const geoPoints = [
      { lng: CS1_HALF_EXTENT_DEG, lat: 0 },
      { lng: 0, lat: -CS1_HALF_EXTENT_DEG },
      { lng: -CS1_HALF_EXTENT_DEG / 3, lat: CS1_HALF_EXTENT_DEG / 7 },
    ];
    for (const g of geoPoints) {
      const cs = geoToCs(g);
      const back = csToGeo(cs);
      expectClose(back.lng, g.lng);
      expectClose(back.lat, g.lat);
    }
  });
});
