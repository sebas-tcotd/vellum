import { describe, expect, it } from 'vitest';
import { makeCityData, makeRoadSegment, makeTransitLine } from '../../testing';
import type { CityData, RoadNode, TransitStop } from '../../types/city-data';
import { deriveTransitNetwork } from '../index';
import { geographicSchematicLayout, isSchematicLayoutEmpty } from './index';

const node = (id: string, x: number, z: number): RoadNode => ({
  id,
  position: { x, y: 0, z },
});
const stop = (id: string, x: number, z: number): TransitStop => ({
  id,
  mode: 'Bus',
  position: { x, y: 0, z },
  name: `Stop ${id}`,
});

function city(): CityData {
  return makeCityData({
    roadNodes: [node('a', 0, 0), node('b', 100, 0), node('c', 100, 300)],
    roadSegments: [
      makeRoadSegment({ id: 's1', startNodeId: 'a', endNodeId: 'b' }),
      makeRoadSegment({ id: 's2', startNodeId: 'b', endNodeId: 'c' }),
    ],
    transitLines: [
      makeTransitLine({
        id: 'L1',
        color: '#ff0000',
        stops: [stop('p1', 0, 0), stop('p2', 100, 300)],
        route: [{ segmentIds: ['s1', 's2'] }],
      }),
      makeTransitLine({
        id: 'L2',
        color: '#0000ff',
        stops: [stop('p1', 0, 0)],
        route: [{ segmentIds: ['s1'] }],
      }),
    ],
  });
}

describe('geographicSchematicLayout', () => {
  it('produces an empty frozen layout for a network without transit', () => {
    const layout = geographicSchematicLayout(
      deriveTransitNetwork(makeCityData({ transitLines: [] })),
    );
    expect(isSchematicLayoutEmpty(layout)).toBe(true);
    expect(layout.stations).toEqual([]);
    expect(Object.isFrozen(layout)).toBe(true);
  });

  it('is deterministic and frozen', () => {
    const network = deriveTransitNetwork(city());
    const a = geographicSchematicLayout(network);
    const b = geographicSchematicLayout(network);
    expect(a).toEqual(b);
    expect(isSchematicLayoutEmpty(a)).toBe(false);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.segments[0])).toBe(true);
    expect(Object.isFrozen(a.segments[0].points)).toBe(true);
  });

  it('colours segments by line and draws one symbol per stop', () => {
    const layout = geographicSchematicLayout(deriveTransitNetwork(city()));
    const lineIds = new Set(layout.segments.map((s) => s.lineId));
    expect(lineIds).toEqual(new Set(['L1', 'L2']));
    for (const s of layout.segments) {
      expect(s.color).toBe(s.lineId === 'L1' ? '#ff0000' : '#0000ff');
    }
    expect(layout.stations.map((s) => s.id)).toEqual(['p1', 'p2']);
  });

  it('keeps every point inside the bounds and orients south-up', () => {
    const layout = geographicSchematicLayout(deriveTransitNetwork(city()));
    const { width, height } = layout.bounds;
    const points = [
      ...layout.segments.flatMap((s) => s.points),
      ...layout.stations,
    ];
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(height);
    }
    const [p1, p2] = layout.stations;
    // p2 has larger z (further south) → higher on screen (smaller y).
    expect(p2.y).toBeLessThan(p1.y);
  });

  it('does not mutate its input', () => {
    const network = deriveTransitNetwork(city());
    const before = JSON.stringify([...network.edges.values()]);
    geographicSchematicLayout(network);
    expect(JSON.stringify([...network.edges.values()])).toBe(before);
  });
});

describe('geographicSchematicLayout — robustness', () => {
  it('omits stops of lines that draw no edge, and they do not affect bounds', () => {
    const base = city();
    const withOrphan = makeCityData({
      ...base,
      transitLines: [
        ...base.transitLines,
        makeTransitLine({
          id: 'L9',
          stops: [stop('orphan', 50000, 50000)],
          route: [],
        }),
      ],
    });
    const a = geographicSchematicLayout(deriveTransitNetwork(base));
    const b = geographicSchematicLayout(deriveTransitNetwork(withOrphan));
    expect(b.stations.map((s) => s.id)).not.toContain('orphan');
    expect(b).toEqual(a);
  });

  it('ignores non-finite coordinates', () => {
    const base = city();
    const withNaN = makeCityData({
      ...base,
      transitLines: base.transitLines.map((l) =>
        l.id === 'L1'
          ? { ...l, stops: [...l.stops, stop('bad', Number.NaN, Infinity)] }
          : l,
      ),
    });
    const layout = geographicSchematicLayout(deriveTransitNetwork(withNaN));
    expect(layout.stations.map((s) => s.id)).not.toContain('bad');
    for (const p of [
      ...layout.segments.flatMap((s) => s.points),
      ...layout.stations,
    ]) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
});
