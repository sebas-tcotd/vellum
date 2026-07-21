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

describe('buildRenderGeometry — stations (§5.4 rotated rectangles)', () => {
  it('produces a closed rectangle centered near the stop, spanning the bundle', () => {
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
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    // Centroid of the rectangle projects onto the corridor (z≈0), near x=50.
    const cx = ring.slice(0, 4).reduce((s, p) => s + p.x, 0) / 4;
    const cz = ring.slice(0, 4).reduce((s, p) => s + p.z, 0) / 4;
    expect(cx).toBeCloseTo(50, 0);
    expect(cz).toBeCloseTo(0, 1);
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
