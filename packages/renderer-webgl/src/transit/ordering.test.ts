import { describe, it, expect } from 'vitest';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import type { RoadNode } from '@vellum/core';
import { buildTransitLineGraph } from './line-graph';
import {
  computeLineOrder,
  scoreConfiguration,
  type BundleOrderConfig,
} from './ordering';

function node(id: string, x: number, z: number): RoadNode {
  return { id, position: { x, y: 0, z } };
}

function seg(id: string, from: string, to: string) {
  return makeRoadSegment({ id, startNodeId: from, endNodeId: to });
}

/**
 * Straight corridor a—b—c with a spur at b (so b stays a junction) and
 * private tails so L1/L2 keep distinct bundles.
 * The third node's id is a parameter: 'node-c' keeps both corridor edges'
 * canonical orientations aligned through b; 'node-0' opposes them. This is
 * the regression pair for the historic double-mirror propagation bug.
 */
function corridorCity(thirdNodeId: string) {
  return makeCityData({
    roadNodes: [
      node('node-a', 0, 0),
      node('node-b', 100, 0),
      node(thirdNodeId, 200, 0),
      node('node-d', 100, 100),
      node('node-t1', -100, 0),
      node('node-t2', 300, 0),
    ],
    roadSegments: [
      seg('seg-1', 'node-a', 'node-b'),
      seg('seg-2', 'node-b', thirdNodeId),
      seg('seg-3', 'node-b', 'node-d'),
      seg('seg-t1', 'node-t1', 'node-a'),
      seg('seg-t2', thirdNodeId, 'node-t2'),
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
}

function edgeByFirstSeg(
  graph: ReturnType<typeof buildTransitLineGraph>,
  segId: string,
): string {
  for (const [eid, e] of graph.edges) {
    if (e.segmentIds.includes(segId)) return eid;
  }
  throw new Error(`no edge containing ${segId}`);
}

describe('scoreConfiguration — same-segment crossings (paper Fig. 4 left)', () => {
  it('aligned canonical directions: equal stored orders are crossing-free', () => {
    const graph = buildTransitLineGraph(corridorCity('node-c'));
    const e1 = edgeByFirstSeg(graph, 'seg-1');
    const e2 = edgeByFirstSeg(graph, 'seg-2');
    const b1 = graph.bundleOfLine.get('L1') ?? 'L1';
    const b2 = graph.bundleOfLine.get('L2') ?? 'L2';

    const cfg: BundleOrderConfig = new Map();
    for (const [eid, e] of graph.edges) cfg.set(eid, e.bundleIds);
    // Both edges canonical a→b, b→c: same stored order = same physical side.
    cfg.set(e1, [b1, b2]);
    cfg.set(e2, [b1, b2]);
    expect(scoreConfiguration(graph, cfg).sameSegCrossings).toBe(0);

    // Inverting one edge's stored order introduces exactly one crossing at b.
    cfg.set(e2, [b2, b1]);
    expect(scoreConfiguration(graph, cfg).sameSegCrossings).toBe(1);
  });

  it('opposing canonical directions: mirrored stored orders are crossing-free', () => {
    const graph = buildTransitLineGraph(corridorCity('node-0'));
    const e1 = edgeByFirstSeg(graph, 'seg-1');
    const e2 = edgeByFirstSeg(graph, 'seg-2');
    const b1 = graph.bundleOfLine.get('L1') ?? 'L1';
    const b2 = graph.bundleOfLine.get('L2') ?? 'L2';

    // seg-2 corridor runs node-0 → node-b (canonical), i.e. against travel:
    // the physically consistent stored orders are now mirrored.
    const e2edge = graph.edges.get(e2);
    expect(e2edge?.nodeA).toBe('node-0');

    const cfg: BundleOrderConfig = new Map();
    for (const [eid, e] of graph.edges) cfg.set(eid, e.bundleIds);
    cfg.set(e1, [b1, b2]);
    cfg.set(e2, [b2, b1]);
    expect(scoreConfiguration(graph, cfg).sameSegCrossings).toBe(0);

    cfg.set(e2, [b1, b2]);
    expect(scoreConfiguration(graph, cfg).sameSegCrossings).toBe(1);
  });
});

describe('scoreConfiguration — different-segment crossings (paper Fig. 4 right)', () => {
  // T junction at node-v: lines arrive from the west; A turns north, B goes east.
  // Heading east, A must be on the left (north) side to avoid crossing B.
  function tJunctionCity() {
    return makeCityData({
      roadNodes: [
        node('node-v', 0, 0),
        node('node-w', -100, 0),
        node('node-x', 100, 0), // east arm ('node-x' > 'node-v' → canonical v→x)
        node('node-y', 0, 100), // north arm
      ],
      roadSegments: [
        seg('seg-w', 'node-w', 'node-v'),
        seg('seg-e', 'node-v', 'node-x'),
        seg('seg-n', 'node-v', 'node-y'),
      ],
      transitLines: [
        makeTransitLine({
          id: 'A',
          route: [{ segmentIds: ['seg-w', 'seg-n'] }],
        }),
        makeTransitLine({
          id: 'B',
          route: [{ segmentIds: ['seg-w', 'seg-e'] }],
        }),
      ],
    });
  }

  it('detects the crossing exactly when the turning line is on the wrong side', () => {
    const graph = buildTransitLineGraph(tJunctionCity());
    const eW = edgeByFirstSeg(graph, 'seg-w');
    const bA = graph.bundleOfLine.get('A') ?? 'A';
    const bB = graph.bundleOfLine.get('B') ?? 'B';

    // seg-w corridor is canonical node-v → node-w (node-v sorts first), so its
    // stored order is left-to-right traveling WESTBOUND. A on the north side
    // (eastbound-left) is westbound-right → index 1 → stored [B, A].
    const eWEdge = graph.edges.get(eW);
    expect(eWEdge?.nodeA).toBe('node-v');

    const cfg: BundleOrderConfig = new Map();
    for (const [eid, e] of graph.edges) cfg.set(eid, e.bundleIds);

    cfg.set(eW, [bB, bA]);
    expect(scoreConfiguration(graph, cfg).diffSegCrossings).toBe(0);

    cfg.set(eW, [bA, bB]);
    expect(scoreConfiguration(graph, cfg).diffSegCrossings).toBe(1);
  });

  it('computeLineOrder finds the crossing-free side for the turning line', () => {
    const graph = buildTransitLineGraph(tJunctionCity());
    const result = computeLineOrder(graph);
    expect(result.stats.diffSegCrossings).toBe(0);
    expect(result.stats.sameSegCrossings).toBe(0);
  });
});

describe('scoreConfiguration — separations (§3.3)', () => {
  it('penalizes partner lines splitting apart across a junction', () => {
    // Four lines through sw; A,B,D continue east, C turns north. Private
    // tails keep every line in its own bundle.
    const city = makeCityData({
      roadNodes: [
        node('node-v', 0, 0),
        node('node-w', -100, 0),
        node('node-x', 100, 0),
        node('node-y', 0, 100),
        // Tail azimuths at node-w ordered so the clean configuration below is
        // also crossing-free at the tail fan-out.
        node('node-ta', -200, 30),
        node('node-tb', -200, 20),
        node('node-td', -200, 10),
        node('node-tx', 200, 0),
      ],
      roadSegments: [
        seg('seg-w', 'node-w', 'node-v'),
        seg('seg-e', 'node-v', 'node-x'),
        seg('seg-n', 'node-v', 'node-y'),
        seg('seg-ta', 'node-ta', 'node-w'),
        seg('seg-tb', 'node-tb', 'node-w'),
        seg('seg-td', 'node-td', 'node-w'),
        seg('seg-tx', 'node-x', 'node-tx'),
      ],
      transitLines: [
        makeTransitLine({
          id: 'A',
          route: [{ segmentIds: ['seg-ta', 'seg-w', 'seg-e'] }],
        }),
        makeTransitLine({
          id: 'B',
          route: [{ segmentIds: ['seg-tb', 'seg-w', 'seg-e'] }],
        }),
        makeTransitLine({
          id: 'D',
          route: [{ segmentIds: ['seg-td', 'seg-w', 'seg-e', 'seg-tx'] }],
        }),
        makeTransitLine({
          id: 'C',
          route: [{ segmentIds: ['seg-w', 'seg-n'] }],
        }),
      ],
    });
    const graph = buildTransitLineGraph(city);
    const eW = edgeByFirstSeg(graph, 'seg-w');
    const eE = edgeByFirstSeg(graph, 'seg-e');

    const cfg: BundleOrderConfig = new Map();
    for (const [eid, e] of graph.edges) cfg.set(eid, e.bundleIds);

    // Mirror-consistent orders keep A,B,D bundled and C on the north side
    // (its turning side): no crossings, no separations.
    cfg.set(eW, ['D', 'B', 'A', 'C']);
    cfg.set(eE, ['A', 'B', 'D']);
    const clean = scoreConfiguration(graph, cfg);
    expect(clean.separations).toBe(0);
    expect(clean.sameSegCrossings).toBe(0);
    expect(clean.diffSegCrossings).toBe(0);

    // Pushing B away from A in seg-e splits partners → separations appear.
    cfg.set(eE, ['B', 'A', 'D']);
    const split = scoreConfiguration(graph, cfg);
    expect(split.separations).toBeGreaterThan(0);
  });
});

describe('computeLineOrder — optimality and regressions', () => {
  it('REGRESSION (aligned corridor): reaches zero crossings', () => {
    const graph = buildTransitLineGraph(corridorCity('node-c'));
    const result = computeLineOrder(graph);
    expect(result.stats.sameSegCrossings).toBe(0);
  });

  it('REGRESSION (opposing corridor): reaches zero crossings', () => {
    const graph = buildTransitLineGraph(corridorCity('node-0'));
    const result = computeLineOrder(graph);
    expect(result.stats.sameSegCrossings).toBe(0);
  });

  it('4-line Y junction: exhaustive search reaches a crossing-free optimum', () => {
    const city = makeCityData({
      roadNodes: [
        node('node-v', 0, 0),
        node('node-w', -100, 0),
        node('node-x', 100, 0),
        node('node-y', 0, 100),
        node('node-ta', -200, 10),
        node('node-tb', -200, 20),
        node('node-td', -200, 30),
      ],
      roadSegments: [
        seg('seg-w', 'node-w', 'node-v'),
        seg('seg-e', 'node-v', 'node-x'),
        seg('seg-n', 'node-v', 'node-y'),
        seg('seg-ta', 'node-ta', 'node-w'),
        seg('seg-tb', 'node-tb', 'node-w'),
        seg('seg-td', 'node-td', 'node-w'),
      ],
      transitLines: [
        makeTransitLine({
          id: 'A',
          route: [{ segmentIds: ['seg-ta', 'seg-w', 'seg-e'] }],
        }),
        makeTransitLine({
          id: 'B',
          route: [{ segmentIds: ['seg-tb', 'seg-w', 'seg-e'] }],
        }),
        makeTransitLine({
          id: 'D',
          route: [{ segmentIds: ['seg-td', 'seg-w', 'seg-e'] }],
        }),
        makeTransitLine({
          id: 'C',
          route: [{ segmentIds: ['seg-w', 'seg-n'] }],
        }),
      ],
    });
    const graph = buildTransitLineGraph(city);
    const result = computeLineOrder(graph);
    expect(result.stats.sameSegCrossings).toBe(0);
    expect(result.stats.diffSegCrossings).toBe(0);
    expect(result.stats.separations).toBe(0);
  });

  it('is deterministic under permuted input order', () => {
    const build = (reverse: boolean) => {
      const city = corridorCity('node-c');
      const permuted = makeCityData({
        ...city,
        transitLines: reverse
          ? [...city.transitLines].reverse()
          : city.transitLines,
        roadSegments: reverse
          ? [...city.roadSegments].reverse()
          : city.roadSegments,
      });
      return computeLineOrder(buildTransitLineGraph(permuted));
    };
    const a = build(false);
    const b = build(true);
    expect([...a.lineOrder.entries()].sort()).toEqual(
      [...b.lineOrder.entries()].sort(),
    );
  });

  it('mirror invariance: reversing every stored order preserves the score', () => {
    const graph = buildTransitLineGraph(corridorCity('node-c'));
    const { bundleOrder, stats } = computeLineOrder(graph);
    const mirrored: BundleOrderConfig = new Map(
      [...bundleOrder.entries()].map(([eid, order]) => [
        eid,
        [...order].reverse(),
      ]),
    );
    expect(scoreConfiguration(graph, mirrored).score).toBe(stats.score);
  });
});
