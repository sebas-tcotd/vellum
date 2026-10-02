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
 * The four shapes the spike's evidence needs (Epic 4): a minimal network, a
 * dense one with shared corridors, one whose interest is transfers between
 * modes, and one with a real geometric crossing.
 *
 * @remarks
 * Built from the existing factories with explicit coordinates: core has no
 * `.cslmap`, and a fixture should not need a binary file to be readable. The
 * positions are deterministic and represent no real city, so no invented data
 * is ever presented as coming from the game.
 */
export type TransitFixtureId = 'simple' | 'dense' | 'transfer' | 'crossing';

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

/**
 * Crossing network: two corridors that genuinely intersect in the plane without
 * sharing a node, plus a third line doubling one of them.
 *
 * @remarks
 * The one thing the other three fixtures cannot produce. Their corridors only
 * ever meet at shared nodes, and a shared endpoint is not a crossing — so the
 * crossings metric was reported on every run without a single fixture ever
 * exercising a non-zero value, which is a measurement nobody had checked. Two
 * diagonals over separate road segments (a flyover, as far as the road graph is
 * concerned: no junction where they pass) cross exactly once in the geographic
 * baseline, and what each schematic geometry does with that crossing is the
 * comparative evidence Story 4.4 reads.
 */
export function crossingTransitCity(): CityData {
  return makeCityData({
    cityName: 'Fixture Crossing',
    roadNodes: [
      node('a0', 0, 0),
      node('a1', 1200, 1200),
      node('b0', 0, 1200),
      node('b1', 1200, 0),
    ],
    roadSegments: [
      makeRoadSegment({ id: 'up', startNodeId: 'a0', endNodeId: 'a1' }),
      makeRoadSegment({ id: 'down', startNodeId: 'b0', endNodeId: 'b1' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'X1',
        name: 'Rising diagonal',
        mode: 'Bus',
        color: '#e6194b',
        stops: [stop('c0', 0, 0), stop('c1', 1200, 1200)],
        route: [{ segmentIds: ['up'] }],
      }),
      makeTransitLine({
        id: 'X2',
        name: 'Falling diagonal',
        mode: 'Tram',
        color: '#4363d8',
        stops: [stop('c2', 0, 1200, 'Tram'), stop('c3', 1200, 0, 'Tram')],
        route: [{ segmentIds: ['down'] }],
      }),
      makeTransitLine({
        id: 'X3',
        // Doubles the rising diagonal, so the crossing is between a two-line
        // corridor and a single-line one — the case where offsets and crossings
        // interact.
        name: 'Rising express',
        mode: 'Bus',
        color: '#3cb44b',
        stops: [stop('c0', 0, 0), stop('c1', 1200, 1200)],
        route: [{ segmentIds: ['up'] }],
      }),
    ],
  });
}

/** The four fixtures, in the order the report lists them. */
export const TRANSIT_FIXTURES: readonly {
  readonly id: TransitFixtureId;
  readonly build: () => CityData;
}[] = Object.freeze([
  { id: 'simple' as const, build: simpleTransitCity },
  { id: 'dense' as const, build: denseTransitCity },
  { id: 'transfer' as const, build: transferTransitCity },
  { id: 'crossing' as const, build: crossingTransitCity },
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

// ─── Station terminals (Story 4.6) ───────────────────────────────────────────

const stationStop = (
  id: string,
  x: number,
  z: number,
  stationId: string,
  mode: TransitStop['mode'] = 'Bus',
): TransitStop => ({ ...stop(id, x, z, mode), stationId });

/**
 * A bus terminal whose bays share no node with the street, like Costa Tijuca's
 * `41618`: line `B1` drives along the street, jumps into a loop of bays (two
 * stops of station `T`) and jumps back out. `B2` only drives the street.
 */
export function looseTerminalCity(): CityData {
  return makeCityData({
    cityName: 'Fixture Loose Terminal',
    source: 'vellummap',
    roadNodes: [
      node('a', 0, 0),
      node('b', 200, 0),
      node('c', 400, 0),
      node('d', 600, 0),
      node('t1', 180, 60),
      node('t2', 220, 60),
      node('t3', 220, 90),
      node('t4', 180, 90),
    ],
    roadSegments: [
      makeRoadSegment({ id: 'sa', startNodeId: 'a', endNodeId: 'b' }),
      makeRoadSegment({ id: 'sb', startNodeId: 'b', endNodeId: 'c' }),
      makeRoadSegment({ id: 'sc', startNodeId: 'c', endNodeId: 'd' }),
      makeRoadSegment({ id: 'tb1', startNodeId: 't1', endNodeId: 't2' }),
      makeRoadSegment({ id: 'tb2', startNodeId: 't2', endNodeId: 't3' }),
      makeRoadSegment({ id: 'tb3', startNodeId: 't3', endNodeId: 't4' }),
      makeRoadSegment({ id: 'tb4', startNodeId: 't4', endNodeId: 't1' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'B1',
        name: 'Bus 1',
        color: '#e6194b',
        stops: [
          stop('p0', 0, 0),
          stationStop('s1', 190, 60, 'T'),
          stationStop('s2', 210, 60, 'T'),
          stop('p3', 600, 0),
        ],
        route: [{ segmentIds: ['sa', 'tb1', 'tb2', 'tb3', 'tb4', 'sb', 'sc'] }],
      }),
      makeTransitLine({
        id: 'B2',
        name: 'Bus 2',
        color: '#3cb44b',
        stops: [stop('p0', 0, 0), stop('p3', 600, 0)],
        route: [{ segmentIds: ['sa', 'sb', 'sc'] }],
      }),
    ],
  });
}

/**
 * A bus terminal joined to the street by spokes: `B1` turns off the street at
 * `b`, runs through the bays (`e1` → `u` → `e2`, two stops of station `T`) and
 * rejoins at `c`. `B2` stays on the street. With `sameSide`, `B3` enters by the
 * `r1` spoke, turns in the terminal and leaves by the same spoke. With
 * `passing`, `B4` touches the bay node `e1` without stopping.
 */
export function connectedTerminalCity(
  options: { sameSide?: boolean; passing?: boolean } = {},
): CityData {
  const lines = [
    makeTransitLine({
      id: 'B1',
      name: 'Bus 1',
      color: '#e6194b',
      stops: [
        stop('p0', 0, 0),
        stationStop('s1', 190, 50, 'T'),
        stationStop('s2', 210, 50, 'T'),
        stop('p3', 400, 0),
      ],
      route: [{ segmentIds: ['sa', 'r1', 'i1', 'i2', 'r2', 'sd'] }],
    }),
    makeTransitLine({
      id: 'B2',
      name: 'Bus 2',
      color: '#3cb44b',
      stops: [stop('p0', 0, 0), stop('p3', 400, 0)],
      route: [{ segmentIds: ['sa', 'sbc', 'sd'] }],
    }),
  ];
  if (options.sameSide) {
    lines.push(
      makeTransitLine({
        id: 'B3',
        name: 'Bus 3',
        color: '#4363d8',
        stops: [stop('p0', 0, 0), stationStop('s1', 190, 50, 'T')],
        route: [{ segmentIds: ['sa', 'r1', 'i1', 'i1', 'r1', 'sa'] }],
      }),
    );
  }
  if (options.passing) {
    lines.push(
      makeTransitLine({
        id: 'B4',
        name: 'Bus 4',
        color: '#f58231',
        stops: [stop('w0', 100, 40), stop('w1', -100, 40)],
        route: [{ segmentIds: ['x1', 'x0'] }],
      }),
    );
  }
  return makeCityData({
    cityName: 'Fixture Connected Terminal',
    source: 'vellummap',
    roadNodes: [
      node('a', 0, 0),
      node('b', 180, 0),
      node('c', 220, 0),
      node('d', 400, 0),
      node('e1', 180, 40),
      node('u', 200, 75),
      node('e2', 220, 40),
      node('w', 100, 40),
      node('v', -100, 40),
    ],
    roadSegments: [
      makeRoadSegment({ id: 'sa', startNodeId: 'a', endNodeId: 'b' }),
      makeRoadSegment({ id: 'sbc', startNodeId: 'b', endNodeId: 'c' }),
      makeRoadSegment({ id: 'sd', startNodeId: 'c', endNodeId: 'd' }),
      makeRoadSegment({
        id: 'r1',
        startNodeId: 'b',
        endNodeId: 'e1',
        points: [{ x: 180, y: 0, z: 20 }],
      }),
      makeRoadSegment({ id: 'i1', startNodeId: 'e1', endNodeId: 'u' }),
      makeRoadSegment({ id: 'i2', startNodeId: 'u', endNodeId: 'e2' }),
      makeRoadSegment({ id: 'r2', startNodeId: 'e2', endNodeId: 'c' }),
      makeRoadSegment({ id: 'x1', startNodeId: 'e1', endNodeId: 'w' }),
      makeRoadSegment({ id: 'x0', startNodeId: 'w', endNodeId: 'v' }),
    ],
    transitLines: lines,
  });
}

/**
 * One station (`A`) with a metro platform and a bus stop 65 m apart, like San
 * Rico's airport `11692`: two parts, each with its own node in reach.
 */
export function splitStationCity(): CityData {
  return makeCityData({
    cityName: 'Fixture Split Station',
    source: 'vellummap',
    roadNodes: [
      node('mA', -300, 510),
      node('mN', 0, 510),
      node('mB', 300, 510),
      node('bA', 65, 200),
      node('bN', 65, 490),
      node('bB', 65, 800),
    ],
    roadSegments: [
      makeRoadSegment({ id: 'm1', startNodeId: 'mA', endNodeId: 'mN' }),
      makeRoadSegment({ id: 'm2', startNodeId: 'mN', endNodeId: 'mB' }),
      makeRoadSegment({ id: 'b1', startNodeId: 'bA', endNodeId: 'bN' }),
      makeRoadSegment({ id: 'b2', startNodeId: 'bN', endNodeId: 'bB' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'M',
        name: 'Metro',
        color: '#911eb4',
        mode: 'Metro',
        stops: [
          stop('ma', -300, 510, 'Metro'),
          stationStop('pm', 0, 500, 'A', 'Metro'),
          stop('mb', 300, 510, 'Metro'),
        ],
        route: [{ segmentIds: ['m1', 'm2'] }],
      }),
      makeTransitLine({
        id: 'B',
        name: 'Bus',
        color: '#e6194b',
        stops: [
          stop('ba', 65, 200),
          stationStop('pb', 65, 500, 'A'),
          stop('bb', 65, 800),
        ],
        route: [{ segmentIds: ['b1', 'b2'] }],
      }),
    ],
  });
}
