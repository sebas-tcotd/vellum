import { describe, expect, it } from 'vitest';
import {
  makeCityData,
  transitFixture,
  makeRoadSegment,
  makeTransitLine,
} from '../../testing';
import type { CityData, RoadNode, TransitStop } from '../../types/city-data';
import { deriveTransitNetwork } from '../index';
import {
  filterSchematicLayout,
  geographicSchematicLayout,
  isSchematicLayoutEmpty,
} from './index';

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
    // Presentation provenance intentionally retains source facts for semantic
    // zoom. Assert the drawable contract here: an undrawable line must not
    // change bounds or any geometry a reader can see.
    expect({
      bounds: b.bounds,
      corridors: b.corridors,
      segments: b.segments,
      connectors: b.connectors,
      stations: b.stations,
    }).toEqual({
      bounds: a.bounds,
      corridors: a.corridors,
      segments: a.segments,
      connectors: a.connectors,
      stations: a.stations,
    });
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

describe('SchematicStation.lineIds', () => {
  it('accumulates every drawable line a deduplicated stop belongs to', () => {
    const layout = geographicSchematicLayout(deriveTransitNetwork(city()));
    const byId = new Map(layout.stations.map((s) => [s.id, s]));
    // `p1` is served by both lines, `p2` only by L1.
    expect(byId.get('p1')?.lineIds).toEqual(['L1', 'L2']);
    expect(byId.get('p2')?.lineIds).toEqual(['L1']);
    expect(Object.isFrozen(byId.get('p1')?.lineIds)).toBe(true);
  });

  it('records membership even when that entry has no usable position', () => {
    // `p1` is served by both lines, but L2 reports it at a broken coordinate.
    // The position L1 gave still places the station, and forgetting L2 here
    // would make the station vanish as soon as L1 alone is hidden.
    const base = city();
    const withBadRepeat = makeCityData({
      ...base,
      transitLines: base.transitLines.map((l) =>
        l.id === 'L2'
          ? { ...l, stops: [stop('p1', Number.NaN, Number.NaN)] }
          : l,
      ),
    });
    const layout = geographicSchematicLayout(
      deriveTransitNetwork(withBadRepeat),
    );
    const p1 = layout.stations.find((s) => s.id === 'p1');
    expect(p1?.lineIds).toEqual(['L1', 'L2']);
    expect(Number.isFinite(p1?.x) && Number.isFinite(p1?.y)).toBe(true);
    // Hiding L1 keeps it: L2 still calls there.
    expect(
      filterSchematicLayout(layout, ['L2']).stations.map((s) => s.id),
    ).toContain('p1');
  });

  it('drops a stop no entry could place at all', () => {
    const base = city();
    const unplaceable = makeCityData({
      ...base,
      transitLines: base.transitLines.map((l) =>
        l.id === 'L2'
          ? { ...l, stops: [stop('nowhere', Number.NaN, Infinity)] }
          : l,
      ),
    });
    const layout = geographicSchematicLayout(deriveTransitNetwork(unplaceable));
    expect(layout.stations.map((s) => s.id)).not.toContain('nowhere');
  });

  it('never records a line that draws nothing', () => {
    const base = city();
    const withOrphan = makeCityData({
      ...base,
      transitLines: [
        ...base.transitLines,
        makeTransitLine({ id: 'L9', stops: [stop('p1', 0, 0)], route: [] }),
      ],
    });
    const layout = geographicSchematicLayout(deriveTransitNetwork(withOrphan));
    for (const station of layout.stations) {
      expect(station.lineIds).not.toContain('L9');
    }
  });
});

describe('filterSchematicLayout', () => {
  const base = (): ReturnType<typeof geographicSchematicLayout> =>
    geographicSchematicLayout(deriveTransitNetwork(city()));

  // Los conectores también se filtran, y sin esto nadie lo miraba: sustituir el
  // filtro por `layout.connectors` dejaba los cinco tests pasando, porque
  // `isSchematicLayoutEmpty` sólo mira segmentos. El síntoma sería un arco del
  // color de una línea oculta sobre un nudo cuyos trazos ya no están.
  it('drops the joints of the lines it hides', () => {
    const full = geographicSchematicLayout(
      deriveTransitNetwork(transitFixture('dense')),
    );
    const lineIds = new Set(full.connectors.map((c) => c.lineId));
    expect(lineIds.size).toBeGreaterThan(1);
    const visible = full.connectors[0].lineId;

    const filtered = filterSchematicLayout(full, [visible]);
    expect(filtered.connectors.length).toBeGreaterThan(0);
    expect(filtered.connectors.every((c) => c.lineId === visible)).toBe(true);
    expect(filtered.connectors.length).toBeLessThan(full.connectors.length);

    expect(filterSchematicLayout(full, []).connectors).toEqual([]);
  });

  it('keeps bounds and every surviving stroke identical', () => {
    const full = base();
    const filtered = filterSchematicLayout(full, ['L1']);
    expect(filtered.bounds).toEqual(full.bounds);
    for (const segment of filtered.segments) {
      const original = full.segments.find(
        (s) => s.lineId === segment.lineId && s.edgeId === segment.edgeId,
      );
      expect(segment.points).toEqual(original?.points);
    }
  });

  it('shrinks a shared capsule onto the slots still being drawn', () => {
    // The symbol is the one thing that moves, and it has to: a capsule spans
    // the slots of the lines calling there, so hiding one of them makes the
    // honest symbol the smaller capsule over what is left. Keeping the wide
    // shape would have a stop claim a service the diagram no longer draws.
    const full = base();
    const shared = full.stations.find((s) => s.lineIds.length > 1);
    expect(shared).toBeDefined();
    const filtered = filterSchematicLayout(full, ['L1']);
    const after = filtered.stations.find((s) => s.id === shared?.id);
    expect(after?.lineIds).toEqual(['L1']);
    const spanOf = (station: typeof shared): number => {
      const xs = (station?.shape ?? []).map((p) => p.x);
      const ys = (station?.shape ?? []).map((p) => p.y);
      return Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      );
    };
    expect(spanOf(after)).toBeLessThan(spanOf(shared));
  });

  it('drops the strokes and the exclusive stops of a hidden line', () => {
    const full = base();
    const filtered = filterSchematicLayout(full, ['L1']);
    expect(filtered.segments.every((s) => s.lineId === 'L1')).toBe(true);
    // `p1` is shared with L1 so it stays; nothing is exclusive to L2 here.
    expect(filtered.stations.map((s) => s.id)).toEqual(['p1', 'p2']);

    const onlyL2 = filterSchematicLayout(full, ['L2']);
    expect(onlyL2.segments.every((s) => s.lineId === 'L2')).toBe(true);
    // `p2` belongs to L1 alone and disappears with it.
    expect(onlyL2.stations.map((s) => s.id)).toEqual(['p1']);
  });

  it('returns the same layout when nothing is hidden', () => {
    const full = base();
    expect(filterSchematicLayout(full, ['L1', 'L2'])).toBe(full);
    // Unknown ids are simply ignored rather than treated as extra lines.
    expect(filterSchematicLayout(full, ['L1', 'L2', 'nope'])).toBe(full);
  });

  it('yields an empty — but still bounded — layout when all lines are hidden', () => {
    const full = base();
    const none = filterSchematicLayout(full, []);
    expect(isSchematicLayoutEmpty(none)).toBe(true);
    expect(none.stations).toEqual([]);
    expect(none.bounds).toEqual(full.bounds);
    expect(Object.isFrozen(none)).toBe(true);
  });

  it('does not mutate the layout it projects', () => {
    const full = base();
    const before = JSON.stringify(full);
    filterSchematicLayout(full, ['L1']);
    filterSchematicLayout(full, []);
    expect(JSON.stringify(full)).toBe(before);
  });
});
