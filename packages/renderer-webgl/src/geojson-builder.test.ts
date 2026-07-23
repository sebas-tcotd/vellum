import { describe, it, expect } from 'vitest';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import type { RoadNode } from '@vellum/core';
import {
  buildRoadsGeoJson,
  buildTransitGeoJson,
  buildTransitRenderData,
  buildTransitStopsGeoJson,
} from './geojson-builder';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const NODE_A: RoadNode = { id: 'node-a', position: { x: 0, y: 0, z: 0 } };
const NODE_B: RoadNode = { id: 'node-b', position: { x: 100, y: 0, z: 0 } };

const SEG_1 = makeRoadSegment({
  id: 'seg-1',
  startNodeId: 'node-a',
  endNodeId: 'node-b',
});

function makePathSeg(segmentIds: string[]) {
  return { segmentIds };
}

// ─── buildTransitGeoJson — offsetIdx assignment (paper §5 step 1) ─────────────

describe('buildTransitGeoJson — offsetIdx', () => {
  it('single line on a segment → offsetIdx is 0', () => {
    const line = makeTransitLine({
      id: 'line-1',
      mode: 'Bus',
      route: [makePathSeg(['seg-1'])],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_1],
      transitLines: [line],
    });

    const fc = buildTransitGeoJson(city);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.offsetIdx).toBe(0);
  });

  it('two lines sharing a segment → offsetIdx are [-0.5, +0.5]', () => {
    const lineA = makeTransitLine({
      id: 'line-a',
      mode: 'Bus',
      color: '#ff0000',
      route: [makePathSeg(['seg-1'])],
    });
    const lineB = makeTransitLine({
      id: 'line-b',
      mode: 'Bus',
      color: '#0000ff',
      route: [makePathSeg(['seg-1'])],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_1],
      transitLines: [lineA, lineB],
    });

    const fc = buildTransitGeoJson(city);
    expect(fc.features).toHaveLength(2);

    const offsets = fc.features
      .map((f) => f.properties.offsetIdx)
      .sort((a, b) => a - b);
    expect(offsets).toEqual([-0.5, 0.5]);
  });

  it('three lines sharing a segment → offsetIdx are [-1, 0, 1]', () => {
    const lines = ['a', 'b', 'c'].map((id) =>
      makeTransitLine({
        id: `line-${id}`,
        mode: 'Bus',
        route: [makePathSeg(['seg-1'])],
      }),
    );
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_1],
      transitLines: lines,
    });

    const fc = buildTransitGeoJson(city);
    const offsets = fc.features
      .map((f) => f.properties.offsetIdx)
      .sort((a, b) => a - b);
    expect(offsets).toEqual([-1, 0, 1]);
  });

  it('lines on different segments each get offsetIdx 0', () => {
    const NODE_C: RoadNode = { id: 'node-c', position: { x: 200, y: 0, z: 0 } };
    const SEG_2 = makeRoadSegment({
      id: 'seg-2',
      startNodeId: 'node-b',
      endNodeId: 'node-c',
    });
    const lineA = makeTransitLine({
      id: 'line-a',
      route: [makePathSeg(['seg-1'])],
    });
    const lineB = makeTransitLine({
      id: 'line-b',
      route: [makePathSeg(['seg-2'])],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B, NODE_C],
      roadSegments: [SEG_1, SEG_2],
      transitLines: [lineA, lineB],
    });

    const fc = buildTransitGeoJson(city);
    expect(fc.features).toHaveLength(2);
    expect(fc.features.every((f) => f.properties.offsetIdx === 0)).toBe(true);
  });

  it('mode priority tie-break: Train takes the leftmost slot over Bus', () => {
    // A single unconstrained corridor: any order is optimal, so the
    // deterministic fallback (mode priority, then id) decides.
    const bus = makeTransitLine({
      id: 'line-bus',
      mode: 'Bus',
      route: [makePathSeg(['seg-1'])],
    });
    const train = makeTransitLine({
      id: 'line-train',
      mode: 'Train',
      route: [makePathSeg(['seg-1'])],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_1],
      transitLines: [bus, train],
    });

    const fc = buildTransitGeoJson(city);
    const trainFeature = fc.features.find(
      (f) => f.properties.id === 'line-train',
    );
    const busFeature = fc.features.find((f) => f.properties.id === 'line-bus');

    expect(trainFeature?.properties.offsetIdx).toBe(-0.5);
    expect(busFeature?.properties.offsetIdx).toBe(0.5);
  });

  it('same mode tie-break: alphabetically earlier id takes the leftmost slot', () => {
    const lineZ = makeTransitLine({
      id: 'line-z',
      mode: 'Bus',
      route: [makePathSeg(['seg-1'])],
    });
    const lineA = makeTransitLine({
      id: 'line-a',
      mode: 'Bus',
      route: [makePathSeg(['seg-1'])],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_1],
      transitLines: [lineZ, lineA],
    });

    const fc = buildTransitGeoJson(city);
    const featA = fc.features.find((f) => f.properties.id === 'line-a');
    const featZ = fc.features.find((f) => f.properties.id === 'line-z');

    expect(featA?.properties.offsetIdx).toBe(-0.5);
    expect(featZ?.properties.offsetIdx).toBe(0.5);
  });

  it('emits correct color and mode properties alongside offsetIdx', () => {
    const line = makeTransitLine({
      id: 'l1',
      mode: 'Tram',
      color: '#00FF00',
      route: [makePathSeg(['seg-1'])],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_1],
      transitLines: [line],
    });

    const fc = buildTransitGeoJson(city);
    const props = fc.features[0].properties;
    expect(props.color).toBe('#00FF00');
    expect(props.mode).toBe('Tram');
    expect(props.offsetIdx).toBe(0);
  });
});

// ─── buildTransitGeoJson — corridor geometry ─────────────────────────────────

describe('buildTransitGeoJson — corridor geometry', () => {
  it('two lines sharing a stored-reversed segment share one corridor geometry', () => {
    // The corridor is canonicalized nodeA → nodeB regardless of how the game
    // stored the segment, so all its line features share identical coords and
    // a consistent offset side.
    const SEG_REV = makeRoadSegment({
      id: 'seg-rev',
      startNodeId: 'node-b', // deliberately "backwards"
      endNodeId: 'node-a',
    });
    const lineA = makeTransitLine({
      id: 'line-a',
      mode: 'Bus',
      route: [makePathSeg(['seg-rev'])],
    });
    const lineB = makeTransitLine({
      id: 'line-b',
      mode: 'Bus',
      route: [makePathSeg(['seg-rev'])],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_REV],
      transitLines: [lineA, lineB],
    });

    const fc = buildTransitGeoJson(city);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry.coordinates).toEqual(
      fc.features[1].geometry.coordinates,
    );
  });

  it('corridor coordinates run from the lexicographically smaller node', () => {
    const SEG_REV = makeRoadSegment({
      id: 'seg-rev',
      startNodeId: 'node-b',
      endNodeId: 'node-a',
    });
    const line = makeTransitLine({
      id: 'line-1',
      route: [makePathSeg(['seg-rev'])],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_REV],
      transitLines: [line],
    });

    const fc = buildTransitGeoJson(city);
    const coords = fc.features[0].geometry.coordinates;
    // node-a (x=0) sorts before node-b (x=100) → ascending longitude.
    expect(coords[0][0]).toBeLessThan(coords[coords.length - 1][0]);
  });

  it('a two-segment same-line chain is emitted as a single corridor feature', () => {
    const NODE_C: RoadNode = { id: 'node-c', position: { x: 200, y: 0, z: 0 } };
    const SEG_2 = makeRoadSegment({
      id: 'seg-2',
      startNodeId: 'node-b',
      endNodeId: 'node-c',
    });
    const line = makeTransitLine({
      id: 'line-1',
      route: [makePathSeg(['seg-1', 'seg-2'])],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B, NODE_C],
      roadSegments: [SEG_1, SEG_2],
      transitLines: [line],
    });

    const fc = buildTransitGeoJson(city);
    expect(fc.features).toHaveLength(1);
  });
});

// ─── buildTransitRenderData — connectors and stations ────────────────────────

describe('buildTransitRenderData — connectors and stations', () => {
  it('emits inner-connection features for lines continuing across a junction', () => {
    // T junction: the corridor pair (west, north) shares line A; a third arm
    // keeps the node from being contracted.
    const city = makeCityData({
      roadNodes: [
        { id: 'node-v', position: { x: 0, y: 0, z: 0 } },
        { id: 'node-w', position: { x: -100, y: 0, z: 0 } },
        { id: 'node-x', position: { x: 100, y: 0, z: 0 } },
        { id: 'node-y', position: { x: 0, y: 0, z: 100 } },
      ],
      roadSegments: [
        makeRoadSegment({
          id: 'seg-w',
          startNodeId: 'node-w',
          endNodeId: 'node-v',
        }),
        makeRoadSegment({
          id: 'seg-e',
          startNodeId: 'node-v',
          endNodeId: 'node-x',
        }),
        makeRoadSegment({
          id: 'seg-n',
          startNodeId: 'node-v',
          endNodeId: 'node-y',
        }),
      ],
      transitLines: [
        makeTransitLine({ id: 'A', route: [makePathSeg(['seg-w', 'seg-n'])] }),
        makeTransitLine({ id: 'B', route: [makePathSeg(['seg-w', 'seg-e'])] }),
      ],
    });

    const data = buildTransitRenderData(city);
    const connectorLines = data.connectors.features.map((f) => f.properties.id);
    expect(connectorLines).toContain('A');
    expect(connectorLines).toContain('B');
    // Connector displacement is baked into geometry, not line-offset.
    expect(
      data.connectors.features.every((f) => f.properties.offsetIdx === 0),
    ).toBe(true);
  });

  it('emits one station dot per capsule, at its centroid, with matching lines', () => {
    const line = makeTransitLine({
      id: 'line-1',
      name: 'Ruta 1',
      route: [makePathSeg(['seg-1'])],
      stops: [
        {
          id: 'stop-1',
          mode: 'Bus',
          position: { x: 50, y: 0, z: 4 },
          name: '',
        },
      ],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_1],
      transitLines: [line],
    });

    const data = buildTransitRenderData(city);
    // One capsule polygon and one dot point, sharing id + lines.
    expect(data.stations.features).toHaveLength(1);
    expect(data.stationDots.features).toHaveLength(1);
    const dot = data.stationDots.features[0];
    expect(dot.geometry.type).toBe('Point');
    expect(dot.properties.id).toBe(data.stations.features[0].properties.id);
    expect(dot.properties.lines).toBe(
      data.stations.features[0].properties.lines,
    );

    // The dot sits at the centroid of the capsule ring (average of its vertices,
    // excluding the closing vertex).
    const ring = data.stations.features[0].geometry.coordinates[0].slice(0, -1);
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    expect(dot.geometry.coordinates[0]).toBeCloseTo(cx, 6);
    expect(dot.geometry.coordinates[1]).toBeCloseTo(cy, 6);
  });

  it('emits station polygons for stops, grouped and JSON-annotated', () => {
    const line = makeTransitLine({
      id: 'line-1',
      name: 'Ruta 1',
      mode: 'Bus',
      color: '#FF6600',
      route: [makePathSeg(['seg-1'])],
      stops: [
        {
          id: 'stop-1',
          mode: 'Bus',
          position: { x: 50, y: 0, z: 5 },
          name: '',
        },
        // Duplicate terminal stop of a circular route → deduplicated.
        {
          id: 'stop-1',
          mode: 'Bus',
          position: { x: 50, y: 0, z: 5 },
          name: '',
        },
      ],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_1],
      transitLines: [line],
    });

    const stations = buildTransitStopsGeoJson(city);
    expect(stations.features).toHaveLength(1);
    const station = stations.features[0];
    expect(station.geometry.type).toBe('Polygon');
    // Closed rounded ring (more than 4 corners of a plain rectangle).
    const ring = station.geometry.coordinates[0];
    expect(ring.length).toBeGreaterThan(5);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const lines = JSON.parse(station.properties.lines) as Array<{
      name: string;
    }>;
    expect(lines).toEqual([{ name: 'Ruta 1', color: '#FF6600', mode: 'Bus' }]);
  });

  it('merges stops of different lines within the merge threshold into one station', () => {
    const mkStop = (id: string, x: number) => ({
      id,
      mode: 'Bus' as const,
      position: { x, y: 0, z: 5 },
      name: '',
    });
    const lineA = makeTransitLine({
      id: 'line-a',
      name: 'A',
      route: [makePathSeg(['seg-1'])],
      stops: [mkStop('stop-a', 50)],
    });
    const lineB = makeTransitLine({
      id: 'line-b',
      name: 'B',
      route: [makePathSeg(['seg-1'])],
      stops: [mkStop('stop-b', 60)], // 10 m away — within the 48 m threshold
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_1],
      transitLines: [lineA, lineB],
    });

    const stations = buildTransitStopsGeoJson(city);
    expect(stations.features).toHaveLength(1);
    const lines = JSON.parse(stations.features[0].properties.lines) as Array<{
      name: string;
    }>;
    expect(lines.map((l) => l.name).sort()).toEqual(['A', 'B']);
  });
});

// ─── buildRoadsGeoJson — road tier classification ───────────────────────────

describe('buildRoadsGeoJson — tier classification', () => {
  it('classifies Metro Track as metro tier, not width-based fallback', () => {
    const segment = makeRoadSegment({
      id: 'metro-1',
      startNodeId: 'node-a',
      endNodeId: 'node-b',
      itemClass: 'Metro Track',
      width: 30, // wide enough to fall into 'largeArterial' via width fallback if unmapped
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [segment],
    });

    const fc = buildRoadsGeoJson(city);
    expect(fc.features[0].properties.tier).toBe('metro');
  });

  it('classifies Metro Track Tunnel as metro tier', () => {
    const segment = makeRoadSegment({
      id: 'metro-tunnel-1',
      startNodeId: 'node-a',
      endNodeId: 'node-b',
      itemClass: 'Metro Track Tunnel',
      width: 30,
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [segment],
    });

    const fc = buildRoadsGeoJson(city);
    expect(fc.features[0].properties.tier).toBe('metro');
  });

  it('classifies Train Track as train tier (baseline, unchanged)', () => {
    const segment = makeRoadSegment({
      id: 'train-1',
      startNodeId: 'node-a',
      endNodeId: 'node-b',
      itemClass: 'Train Track',
      width: 30,
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [segment],
    });

    const fc = buildRoadsGeoJson(city);
    expect(fc.features[0].properties.tier).toBe('train');
  });

  it('classifies Train Track Tunnel as train tier', () => {
    const segment = makeRoadSegment({
      id: 'train-tunnel-1',
      startNodeId: 'node-a',
      endNodeId: 'node-b',
      itemClass: 'Train Track Tunnel',
      width: 30,
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [segment],
    });

    const fc = buildRoadsGeoJson(city);
    expect(fc.features[0].properties.tier).toBe('train');
  });
});
