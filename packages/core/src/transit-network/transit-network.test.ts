import { describe, it, expect } from 'vitest';
import { makeCityData, makeRoadSegment, makeTransitLine } from '../testing';
import type { CityData, RoadNode, TransitStop } from '../types/city-data';
import { deriveTransitNetwork } from './index';
import { STATION_MERGE_THRESHOLD_M } from './stops';

function node(id: string, x: number, z: number): RoadNode {
  return { id, position: { x, y: 0, z } };
}

function seg(id: string, from: string, to: string) {
  return makeRoadSegment({ id, startNodeId: from, endNodeId: to });
}

function stop(id: string, x: number, z: number): TransitStop {
  return { id, mode: 'Bus', position: { x, y: 0, z }, name: `Stop ${id}` };
}

/** Straight chain a—b—c, three lines all riding the same two segments. */
function sharedCorridorCity(): CityData {
  return makeCityData({
    roadNodes: [
      node('node-a', 0, 0),
      node('node-b', 100, 0),
      node('node-c', 200, 0),
    ],
    roadSegments: [
      seg('seg-1', 'node-a', 'node-b'),
      seg('seg-2', 'node-b', 'node-c'),
    ],
    transitLines: [
      makeTransitLine({
        id: 'L1',
        route: [{ segmentIds: ['seg-1', 'seg-2'] }],
      }),
      makeTransitLine({
        id: 'L2',
        route: [{ segmentIds: ['seg-1', 'seg-2'] }],
      }),
      makeTransitLine({
        id: 'L3',
        route: [{ segmentIds: ['seg-1', 'seg-2'] }],
      }),
    ],
  });
}

describe('deriveTransitNetwork — empty city', () => {
  it('derives a frozen, empty network when there is no transit', () => {
    const network = deriveTransitNetwork(makeCityData({ transitLines: [] }));

    expect(network.edges.size).toBe(0);
    expect(network.nodes.size).toBe(0);
    expect(network.lines.size).toBe(0);
    expect(network.bundles.size).toBe(0);
    expect(network.transitions).toEqual([]);
    expect(network.stops).toEqual([]);
    expect(network.transferCandidates).toEqual([]);
    expect(Object.isFrozen(network)).toBe(true);
  });
});

describe('deriveTransitNetwork — shared corridor', () => {
  it('collapses three co-running lines into one corridor and one bundle of weight 3', () => {
    const network = deriveTransitNetwork(sharedCorridorCity());

    expect(network.edges.size).toBe(1);
    expect(network.bundles.size).toBe(1);

    const bundle = [...network.bundles.values()][0];
    expect(bundle.weight).toBe(3);
    expect(bundle.lineIds).toEqual(['L1', 'L2', 'L3']);

    const edgeId = [...network.edges.keys()][0];
    expect(network.lineOrder.get(edgeId)).toEqual(['L1', 'L2', 'L3']);
  });
});

describe('deriveTransitNetwork — circular route', () => {
  const ringCity = makeCityData({
    roadNodes: [
      node('node-a', 0, 0),
      node('node-b', 100, 0),
      node('node-c', 50, 100),
    ],
    roadSegments: [
      seg('seg-1', 'node-a', 'node-b'),
      seg('seg-2', 'node-b', 'node-c'),
      seg('seg-3', 'node-c', 'node-a'),
    ],
    transitLines: [
      makeTransitLine({
        id: 'R1',
        route: [{ segmentIds: ['seg-1', 'seg-2', 'seg-3'] }],
        // A circular route repeats its terminal stop.
        stops: [stop('s1', 0, 0), stop('s2', 100, 0), stop('s1', 0, 0)],
      }),
    ],
  });

  it('produces a ring corridor (nodeA === nodeB)', () => {
    const network = deriveTransitNetwork(ringCity);
    const edge = [...network.edges.values()][0];

    expect(network.edges.size).toBe(1);
    expect(edge.nodeA).toBe(edge.nodeB);
    expect(edge.segmentIds).toHaveLength(3);
  });

  it('deduplicates the repeated terminal stop', () => {
    const network = deriveTransitNetwork(ringCity);

    expect(network.stops.map((s) => s.stopId)).toEqual(['s1', 's2']);
  });

  it('adds the wrap-around transition when the loop is split by spurs', () => {
    const network = deriveTransitNetwork(
      makeCityData({
        roadNodes: [
          node('A', 0, 0),
          node('B', 200, 0),
          node('C', 100, 170),
          node('sa', -60, -60),
          node('sb', 260, -60),
          node('sc', 100, 240),
        ],
        roadSegments: [
          seg('AB', 'A', 'B'),
          seg('BC', 'B', 'C'),
          seg('CA', 'C', 'A'),
          seg('spurA', 'A', 'sa'),
          seg('spurB', 'B', 'sb'),
          seg('spurC', 'C', 'sc'),
        ],
        transitLines: [
          makeTransitLine({
            id: 'L',
            route: [{ segmentIds: ['AB', 'BC', 'CA'] }],
          }),
          makeTransitLine({ id: 'spA', route: [{ segmentIds: ['spurA'] }] }),
          makeTransitLine({ id: 'spB', route: [{ segmentIds: ['spurB'] }] }),
          makeTransitLine({ id: 'spC', route: [{ segmentIds: ['spurC'] }] }),
        ],
      }),
    );

    const loop = network.transitions.filter((t) => t.lineId === 'L');
    expect(loop).toHaveLength(3);
    expect(new Set(loop.map((t) => t.nodeId))).toEqual(
      new Set(['A', 'B', 'C']),
    );
  });
});

describe('deriveTransitNetwork — transfer candidates', () => {
  function twoLineStopCity(separationM: number): CityData {
    return makeCityData({
      roadNodes: [node('node-a', 0, 0), node('node-b', 500, 0)],
      roadSegments: [seg('seg-1', 'node-a', 'node-b')],
      transitLines: [
        makeTransitLine({
          id: 'A',
          route: [{ segmentIds: ['seg-1'] }],
          stops: [stop('a-stop', 0, 0)],
        }),
        makeTransitLine({
          id: 'B',
          route: [{ segmentIds: ['seg-1'] }],
          stops: [stop('b-stop', separationM, 0)],
        }),
      ],
    });
  }

  it('merges stops of different lines within the threshold into one candidate', () => {
    const network = deriveTransitNetwork(
      twoLineStopCity(STATION_MERGE_THRESHOLD_M),
    );

    expect(network.transferCandidates).toHaveLength(1);
    expect(network.transferCandidates[0].map((e) => e.lineId).sort()).toEqual([
      'A',
      'B',
    ]);
  });

  it('keeps stops beyond the threshold as separate single-line candidates', () => {
    const network = deriveTransitNetwork(
      twoLineStopCity(STATION_MERGE_THRESHOLD_M + 1),
    );

    expect(network.transferCandidates).toHaveLength(2);
    for (const candidate of network.transferCandidates) {
      expect(candidate).toHaveLength(1);
    }
  });
});

describe('deriveTransitNetwork — missing segment reference', () => {
  it('drops the unknown segment and keeps the rest of the route connected', () => {
    const network = deriveTransitNetwork(
      makeCityData({
        roadNodes: [
          node('node-a', 0, 0),
          node('node-b', 100, 0),
          node('node-c', 200, 0),
        ],
        roadSegments: [
          seg('seg-1', 'node-a', 'node-b'),
          seg('seg-2', 'node-b', 'node-c'),
        ],
        transitLines: [
          makeTransitLine({
            id: 'L1',
            route: [{ segmentIds: ['seg-1', 'seg-ghost', 'seg-2'] }],
          }),
        ],
      }),
    );

    expect(network.segmentToCorridor.has('seg-ghost')).toBe(false);
    expect(network.segmentToCorridor.has('seg-1')).toBe(true);
    expect(network.segmentToCorridor.has('seg-2')).toBe(true);
    expect(network.edges.size).toBe(1);
  });
});

describe('deriveTransitNetwork — unknown / DLC mode', () => {
  it('keeps an Unknown-mode line in the graph and orders it last', () => {
    const network = deriveTransitNetwork(
      makeCityData({
        roadNodes: [node('node-a', 0, 0), node('node-b', 100, 0)],
        roadSegments: [seg('seg-1', 'node-a', 'node-b')],
        transitLines: [
          makeTransitLine({
            id: 'U',
            mode: 'Unknown',
            route: [{ segmentIds: ['seg-1'] }],
          }),
          makeTransitLine({
            id: 'M',
            mode: 'Metro',
            route: [{ segmentIds: ['seg-1'] }],
          }),
        ],
      }),
    );

    expect(network.lines.get('U')?.mode).toBe('Unknown');
    const edgeId = [...network.edges.keys()][0];
    expect(network.lineOrder.get(edgeId)).toEqual(['M', 'U']);
  });
});

describe('deriveTransitNetwork — extensions', () => {
  it('attaches typed line attributes and ignores unknown ids', () => {
    const network = deriveTransitNetwork(sharedCorridorCity(), {
      lineAttributes: {
        L1: { headwayMinutes: 5 },
        'does-not-exist': { headwayMinutes: 99 },
      },
    });

    expect(network.lines.get('L1')?.attributes).toEqual({ headwayMinutes: 5 });
    expect(network.lines.get('L2')?.attributes).toBeUndefined();
  });

  it('leaves attributes undefined when derived without extensions', () => {
    const network = deriveTransitNetwork(sharedCorridorCity());

    for (const line of network.lines.values()) {
      expect(line.attributes).toBeUndefined();
    }
  });
});

describe('deriveTransitNetwork — determinism', () => {
  it('derives structurally identical networks for the same city', () => {
    const city = sharedCorridorCity();
    const a = deriveTransitNetwork(city);
    const b = deriveTransitNetwork(city);

    const shape = (n: typeof a) => ({
      edges: [...n.edges.entries()],
      nodes: [...n.nodes.entries()],
      lines: [...n.lines.entries()],
      bundles: [...n.bundles.entries()],
      components: n.components,
      lineOrder: [...n.lineOrder.entries()],
      bundleOrder: [...n.bundleOrder.entries()],
      transitions: n.transitions,
      stats: n.stats,
      stops: n.stops,
      transferCandidates: n.transferCandidates,
    });

    expect(shape(a)).toEqual(shape(b));
  });
});
