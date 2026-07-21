import { describe, it, expect } from 'vitest';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import type { RoadNode } from '@vellum/core';
import { buildTransitLineGraph } from './line-graph';
import { computeLineOrder } from './ordering';
import {
  buildRenderGeometry,
  SLOT_M,
  STATION_MERGE_THRESHOLD_M,
} from './render-geometry';

function node(id: string, x: number, z: number): RoadNode {
  return { id, position: { x, y: 0, z } };
}
function seg(id: string, from: string, to: string) {
  return makeRoadSegment({ id, startNodeId: from, endNodeId: to });
}

/** T-junction: west arm carries A+B; A turns north, B continues east. */
function tJunctionCity() {
  return makeCityData({
    roadNodes: [
      node('node-v', 0, 0),
      node('node-w', -100, 0),
      node('node-x', 100, 0),
      node('node-y', 0, 100),
    ],
    roadSegments: [
      seg('seg-w', 'node-w', 'node-v'),
      seg('seg-e', 'node-v', 'node-x'),
      seg('seg-n', 'node-v', 'node-y'),
    ],
    transitLines: [
      makeTransitLine({ id: 'A', route: [{ segmentIds: ['seg-w', 'seg-n'] }] }),
      makeTransitLine({ id: 'B', route: [{ segmentIds: ['seg-w', 'seg-e'] }] }),
    ],
  });
}

function buildGeom(city: ReturnType<typeof makeCityData>) {
  const graph = buildTransitLineGraph(city);
  const { lineOrder } = computeLineOrder(graph);
  return { graph, geometry: buildRenderGeometry(graph, lineOrder, city) };
}

// ─── Complex-node regression suite (route-based continuations) ────────────────
// These reproduce the screenshot bugs: at nodes where a line touches 3+
// corridors (loops, roundabouts, revisited hubs) the old line-set-membership
// pairing dropped ALL inner connections, leaving visual gaps. Route-based
// continuations must connect them.

describe('buildRenderGeometry — inner connections at complex nodes', () => {
  it('REGRESSION: line passing a junction twice (lollipop) connects both passes, not across', () => {
    // Route T→J→P→Q→J→R. The J-P-Q-J loop contracts to a self-loop at J, so
    // line L occupies 3 corridors at J: stem-TJ, self-loop, stem-JR.
    // The old `presentIn !== 2` guard dropped all 3 → gaps. Correct output:
    // exactly 2 connectors (TJ↔loop and loop↔JR), never TJ↔JR directly.
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
    const graph = buildTransitLineGraph(city);

    // Confirm the topology that used to break: L is in 3 corridors at J.
    const atJ = graph.nodes.get('J');
    expect(atJ?.edgeIds.length).toBe(3);

    const { geometry } = buildGeom(city);
    const connectors = geometry.connectors.filter((c) => c.lineId === 'L');
    // One connector per route transition at J (enter loop, exit loop): 2.
    expect(connectors).toHaveLength(2);
    // Every connector must start/end near J (bridging the trimmed gap there).
    for (const c of connectors) {
      const near = (p: { x: number; z: number }) => Math.hypot(p.x, p.z) < 120;
      expect(near(c.path[0]) || near(c.path[c.path.length - 1])).toBe(true);
    }
  });

  it('REGRESSION: roundabout (ring + two stems) bridges ring arcs to stems', () => {
    // North & south stems meet a ring at N and S. A line runs down the north
    // stem, around the east arc, out the south stem. The ring's west arc is
    // used by a second line so the ring does not fully contract into the stems.
    const city = makeCityData({
      roadNodes: [
        node('nTop', 0, 300),
        node('N', 0, 100),
        node('E', 120, 0),
        node('S', 0, -100),
        node('W', -120, 0),
        node('nBot', 0, -300),
      ],
      roadSegments: [
        seg('sN', 'nTop', 'N'),
        seg('rNE', 'N', 'E'),
        seg('rES', 'E', 'S'),
        seg('rNW', 'N', 'W'),
        seg('rWS', 'W', 'S'),
        seg('sS', 'S', 'nBot'),
      ],
      transitLines: [
        // Through line: north stem → east arc → south stem.
        makeTransitLine({
          id: 'thru',
          route: [{ segmentIds: ['sN', 'rNE', 'rES', 'sS'] }],
        }),
        // Ring line: full loop, keeps both arcs alive as corridors.
        makeTransitLine({
          id: 'ring',
          route: [{ segmentIds: ['rNE', 'rES', 'rWS', 'rNW'] }],
        }),
      ],
    });
    const { geometry, graph } = buildGeom(city);

    // N and S are genuine junctions (stem + 2 arcs).
    expect(graph.nodes.get('N')?.edgeIds.length).toBeGreaterThanOrEqual(3);

    // The through line must have a connector at N (stem→east arc) and at S
    // (east arc→stem): no gap where it meets the ring.
    const thruConns = geometry.connectors.filter((c) => c.lineId === 'thru');
    expect(thruConns.length).toBeGreaterThanOrEqual(2);
  });

  it('REGRESSION: closed triangular loop connects at every corner incl. the wrap', () => {
    // A closed loop L over 3 corridors meeting at 3 junction nodes (each has a
    // spur, so none contract). All three corners — including the last→first
    // wrap — must produce a connector.
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
        // Closed loop A→B→C→A.
        makeTransitLine({
          id: 'L',
          route: [{ segmentIds: ['AB', 'BC', 'CA'] }],
        }),
        // Spur lines to keep A, B, C as degree-3 junctions (no contraction).
        makeTransitLine({ id: 'spA', route: [{ segmentIds: ['spurA'] }] }),
        makeTransitLine({ id: 'spB', route: [{ segmentIds: ['spurB'] }] }),
        makeTransitLine({ id: 'spC', route: [{ segmentIds: ['spurC'] }] }),
      ],
    });
    const { geometry } = buildGeom(city);
    const loopConns = geometry.connectors.filter((c) => c.lineId === 'L');
    // Three corners: AB↔BC at B, BC↔CA at C, CA↔AB at A (wrap). None dropped.
    expect(loopConns).toHaveLength(3);
  });

  it('INVARIANT: every route transition yields a connector when both corridors survive', () => {
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
    const graph = buildTransitLineGraph(city);
    const { lineOrder } = computeLineOrder(graph);
    const geometry = buildRenderGeometry(graph, lineOrder, city);
    const surviving = new Set(geometry.corridors.map((c) => c.edgeId));
    const expected = graph.transitions.filter(
      (t) => surviving.has(t.fromEdge) && surviving.has(t.toEdge),
    ).length;
    expect(geometry.connectors).toHaveLength(expected);
  });
});

describe('buildRenderGeometry — corridor trimming (node fronts)', () => {
  it('trims shared corridors back from junction nodes but leaves the geometry valid', () => {
    const { geometry } = buildGeom(tJunctionCity());
    expect(geometry.corridors.length).toBeGreaterThan(0);
    for (const c of geometry.corridors) {
      expect(c.path.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not trim an isolated single corridor (no junctions)', () => {
    const city = makeCityData({
      roadNodes: [node('node-a', 0, 0), node('node-b', 100, 0)],
      roadSegments: [seg('seg-1', 'node-a', 'node-b')],
      transitLines: [
        makeTransitLine({ id: 'L1', route: [{ segmentIds: ['seg-1'] }] }),
      ],
    });
    const { geometry } = buildGeom(city);
    expect(geometry.corridors).toHaveLength(1);
    const c = geometry.corridors[0];
    // Full length retained: endpoints at x=0 and x=100.
    expect(c.path[0].x).toBeCloseTo(0);
    expect(c.path[c.path.length - 1].x).toBeCloseTo(100);
  });
});

describe('buildRenderGeometry — inner connections (Bézier)', () => {
  it('emits one connector per continuing line at a junction, endpoints on the ports', () => {
    const { geometry } = buildGeom(tJunctionCity());
    // A continues w→n, B continues w→e: two connectors.
    const ids = geometry.connectors.map((c) => c.lineId).sort();
    expect(ids).toEqual(['A', 'B']);
    for (const conn of geometry.connectors) {
      expect(conn.path.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('connector endpoints are offset from the centerline by the slot width', () => {
    // Two lines sharing a corridor that continues straight through a junction;
    // the offset lines must be ~SLOT_M apart at the port.
    const city = makeCityData({
      roadNodes: [
        node('node-a', 0, 0),
        node('node-b', 100, 0),
        node('node-c', 200, 0),
        node('node-d', 100, 100), // spur keeps node-b a junction
      ],
      roadSegments: [
        seg('seg-1', 'node-a', 'node-b'),
        seg('seg-2', 'node-b', 'node-c'),
        seg('seg-3', 'node-b', 'node-d'),
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
        makeTransitLine({ id: 'L3', route: [{ segmentIds: ['seg-3'] }] }),
      ],
    });
    const { geometry } = buildGeom(city);
    const conns = geometry.connectors.filter(
      (c) => c.lineId === 'L1' || c.lineId === 'L2',
    );
    expect(conns.length).toBe(2);
    // The two connectors' start points are on opposite sides of the axis (z=0),
    // separated by ~SLOT_M along z (perpendicular to the east-west corridor).
    const startZs = conns.map((c) => c.path[0].z).sort((a, b) => a - b);
    expect(Math.abs(startZs[1] - startZs[0])).toBeCloseTo(SLOT_M, 1);
  });
});

describe('buildRenderGeometry — stations (§5.4 rounded markers)', () => {
  it('produces a closed rounded ring centered near the stop', () => {
    const line = makeTransitLine({
      id: 'L1',
      route: [{ segmentIds: ['seg-1'] }],
      stops: [
        { id: 's1', mode: 'Bus', position: { x: 50, y: 0, z: 3 }, name: '' },
      ],
    });
    const city = makeCityData({
      roadNodes: [node('node-a', 0, 0), node('node-b', 100, 0)],
      roadSegments: [seg('seg-1', 'node-a', 'node-b')],
      transitLines: [line],
    });
    const { geometry } = buildGeom(city);
    expect(geometry.stations).toHaveLength(1);
    const ring = geometry.stations[0].polygon;
    // Rounded ring: 4 corners × (steps+1) points + closing vertex.
    expect(ring.length).toBeGreaterThan(5);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // Marker centroid projects onto the corridor (z≈0), near x=50.
    const body = ring.slice(0, ring.length - 1);
    const cx = body.reduce((s, p) => s + p.x, 0) / body.length;
    const cz = body.reduce((s, p) => s + p.z, 0) / body.length;
    expect(cx).toBeCloseTo(50, 0);
    expect(cz).toBeCloseTo(0, 1);
  });

  it('REGRESSION: marker spans ONLY the stopping lines, not the whole bundle', () => {
    // Corridor carries 4 lines (A,B,C,D). Only B stops here. The marker must
    // hug B's single slot — its perpendicular extent must be far smaller than
    // the full 4-line bundle width, and its lines list must be exactly [B].
    const stops = [
      {
        id: 'sB',
        mode: 'Bus' as const,
        position: { x: 50, y: 0, z: 0 },
        name: '',
      },
    ];
    const mk = (id: string, withStop: boolean) =>
      makeTransitLine({
        id,
        name: id,
        mode: 'Bus',
        route: [{ segmentIds: ['seg-1'] }],
        stops: withStop ? stops : [],
      });
    const city = makeCityData({
      roadNodes: [node('node-a', 0, 0), node('node-b', 100, 0)],
      roadSegments: [seg('seg-1', 'node-a', 'node-b')],
      transitLines: [
        mk('A', false),
        mk('B', true),
        mk('C', false),
        mk('D', false),
      ],
    });
    const { geometry } = buildGeom(city);
    expect(geometry.stations).toHaveLength(1);
    const station = geometry.stations[0];
    expect(station.lines.map((l) => l.name)).toEqual(['B']);

    // Perpendicular (across-corridor, z) extent of the marker.
    const zs = station.polygon.map((p) => p.z);
    const acrossExtent = Math.max(...zs) - Math.min(...zs);
    // A single stopping line ⇒ roughly one line width, well under the 4-line
    // bundle span (~4×SLOT_M). Guard generously but decisively.
    expect(acrossExtent).toBeLessThan(2 * SLOT_M);
    const fullBundle = 4 * SLOT_M;
    expect(acrossExtent).toBeLessThan(fullBundle * 0.6);
  });

  it('marker for a contiguous subset spans that subset, centered on it', () => {
    // 4 lines A,B,C,D; B and C stop (adjacent slots). Marker spans ~2 slots,
    // offset from centre toward B/C, and lists exactly [B, C].
    const stopBC = {
      mode: 'Bus' as const,
      position: { x: 50, y: 0, z: 0 },
      name: '',
    };
    const mk = (id: string, stops: boolean) =>
      makeTransitLine({
        id,
        name: id,
        mode: 'Bus',
        route: [{ segmentIds: ['seg-1'] }],
        stops: stops ? [{ id: `s${id}`, ...stopBC }] : [],
      });
    const city = makeCityData({
      roadNodes: [node('node-a', 0, 0), node('node-b', 100, 0)],
      roadSegments: [seg('seg-1', 'node-a', 'node-b')],
      transitLines: [
        mk('A', false),
        mk('B', true),
        mk('C', true),
        mk('D', false),
      ],
    });
    const { geometry } = buildGeom(city);
    const station = geometry.stations.find((s) => s.lines.length === 2);
    expect(station).toBeDefined();
    expect(station?.lines.map((l) => l.name).sort()).toEqual(['B', 'C']);
  });

  it('groups nearby stops of different lines into a single station', () => {
    const lineA = makeTransitLine({
      id: 'A',
      name: 'A',
      route: [{ segmentIds: ['seg-1'] }],
      stops: [
        { id: 'sa', mode: 'Bus', position: { x: 50, y: 0, z: 2 }, name: '' },
      ],
    });
    const lineB = makeTransitLine({
      id: 'B',
      name: 'B',
      route: [{ segmentIds: ['seg-1'] }],
      stops: [
        {
          id: 'sb',
          mode: 'Bus',
          position: { x: 50 + STATION_MERGE_THRESHOLD_M / 2, y: 0, z: 2 },
          name: '',
        },
      ],
    });
    const city = makeCityData({
      roadNodes: [node('node-a', 0, 0), node('node-b', 200, 0)],
      roadSegments: [seg('seg-1', 'node-a', 'node-b')],
      transitLines: [lineA, lineB],
    });
    const { geometry } = buildGeom(city);
    expect(geometry.stations).toHaveLength(1);
    expect(geometry.stations[0].lines.map((l) => l.name).sort()).toEqual([
      'A',
      'B',
    ]);
  });
});
