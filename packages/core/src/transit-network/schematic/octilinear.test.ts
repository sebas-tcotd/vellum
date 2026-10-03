import { describe, expect, it } from 'vitest';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
  TRANSIT_FIXTURES,
  transitFixture,
} from '../../testing';
import type { CityData, RoadNode } from '../../types/city-data';
import { deriveTransitNetwork } from '../index';
import { geographicSchematicLayout } from './geographic';
import { schematicLayoutDiagnostics } from './grid-layout';
import {
  createOctilinearGrid,
  isOctilinearConformant,
  octilinearSchematicLayout,
  octilinearViolations,
} from './octilinear';

describe('octilinear grid size', () => {
  it('gives a city the size of San Rico (656 nodes) 112 cells per side', () => {
    // Story 4.7: at the old cap of 48, San Rico's corridors fell back to a
    // straight line far more often (ADR-0007).
    const seeds = Array.from({ length: 656 }, (_, i) => ({
      x: (i % 26) * 100,
      y: Math.floor(i / 26) * 100,
    }));
    expect(createOctilinearGrid(seeds).cellCount).toBe(112 * 112);
  });
});

const node = (id: string, x: number, z: number): RoadNode => ({
  id,
  position: { x, y: 0, z },
});

describe('octilinearSchematicLayout', () => {
  it.each(TRANSIT_FIXTURES.map((f) => [f.id, f.build] as const))(
    'draws every stroke at a multiple of 45° (%s)',
    (_id, build) => {
      const layout = octilinearSchematicLayout(deriveTransitNetwork(build()));
      expect(octilinearViolations(layout)).toEqual([]);
      expect(isOctilinearConformant(layout)).toBe(true);
    },
  );

  it('is deterministic, frozen, and does not mutate the network', () => {
    const cityData = transitFixture('dense');
    const network = deriveTransitNetwork(cityData);
    const before = JSON.stringify([...network.edges.values()]);
    const a = octilinearSchematicLayout(network);
    const b = octilinearSchematicLayout(network);
    expect(a).toEqual(b);
    expect(JSON.stringify([...network.edges.values()])).toBe(before);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.segments)).toBe(true);
    expect(Object.isFrozen(a.segments[0])).toBe(true);
    expect(Object.isFrozen(a.segments[0].points)).toBe(true);
    expect(Object.isFrozen(a.stations[0])).toBe(true);
  });

  it('draws the same strokes and stations as the geographic baseline', () => {
    const network = deriveTransitNetwork(transitFixture('transfer'));
    const base = geographicSchematicLayout(network);
    const layout = octilinearSchematicLayout(network);
    expect(layout.segments.map((s) => s.lineId)).toEqual(
      base.segments.map((s) => s.lineId),
    );
    expect(layout.segments.map((s) => s.color)).toEqual(
      base.segments.map((s) => s.color),
    );
    expect(layout.stations.map((s) => s.id)).toEqual(
      base.stations.map((s) => s.id),
    );
    expect(layout.stations.map((s) => [...s.lineIds])).toEqual(
      base.stations.map((s) => [...s.lineIds]),
    );
  });

  it('keeps every point inside the viewBox', () => {
    const layout = octilinearSchematicLayout(
      deriveTransitNetwork(transitFixture('dense')),
    );
    const { width, height } = layout.bounds;
    for (const segment of layout.segments) {
      for (const p of segment.points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(width);
        expect(p.y).toBeLessThanOrEqual(height);
      }
    }
  });

  /**
   * Two junctions closer together than one grid step want the same cell. The
   * second one has to move, because two stations sharing a cell would draw one
   * symbol where the network has two.
   */
  it('relocates a node whose cell is already taken', () => {
    const collidingCity = (): CityData =>
      makeCityData({
        roadNodes: [
          node('n1', 0, 0),
          node('n2', 1000, 0),
          // Within one grid step of n1, and in another component, so corridor
          // contraction cannot merge them away.
          node('n3', 10, 10),
          node('n4', 0, 1000),
        ],
        roadSegments: [
          makeRoadSegment({ id: 'a', startNodeId: 'n1', endNodeId: 'n2' }),
          makeRoadSegment({ id: 'b', startNodeId: 'n3', endNodeId: 'n4' }),
        ],
        transitLines: [
          makeTransitLine({ id: 'A', route: [{ segmentIds: ['a'] }] }),
          makeTransitLine({ id: 'B', route: [{ segmentIds: ['b'] }] }),
        ],
      });
    const layout = octilinearSchematicLayout(
      deriveTransitNetwork(collidingCity()),
    );
    const diagnostics = schematicLayoutDiagnostics(layout);
    // At least the colliding node moved; the set-to-set search of Story 4.9
    // may move another one too when that is cheaper (`octi` §4.2).
    expect(diagnostics?.relocatedNodes).toBeGreaterThanOrEqual(1);
    // Still conformant after the relocation: moving a node changes which cell
    // a route starts from, never the grammar it is routed with.
    expect(octilinearViolations(layout)).toEqual([]);
    // And the two corridors do not start from the same point.
    const starts = layout.segments.map(
      (s) => `${s.points[0].x},${s.points[0].y}`,
    );
    expect(new Set(starts).size).toBe(2);
  });

  it('returns the baseline empty layout for a city without transit', () => {
    const network = deriveTransitNetwork(makeCityData({ transitLines: [] }));
    expect(octilinearSchematicLayout(network)).toEqual(
      geographicSchematicLayout(network),
    );
  });
});
