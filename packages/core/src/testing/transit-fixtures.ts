// packages/core/src/testing/transit-fixtures.ts
// Transit-network fixtures for the schematic layout gates (Story 4.3).
// Import from '@vellum/core/testing' — never from the main barrel.
// English, like the schematic modules these fixtures exist for.
import type { CityData, RoadNode, TransitStop } from '../types/city-data';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from './city-data-factory';

/**
 * The three sizes the spike's evidence needs (Epic 4): a minimal network, a
 * dense one with shared corridors, and one whose interest is transfers between
 * modes.
 *
 * @remarks
 * Built from the existing factories with explicit coordinates: core has no
 * `.cslmap`, and a fixture should not need a binary file to be readable. The
 * positions are deterministic and represent no real city, so no invented data
 * is ever presented as coming from the game.
 */
export type TransitFixtureId = 'simple' | 'dense' | 'transfer';

const node = (id: string, x: number, z: number): RoadNode => ({
  id,
  position: { x, y: 0, z },
});

const stop = (
  id: string,
  x: number,
  z: number,
  mode: TransitStop['mode'] = 'Bus',
): TransitStop => ({ id, mode, position: { x, y: 0, z }, name: `Stop ${id}` });

/** Minimal network: one L-shaped corridor, two lines, one shared stop. */
export function simpleTransitCity(): CityData {
  return makeCityData({
    cityName: 'Fixture Simple',
    roadNodes: [node('n1', 0, 0), node('n2', 400, 0), node('n3', 400, 600)],
    roadSegments: [
      makeRoadSegment({ id: 's1', startNodeId: 'n1', endNodeId: 'n2' }),
      makeRoadSegment({ id: 's2', startNodeId: 'n2', endNodeId: 'n3' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'L1',
        name: 'Line 1',
        color: '#e6194b',
        stops: [stop('p1', 0, 0), stop('p2', 400, 600)],
        route: [{ segmentIds: ['s1', 's2'] }],
      }),
      makeTransitLine({
        id: 'L2',
        name: 'Line 2',
        color: '#3cb44b',
        stops: [stop('p1', 0, 0), stop('p3', 400, 0)],
        route: [{ segmentIds: ['s1'] }],
      }),
    ],
  });
}

/**
 * Dense network: a 3×3 grid of nodes with five lines that share corridors, which
 * is the case where the router has to negotiate occupancy and turns.
 */
export function denseTransitCity(): CityData {
  const grid: RoadNode[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      grid.push(node(`g${row}${col}`, col * 500, row * 500));
    }
  }
  const segments = [
    // Rows.
    makeRoadSegment({ id: 'h00', startNodeId: 'g00', endNodeId: 'g01' }),
    makeRoadSegment({ id: 'h01', startNodeId: 'g01', endNodeId: 'g02' }),
    makeRoadSegment({ id: 'h10', startNodeId: 'g10', endNodeId: 'g11' }),
    makeRoadSegment({ id: 'h11', startNodeId: 'g11', endNodeId: 'g12' }),
    makeRoadSegment({ id: 'h20', startNodeId: 'g20', endNodeId: 'g21' }),
    makeRoadSegment({ id: 'h21', startNodeId: 'g21', endNodeId: 'g22' }),
    // Columns.
    makeRoadSegment({ id: 'v00', startNodeId: 'g00', endNodeId: 'g10' }),
    makeRoadSegment({ id: 'v10', startNodeId: 'g10', endNodeId: 'g20' }),
    makeRoadSegment({ id: 'v01', startNodeId: 'g01', endNodeId: 'g11' }),
    makeRoadSegment({ id: 'v11', startNodeId: 'g11', endNodeId: 'g21' }),
    makeRoadSegment({ id: 'v02', startNodeId: 'g02', endNodeId: 'g12' }),
    makeRoadSegment({ id: 'v12', startNodeId: 'g12', endNodeId: 'g22' }),
  ];
  return makeCityData({
    cityName: 'Fixture Dense',
    roadNodes: grid,
    roadSegments: segments,
    transitLines: [
      makeTransitLine({
        id: 'D1',
        name: 'Crosstown',
        mode: 'Bus',
        color: '#e6194b',
        stops: [stop('d0', 0, 0), stop('d1', 500, 0), stop('d2', 1000, 0)],
        route: [{ segmentIds: ['h00', 'h01'] }],
      }),
      makeTransitLine({
        id: 'D2',
        name: 'Midtown',
        mode: 'Bus',
        color: '#3cb44b',
        stops: [
          stop('d3', 0, 500),
          stop('d4', 500, 500),
          stop('d5', 1000, 500),
        ],
        route: [{ segmentIds: ['h10', 'h11'] }],
      }),
      makeTransitLine({
        id: 'D3',
        name: 'West line',
        mode: 'Tram',
        color: '#4363d8',
        stops: [stop('d0', 0, 0, 'Tram'), stop('d6', 0, 1000, 'Tram')],
        route: [{ segmentIds: ['v00', 'v10'] }],
      }),
      makeTransitLine({
        id: 'D4',
        name: 'Centre line',
        mode: 'Tram',
        color: '#f58231',
        stops: [stop('d1', 500, 0, 'Tram'), stop('d7', 500, 1000, 'Tram')],
        route: [{ segmentIds: ['v01', 'v11'] }],
      }),
      makeTransitLine({
        id: 'D5',
        // Shares 'h10' and 'h11' with D2, and rides 'v12' alone: one corridor
        // carrying two lines and one carrying a single line, which is where
        // `bundles` stops being trivial.
        name: 'Loop service',
        mode: 'Bus',
        color: '#911eb4',
        stops: [stop('d4', 500, 500), stop('d8', 1000, 1000)],
        route: [{ segmentIds: ['h10', 'h11', 'v12'] }],
      }),
    ],
  });
}

/**
 * Transfer network: three modes meeting at a single station. The interest is the
 * shared station's `lineIds` membership, not density. Its hub also falls exactly
 * on the centroid of the node cloud, which is the orthoradial grid's degenerate
 * centre ring.
 */
export function transferTransitCity(): CityData {
  return makeCityData({
    cityName: 'Fixture Transfer',
    roadNodes: [
      node('t0', 0, 0),
      node('hub', 600, 0),
      node('t1', 1200, 0),
      node('t2', 600, 700),
      node('t3', 600, -700),
    ],
    roadSegments: [
      makeRoadSegment({ id: 'w', startNodeId: 't0', endNodeId: 'hub' }),
      makeRoadSegment({ id: 'e', startNodeId: 'hub', endNodeId: 't1' }),
      makeRoadSegment({ id: 's', startNodeId: 'hub', endNodeId: 't2' }),
      makeRoadSegment({ id: 'n', startNodeId: 'hub', endNodeId: 't3' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'T1',
        name: 'Bus east-west',
        mode: 'Bus',
        color: '#e6194b',
        stops: [stop('x0', 0, 0), stop('hubStop', 600, 0), stop('x1', 1200, 0)],
        route: [{ segmentIds: ['w', 'e'] }],
      }),
      makeTransitLine({
        id: 'T2',
        name: 'Tram south',
        mode: 'Tram',
        color: '#4363d8',
        stops: [stop('hubStop', 600, 0, 'Tram'), stop('x2', 600, 700, 'Tram')],
        route: [{ segmentIds: ['s'] }],
      }),
      makeTransitLine({
        id: 'T3',
        name: 'Metro north',
        mode: 'Metro',
        color: '#f58231',
        stops: [
          stop('hubStop', 600, 0, 'Metro'),
          stop('x3', 600, -700, 'Metro'),
        ],
        route: [{ segmentIds: ['n'] }],
      }),
      makeTransitLine({
        id: 'T4',
        // A second bus line over the same west corridor: that corridor now
        // carries two lines, so its bundle stops being a singleton.
        name: 'Bus west shuttle',
        mode: 'Bus',
        color: '#3cb44b',
        stops: [stop('x0', 0, 0), stop('hubStop', 600, 0)],
        route: [{ segmentIds: ['w'] }],
      }),
    ],
  });
}

/** The three fixtures, in the order the report lists them. */
export const TRANSIT_FIXTURES: readonly {
  readonly id: TransitFixtureId;
  readonly build: () => CityData;
}[] = Object.freeze([
  { id: 'simple' as const, build: simpleTransitCity },
  { id: 'dense' as const, build: denseTransitCity },
  { id: 'transfer' as const, build: transferTransitCity },
]);

/**
 * One fixture by id.
 *
 * @remarks
 * Tests name the fixture they mean instead of indexing {@link TRANSIT_FIXTURES}
 * by position: reordering or adding a fixture must not silently repoint a test
 * at different data. An unknown id throws rather than yielding `undefined`,
 * because a test measuring `undefined` would pass for the wrong reason.
 */
export function transitFixture(id: TransitFixtureId): CityData {
  const found = TRANSIT_FIXTURES.find((fixture) => fixture.id === id);
  if (!found) throw new Error(`UNKNOWN_TRANSIT_FIXTURE: ${id}`);
  return found.build();
}
