import { describe, it, expect } from 'vitest';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import type { RoadNode } from '@vellum/core';
import { buildTransitLineGraph, continuationKey } from './line-graph';

function node(id: string, x: number, z: number): RoadNode {
  return { id, position: { x, y: 0, z } };
}

function seg(id: string, from: string, to: string) {
  return makeRoadSegment({ id, startNodeId: from, endNodeId: to });
}

describe('buildTransitLineGraph — corridor contraction (pruning rule 1)', () => {
  it('contracts a degree-2 same-set chain into one corridor edge', () => {
    const city = makeCityData({
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
      ],
    });

    const g = buildTransitLineGraph(city);
    expect(g.edges.size).toBe(1);
    const edge = [...g.edges.values()][0];
    expect(edge.segmentIds).toEqual(['seg-1', 'seg-2']);
    expect(edge.nodeA).toBe('node-a');
    expect(edge.nodeB).toBe('node-c');
    // Interior node is gone from the line graph.
    expect(g.nodes.has('node-b')).toBe(false);
  });

  it('does NOT contract when line sets differ at the shared node', () => {
    const city = makeCityData({
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
        makeTransitLine({ id: 'L2', route: [{ segmentIds: ['seg-1'] }] }),
      ],
    });

    const g = buildTransitLineGraph(city);
    expect(g.edges.size).toBe(2);
    expect(g.nodes.get('node-b')?.edgeIds).toHaveLength(2);
  });

  it('handles a pure ring as a self-loop corridor', () => {
    const city = makeCityData({
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
          id: 'L1',
          route: [{ segmentIds: ['seg-1', 'seg-2', 'seg-3'] }],
        }),
      ],
    });

    const g = buildTransitLineGraph(city);
    expect(g.edges.size).toBe(1);
    const edge = [...g.edges.values()][0];
    expect(edge.nodeA).toBe(edge.nodeB);
    expect(edge.segmentIds).toHaveLength(3);
  });
});

describe('buildTransitLineGraph — bundling (Lemma 4.1) and components', () => {
  it('collapses lines with identical segment membership into one bundle', () => {
    const city = makeCityData({
      roadNodes: [node('node-a', 0, 0), node('node-b', 100, 0)],
      roadSegments: [seg('seg-1', 'node-a', 'node-b')],
      transitLines: [
        makeTransitLine({ id: 'L-cw', route: [{ segmentIds: ['seg-1'] }] }),
        makeTransitLine({ id: 'L-ccw', route: [{ segmentIds: ['seg-1'] }] }),
      ],
    });

    const g = buildTransitLineGraph(city);
    expect(g.bundles.size).toBe(1);
    const bundle = [...g.bundles.values()][0];
    expect(bundle.lineIds).toEqual(['L-ccw', 'L-cw']);
    expect(bundle.weight).toBe(2);
    // A single-bundle edge imposes no ordering constraints (cutting rule 1).
    expect(g.components).toHaveLength(0);
  });

  it('groups multi-bundle edges sharing a node into one component', () => {
    // L1 and L2 get distinct signatures via private tail segments.
    const city = makeCityData({
      roadNodes: [
        node('node-a', 0, 0),
        node('node-b', 100, 0),
        node('node-c', 200, 0),
        node('node-d', 100, 100),
        node('node-t1', -100, 0),
        node('node-t2', 300, 0),
      ],
      roadSegments: [
        seg('seg-1', 'node-a', 'node-b'),
        seg('seg-2', 'node-b', 'node-c'),
        seg('seg-3', 'node-b', 'node-d'),
        seg('seg-t1', 'node-t1', 'node-a'),
        seg('seg-t2', 'node-c', 'node-t2'),
      ],
      transitLines: [
        makeTransitLine({
          id: 'L1',
          route: [{ segmentIds: ['seg-t1', 'seg-1', 'seg-2'] }],
        }),
        makeTransitLine({
          id: 'L2',
          route: [{ segmentIds: ['seg-1', 'seg-2', 'seg-t2'] }],
        }),
        makeTransitLine({ id: 'L3', route: [{ segmentIds: ['seg-3'] }] }),
      ],
    });

    const g = buildTransitLineGraph(city);
    const multi = [...g.edges.values()].filter((e) => e.bundleIds.length >= 2);
    expect(multi).toHaveLength(2); // seg-1 and seg-2 corridors
    expect(g.components).toHaveLength(1);
    expect(g.components[0]).toHaveLength(2);
  });
});

describe('buildTransitLineGraph — angular adjacency', () => {
  it('sorts incident edges CCW by departure azimuth', () => {
    // Junction at origin with arms east, north, west (atan2 azimuths 0, π/2, π).
    const city = makeCityData({
      roadNodes: [
        node('node-v', 0, 0),
        node('node-e', 100, 0),
        node('node-n', 0, 100),
        node('node-w', -100, 0),
      ],
      roadSegments: [
        seg('seg-e', 'node-v', 'node-e'),
        seg('seg-n', 'node-v', 'node-n'),
        seg('seg-w', 'node-v', 'node-w'),
      ],
      transitLines: [
        makeTransitLine({
          id: 'L1',
          route: [{ segmentIds: ['seg-w', 'seg-e'] }],
        }),
        makeTransitLine({
          id: 'L2',
          route: [{ segmentIds: ['seg-w', 'seg-n'] }],
        }),
      ],
    });

    const g = buildTransitLineGraph(city);
    const v = g.nodes.get('node-v');
    expect(v).toBeDefined();
    const arms = (v?.edgeIds ?? []).map(
      (eid) => g.edges.get(eid)?.segmentIds[0],
    );
    // CCW from azimuth 0: east (0), north (π/2), west (π).
    expect(arms).toEqual(['seg-e', 'seg-n', 'seg-w']);
  });
});

describe('buildTransitLineGraph — determinism', () => {
  it('produces identical graphs when input order is permuted', () => {
    const nodes = [
      node('node-a', 0, 0),
      node('node-b', 100, 0),
      node('node-c', 200, 0),
      node('node-d', 100, 100),
    ];
    const segments = [
      seg('seg-1', 'node-a', 'node-b'),
      seg('seg-2', 'node-b', 'node-c'),
      seg('seg-3', 'node-b', 'node-d'),
    ];
    const lines = [
      makeTransitLine({
        id: 'L1',
        route: [{ segmentIds: ['seg-1', 'seg-2'] }],
      }),
      makeTransitLine({
        id: 'L2',
        route: [{ segmentIds: ['seg-1', 'seg-3'] }],
      }),
    ];

    const g1 = buildTransitLineGraph(
      makeCityData({
        roadNodes: nodes,
        roadSegments: segments,
        transitLines: lines,
      }),
    );
    const g2 = buildTransitLineGraph(
      makeCityData({
        roadNodes: [...nodes].reverse(),
        roadSegments: [...segments].reverse(),
        transitLines: [...lines].reverse(),
      }),
    );

    expect([...g1.edges.keys()].sort()).toEqual([...g2.edges.keys()].sort());
    for (const [eid, e1] of g1.edges) {
      const e2 = g2.edges.get(eid);
      expect(e2?.nodeA).toBe(e1.nodeA);
      expect(e2?.nodeB).toBe(e1.nodeB);
      expect(e2?.bundleIds).toEqual(e1.bundleIds);
      expect(e2?.segmentIds).toEqual(e1.segmentIds);
    }
  });
});

describe('buildTransitLineGraph — route-based transitions (paper §5 continuations)', () => {
  it('a simple 2-segment route yields exactly one transition (not falsely wrapped)', () => {
    const city = makeCityData({
      roadNodes: [
        node('a', 0, 0),
        node('b', 100, 0),
        node('c', 200, 0),
        node('d', 100, 100),
      ],
      roadSegments: [
        seg('s1', 'a', 'b'),
        seg('s2', 'b', 'c'),
        seg('s3', 'b', 'd'), // spur keeps b a junction (no contraction)
      ],
      transitLines: [
        makeTransitLine({ id: 'L1', route: [{ segmentIds: ['s1', 's2'] }] }),
        makeTransitLine({ id: 'L2', route: [{ segmentIds: ['s3'] }] }),
      ],
    });
    const g = buildTransitLineGraph(city);
    const l1 = g.transitions.filter((t) => t.lineId === 'L1');
    // One corridor change (s1's corridor → s2's corridor) at node b. The route
    // is open (a≠c), so NO wrap transition is added.
    expect(l1).toHaveLength(1);
    expect(l1[0].nodeId).toBe('b');
  });

  it('resolves a unique continuation at a node where a line occupies 3 corridors', () => {
    // Lollipop: T→J→P→Q→J→R. The P-Q loop contracts to a self-loop at J, so L
    // is in 3 corridors at J. Set-membership could not resolve continuation
    // (it is ambiguous); the route index must return exactly one edge per side.
    const city = makeCityData({
      roadNodes: [
        node('T', -200, 0),
        node('J', 0, 0),
        node('P', 100, 80),
        node('Q', 100, -80),
        node('R', 200, 0),
      ],
      roadSegments: [
        seg('sTJ', 'T', 'J'),
        seg('sJP', 'J', 'P'),
        seg('sPQ', 'P', 'Q'),
        seg('sQJ', 'Q', 'J'),
        seg('sJR', 'J', 'R'),
      ],
      transitLines: [
        makeTransitLine({
          id: 'L',
          route: [{ segmentIds: ['sTJ', 'sJP', 'sPQ', 'sQJ', 'sJR'] }],
        }),
      ],
    });
    const g = buildTransitLineGraph(city);
    const bid = g.bundleOfLine.get('L') ?? 'L';
    const cStem = g.segmentToCorridor.get('sTJ')!;
    const cLoop = g.segmentToCorridor.get('sJP')!;
    const cOut = g.segmentToCorridor.get('sJR')!;
    // From the incoming stem, L continues uniquely into the self-loop.
    const fromStem = g.continuationIndex.get(continuationKey('J', cStem, bid));
    expect(fromStem && [...fromStem]).toEqual([cLoop]);
    // From the loop it continues into exactly {stem, out} across its two ends.
    const fromLoop = g.continuationIndex.get(continuationKey('J', cLoop, bid));
    expect(fromLoop && [...fromLoop].sort()).toEqual([cStem, cOut].sort());
  });

  it('adds the wrap-around transition for a closed loop', () => {
    const city = makeCityData({
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
    });
    const g = buildTransitLineGraph(city);
    const loop = g.transitions.filter((t) => t.lineId === 'L');
    // Three corner transitions incl. the CA→AB wrap at node A.
    expect(loop).toHaveLength(3);
    expect(new Set(loop.map((t) => t.nodeId))).toEqual(
      new Set(['A', 'B', 'C']),
    );
  });
});
