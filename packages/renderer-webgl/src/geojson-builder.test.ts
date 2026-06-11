import { describe, it, expect } from 'vitest';
import {
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
} from '@vellum/core/testing';
import type { RoadNode } from '@vellum/core';
import { buildTransitGeoJson } from './geojson-builder';

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

// ─── buildTransitGeoJson — lineWidthMultiplier assignment ───────────────────────

describe('buildTransitGeoJson — lineWidthMultiplier', () => {
  it('single line on a segment → lineWidthMultiplier is 1', () => {
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
    expect(fc.features[0].properties.lineWidthMultiplier).toBe(1);
  });

  it('two lines sharing a segment → lineWidthMultipliers are [2, 1]', () => {
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

    const multipliers = fc.features
      .map((f) => f.properties.lineWidthMultiplier)
      .sort((a, b) => b - a);
    expect(multipliers).toEqual([2, 1]);
  });

  it('three lines sharing a segment → lineWidthMultipliers are [3, 2, 1]', () => {
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
    const multipliers = fc.features
      .map((f) => f.properties.lineWidthMultiplier)
      .sort((a, b) => b - a);
    expect(multipliers).toEqual([3, 2, 1]);
  });

  it('four lines sharing a segment → lineWidthMultipliers are [4, 3, 2, 1]', () => {
    const lines = ['a', 'b', 'c', 'd'].map((id) =>
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
    const multipliers = fc.features
      .map((f) => f.properties.lineWidthMultiplier)
      .sort((a, b) => b - a);
    expect(multipliers).toEqual([4, 3, 2, 1]);
  });

  it('lines on different segments each get lineWidthMultiplier 1', () => {
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
    expect(
      fc.features.every((f) => f.properties.lineWidthMultiplier === 1),
    ).toBe(true);
  });

  it('mode priority: Train ranks before Bus on the same segment', () => {
    // Train has lower MODE_PRIORITY index → gets rank 0 → negative (or zero) offset
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
      transitLines: [bus, train], // bus declared first, but train has higher priority
    });

    const fc = buildTransitGeoJson(city);
    const trainFeature = fc.features.find(
      (f) => f.properties.id === 'line-train',
    );
    const busFeature = fc.features.find((f) => f.properties.id === 'line-bus');

    // Train is rank 0 (background) → lineWidthMultiplier = 2; Bus rank 1 → 1
    expect(trainFeature?.properties.lineWidthMultiplier).toBe(2);
    expect(busFeature?.properties.lineWidthMultiplier).toBe(1);
  });

  it('same mode, stable sort by id: alphabetically earlier id gets lower offset', () => {
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

    // line-a rank 0 (background) → lineWidthMultiplier = 2; line-z rank 1 → 1
    expect(featA?.properties.lineWidthMultiplier).toBe(2);
    expect(featZ?.properties.lineWidthMultiplier).toBe(1);
  });

  it('emits correct color and mode properties alongside lineWidthMultiplier', () => {
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
    expect(props.lineWidthMultiplier).toBe(1);
  });
});

// ─── buildTransitGeoJson — canonical coordinate direction ────────────────────

describe('buildTransitGeoJson — canonical direction normalization', () => {
  it('two lines sharing a reversed segment both emit coords in the same order', () => {
    // SEG_REV has startNodeId="node-b" > endNodeId="node-a", so it is non-canonical.
    // Both line features must be emitted node-a → node-b (reversed from stored direction)
    // so that line-offset always lands on the same physical side for both.
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

    // Both features must start at the same node (the canonical "first" node)
    const [first0] = fc.features[0].geometry.coordinates;
    const [first1] = fc.features[1].geometry.coordinates;
    expect(first0).toEqual(first1);
  });

  it('canonical segment (startNodeId < endNodeId) emits coords start→end unchanged', () => {
    // SEG_1 has startNodeId="node-a" < "node-b" → canonical direction → coords unchanged
    const line = makeTransitLine({
      id: 'line-1',
      route: [makePathSeg(['seg-1'])],
    });
    const city = makeCityData({
      roadNodes: [NODE_A, NODE_B],
      roadSegments: [SEG_1],
      transitLines: [line],
    });

    const fc = buildTransitGeoJson(city);
    const coords = fc.features[0].geometry.coordinates;
    // First coord should be NODE_A's position (x=0), last should be NODE_B's (x=100)
    expect(coords[0][0]).toBeLessThan(coords[coords.length - 1][0]);
  });

  it('reversed segment emits coords end→start (normalised)', () => {
    const SEG_REV = makeRoadSegment({
      id: 'seg-rev',
      startNodeId: 'node-b', // "node-b" > "node-a" → non-canonical
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
    // Even though stored as node-b→node-a, canonical order is node-a→node-b,
    // so first coord (NODE_A, x≈0) should come before last (NODE_B, x≈some larger lng)
    expect(coords[0][0]).toBeLessThan(coords[coords.length - 1][0]);
  });
});
