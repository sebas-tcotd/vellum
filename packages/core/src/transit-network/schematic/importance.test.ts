import { describe, expect, it } from 'vitest';
import { makeCityData, makeRoadSegment, makeTransitLine } from '../../testing';
import type {
  CityData,
  RoadNode,
  TransitMode,
  TransitStop,
} from '../../types/city-data';
import type { TransitNetwork } from '../../types/transit-network';
import { TRANSIT_MODES } from '../../types/layer';
import { deriveTransitNetwork } from '../index';
import { filterSchematicLayout } from './index';
import { geographicSchematicLayout } from './geographic';
import {
  gridSchematicLayout,
  schematicLayoutDiagnostics,
  schematicRoutingOrder,
} from './grid-layout';
import {
  isDashedTransitMode,
  routingRank,
  schematicTierStyle,
  TRANSIT_MODE_IMPORTANCE,
  tramRoutesFirst,
  visualTiers,
} from './importance';
import { countBendsByMode, measureSchematicLayout } from './metrics';
import { createOctilinearGrid, octilinearSchematicLayout } from './octilinear';
import { deriveSchematicTransitNetwork } from './station-contraction';

const node = (id: string, x: number, z: number): RoadNode => ({
  id,
  position: { x, y: 0, z },
});

const stop = (
  id: string,
  x: number,
  z: number,
  mode: TransitMode,
): TransitStop => ({ id, mode, position: { x, y: 0, z }, name: `Stop ${id}` });

interface Corridor {
  /** Lines riding it, by mode. */
  readonly modes: readonly TransitMode[];
}

/**
 * One horizontal corridor per entry, 1000 units long and 1000 apart, each
 * ridden by its own lines. Line ids are `<corridor><index>` so the order is
 * readable in a failure.
 */
function corridorCity(corridors: readonly Corridor[]): CityData {
  const roadNodes: RoadNode[] = [];
  const roadSegments = corridors.map((_, i) => {
    roadNodes.push(node(`w${i}`, 0, i * 1000), node(`e${i}`, 1000, i * 1000));
    return makeRoadSegment({
      id: `c${i}`,
      startNodeId: `w${i}`,
      endNodeId: `e${i}`,
    });
  });
  const transitLines = corridors.flatMap((corridor, i) =>
    corridor.modes.map((mode, j) =>
      makeTransitLine({
        id: `c${i}-${j}`,
        name: `${mode} ${i}-${j}`,
        mode,
        color: '#123456',
        stops: [
          stop(`s${i}-w`, 0, i * 1000, mode),
          stop(`s${i}-e`, 1000, i * 1000, mode),
        ],
        route: [{ segmentIds: [`c${i}`] }],
      }),
    ),
  );
  return makeCityData({ roadNodes, roadSegments, transitLines });
}

/** The modes riding each corridor, in routing order. */
function routedModes(
  network: TransitNetwork,
  order?: 'importance' | 'weight',
): string[] {
  return schematicRoutingOrder(network, order).map((edgeId) => {
    const edge = network.edges.get(edgeId);
    const modes = new Set<string>();
    for (const bundleId of edge?.bundleIds ?? []) {
      for (const lineId of network.bundles.get(bundleId)?.lineIds ?? []) {
        const mode = network.lines.get(lineId)?.mode;
        if (mode) modes.add(mode);
      }
    }
    return [...modes].sort().join('+');
  });
}

const repeat = (mode: TransitMode, n: number): TransitMode[] =>
  Array.from({ length: n }, () => mode);

describe('the importance table', () => {
  it('rates every mode, with the scale Sebas set', () => {
    // One entry per mode: a mode added to `TransitMode` must be placed.
    expect(Object.keys(TRANSIT_MODE_IMPORTANCE).sort()).toEqual(
      [...TRANSIT_MODES].sort(),
    );
    expect(TRANSIT_MODE_IMPORTANCE).toMatchObject({
      Metro: 5,
      Train: 4,
      Monorail: 4,
      Tram: 3,
      Bus: 3,
      Trolleybus: 2,
      CableCar: 2,
      Ferry: 2,
      Helicopter: 2,
      Blimp: 1,
      WalkingTour: 1,
      SightseeingBus: 1,
      HotAirBalloon: 1,
      Unknown: 1,
      Airplane: null,
      PassengerShip: null,
      IntercityBus: null,
      EvacuationBus: null,
      Taxi: null,
    });
  });

  it('ranks with integers: metro 10, train 8, tram 7 or 6, bus 6', () => {
    expect(routingRank('Metro', false)).toBe(10);
    expect(routingRank('Train', true)).toBe(8);
    expect(routingRank('Tram', true)).toBe(7);
    expect(routingRank('Tram', false)).toBe(6);
    expect(routingRank('Bus', true)).toBe(6);
  });

  it('decides the tram rule on line counts, without overflowing', () => {
    const lines = (trams: number, buses: number) => [
      ...repeat('Tram', trams).map((mode) => ({ mode })),
      ...repeat('Bus', buses).map((mode) => ({ mode })),
    ];
    expect(tramRoutesFirst(lines(2, 4))).toBe(true);
    expect(tramRoutesFirst(lines(1, 3))).toBe(false);
    expect(tramRoutesFirst(lines(1, 2))).toBe(true);
    // 31 trams or more: true without computing `1 << 31`, which overflows.
    expect(tramRoutesFirst(lines(31, 5000))).toBe(true);
    expect(tramRoutesFirst(lines(12, 4097))).toBe(false);
    expect(tramRoutesFirst(lines(12, 4096))).toBe(true);
  });

  it('tiers the visible levels relative to each other', () => {
    expect([...visualTiers(['Metro', 'Bus'])]).toEqual([
      ['Metro', 0],
      ['Bus', 1],
    ]);
    // Tram and bus share a level, so they share a tier.
    const tiers = visualTiers(['Bus', 'Tram', 'Train', 'Blimp']);
    expect(tiers.get('Train')).toBe(0);
    expect(tiers.get('Tram')).toBe(1);
    expect(tiers.get('Bus')).toBe(1);
    expect(tiers.get('Blimp')).toBe(2);
    // Out-of-scale modes get no tier.
    expect(visualTiers(['Airplane']).size).toBe(0);
  });

  it('styles a tier, and draws a layout without tiers as it always did', () => {
    expect(schematicTierStyle(undefined)).toEqual({ width: 1, opacity: 1 });
    expect(schematicTierStyle(0)).toEqual({ width: 1, opacity: 1 });
    expect(schematicTierStyle(1)).toEqual({ width: 0.75, opacity: 0.85 });
    expect(schematicTierStyle(2)).toEqual({ width: 0.55, opacity: 0.7 });
    expect(schematicTierStyle(3)).toEqual({ width: 0.4, opacity: 0.55 });
    expect(schematicTierStyle(7)).toEqual({ width: 0.4, opacity: 0.55 });
    expect(isDashedTransitMode('WalkingTour')).toBe(true);
    expect(isDashedTransitMode('Bus')).toBe(false);
  });
});

describe('routing order by urban importance', () => {
  it('routes one metro line before a corridor of six buses', () => {
    const network = deriveTransitNetwork(
      corridorCity([{ modes: repeat('Bus', 6) }, { modes: ['Metro'] }]),
    );
    expect(routedModes(network)).toEqual(['Metro', 'Bus']);
    // The order before Story 4.7: the heaviest corridor won.
    expect(routedModes(network, 'weight')).toEqual(['Bus', 'Metro']);
  });

  it('routes trams first when buses <= 2 ** trams (2 trams, 4 buses)', () => {
    const network = deriveTransitNetwork(
      corridorCity([{ modes: repeat('Bus', 4) }, { modes: repeat('Tram', 2) }]),
    );
    expect(routedModes(network)).toEqual(['Tram', 'Bus']);
  });

  it('lets the weight decide when the rule fails (1 tram, 3 buses)', () => {
    const network = deriveTransitNetwork(
      corridorCity([{ modes: ['Tram'] }, { modes: repeat('Bus', 3) }]),
    );
    expect(routedModes(network)).toEqual(['Bus', 'Tram']);
  });

  it('lays the same network out identically twice', () => {
    const city = corridorCity([
      { modes: ['Metro', 'Bus'] },
      { modes: ['Train'] },
      { modes: ['Tram', 'Bus', 'Bus'] },
    ]);
    const first = octilinearSchematicLayout(deriveTransitNetwork(city));
    const second = octilinearSchematicLayout(deriveTransitNetwork(city));
    expect(second).toEqual(first);
  });
});

describe('visual weight of a drawn layout', () => {
  it('draws a bus-only city at full weight', () => {
    const layout = geographicSchematicLayout(
      deriveTransitNetwork(corridorCity([{ modes: repeat('Bus', 3) }])),
    );
    expect(layout.segments.length).toBeGreaterThan(0);
    expect(layout.segments.every((s) => s.tier === 0)).toBe(true);
    expect(layout.stations.every((s) => s.tier === 0)).toBe(true);
  });

  it('draws the lower tiers first and promotes the train when the metro is hidden', () => {
    const network = deriveTransitNetwork(
      corridorCity([
        { modes: ['Metro'] },
        { modes: ['Train'] },
        { modes: ['Bus'] },
      ]),
    );
    const layout = geographicSchematicLayout(network);
    const tierOf = (lineId: string) =>
      layout.segments.find((s) => s.lineId === lineId)?.tier;
    expect([tierOf('c0-0'), tierOf('c1-0'), tierOf('c2-0')]).toEqual([0, 1, 2]);
    // Lowest tier first: the bus is painted under the train and the metro.
    expect(layout.segments.map((s) => s.tier)).toEqual([2, 1, 0]);

    // Hiding the metro is a projection: same corridors, the train moves up.
    const filtered = filterSchematicLayout(layout, ['c1-0', 'c2-0']);
    expect(filtered.corridors).toBe(layout.corridors);
    expect(filtered.segments.map((s) => [s.lineId, s.tier, s.points])).toEqual([
      ['c2-0', 1, layout.segments[0].points],
      ['c1-0', 0, layout.segments[1].points],
    ]);
  });

  it('thins a station along its line with the tier of its best line', () => {
    const network = deriveTransitNetwork(
      corridorCity([{ modes: ['Metro'] }, { modes: ['Bus'] }]),
    );
    const layout = geographicSchematicLayout(network);
    const extent = (lineId: string) => {
      const station = layout.stations.find((s) => s.lineIds.includes(lineId));
      const xs = (station?.shape ?? []).map((p) => p.x);
      return { tier: station?.tier, width: Math.max(...xs) - Math.min(...xs) };
    };
    const metro = extent('c0-0');
    const bus = extent('c1-0');
    expect(metro.tier).toBe(0);
    expect(bus.tier).toBe(1);
    // The corridors run along x, so x is the thickness along the line.
    expect(bus.width / metro.width).toBeCloseTo(0.75, 6);
  });

  it('carries tier and dash on the inner connections too', () => {
    // A bus that turns at a node shared with the metro gets an inner
    // connection there; so does a walking tour on the same corridors.
    const city = makeCityData({
      roadNodes: [node('a', 0, 0), node('b', 1000, 0), node('c', 1000, 1000)],
      roadSegments: [
        makeRoadSegment({ id: 'ab', startNodeId: 'a', endNodeId: 'b' }),
        makeRoadSegment({ id: 'bc', startNodeId: 'b', endNodeId: 'c' }),
      ],
      transitLines: [
        makeTransitLine({
          id: 'metro',
          mode: 'Metro',
          stops: [stop('pa', 0, 0, 'Metro'), stop('pb', 1000, 0, 'Metro')],
          route: [{ segmentIds: ['ab'] }],
        }),
        makeTransitLine({
          id: 'bus',
          mode: 'Bus',
          stops: [stop('qa', 0, 0, 'Bus'), stop('qc', 1000, 1000, 'Bus')],
          route: [{ segmentIds: ['ab', 'bc'] }],
        }),
        makeTransitLine({
          id: 'tour',
          mode: 'WalkingTour',
          stops: [
            stop('ta', 0, 0, 'WalkingTour'),
            stop('tc', 1000, 1000, 'WalkingTour'),
          ],
          route: [{ segmentIds: ['ab', 'bc'] }],
        }),
      ],
    });
    const layout = geographicSchematicLayout(deriveTransitNetwork(city));
    const bus = layout.connectors.filter((c) => c.lineId === 'bus');
    const tour = layout.connectors.filter((c) => c.lineId === 'tour');
    expect(bus.length).toBeGreaterThan(0);
    expect(tour.length).toBeGreaterThan(0);
    expect(bus.every((c) => c.tier === 1 && c.dashed === undefined)).toBe(true);
    expect(tour.every((c) => c.dashed === true && c.tier === 2)).toBe(true);
  });

  it('dashes the tours', () => {
    const layout = geographicSchematicLayout(
      deriveTransitNetwork(
        corridorCity([{ modes: ['Bus'] }, { modes: ['WalkingTour'] }]),
      ),
    );
    const byLine = new Map(layout.segments.map((s) => [s.lineId, s]));
    expect(byLine.get('c1-0')?.dashed).toBe(true);
    expect(byLine.get('c0-0')?.dashed).toBeUndefined();
  });
});

describe('layout by layers', () => {
  // A metro line running straight east, and a bus line whose end node sits
  // in the cell the metro's straight run goes through.
  const metroUnderBusCity = (): CityData =>
    makeCityData({
      roadNodes: [
        node('mw', 0, 0),
        node('me', 2000, 0),
        node('bs', 1000, 0),
        node('bn', 1000, 1000),
      ],
      roadSegments: [
        makeRoadSegment({ id: 'metro', startNodeId: 'mw', endNodeId: 'me' }),
        makeRoadSegment({ id: 'bus', startNodeId: 'bs', endNodeId: 'bn' }),
      ],
      transitLines: [
        makeTransitLine({
          id: 'm',
          name: 'Metro',
          mode: 'Metro',
          color: '#00aa00',
          stops: [stop('m-w', 0, 0, 'Metro'), stop('m-e', 2000, 0, 'Metro')],
          route: [{ segmentIds: ['metro'] }],
        }),
        makeTransitLine({
          id: 'b',
          name: 'Bus',
          mode: 'Bus',
          color: '#0000aa',
          stops: [stop('b-s', 1000, 0, 'Bus'), stop('b-n', 1000, 1000, 'Bus')],
          route: [{ segmentIds: ['bus'] }],
        }),
      ],
    });

  it('lays the rails out before a bus node can take a cell on their way', () => {
    const network = deriveTransitNetwork(metroUnderBusCity());
    const bends = (order: 'importance' | 'weight'): number =>
      countBendsByMode(
        network,
        gridSchematicLayout(network, createOctilinearGrid, {
          routingOrder: order,
        }),
      ).Metro ?? 0;
    // By layers, the metro is placed and routed while the bus does not exist.
    // (Before Story 4.7 every node took its cell first and the metro bent round
    // the bus terminus. Since Story 4.9 a node settles in the route of its
    // first corridor (`octi` §4.2), so even the order by weight no longer pins
    // the bus first; what layers guarantee is the metro's straight run.)
    expect(bends('importance')).toBe(0);
  });

  it('moves a bus node that collides with a metro node off the metro route', () => {
    // The bus terminus snaps onto the metro's east node. The nearest free
    // cell is the next one west, on the metro's straight run; the rule
    // prefers a cell no route above uses.
    const city = makeCityData({
      roadNodes: [
        node('mw', 0, 0),
        node('me', 2000, 0),
        node('bs', 1955, 0),
        node('bn', 1955, 1000),
      ],
      roadSegments: [
        makeRoadSegment({ id: 'metro', startNodeId: 'mw', endNodeId: 'me' }),
        makeRoadSegment({ id: 'bus', startNodeId: 'bs', endNodeId: 'bn' }),
      ],
      transitLines: [
        makeTransitLine({
          id: 'm',
          mode: 'Metro',
          stops: [stop('m-w', 0, 0, 'Metro'), stop('m-e', 2000, 0, 'Metro')],
          route: [{ segmentIds: ['metro'] }],
        }),
        makeTransitLine({
          id: 'b',
          mode: 'Bus',
          stops: [stop('b-s', 1955, 0, 'Bus'), stop('b-n', 1955, 1000, 'Bus')],
          route: [{ segmentIds: ['bus'] }],
        }),
      ],
    });
    const network = deriveTransitNetwork(city);
    const layout = gridSchematicLayout(network, createOctilinearGrid);
    const corridorOf = (lineId: string) =>
      layout.corridors.find((c) => c.slots.some((s) => s.lineId === lineId));
    const metro = corridorOf('m')?.points ?? [];
    const bus = corridorOf('b')?.points ?? [];
    expect(metro.length).toBeGreaterThanOrEqual(2);
    expect(bus.length).toBeGreaterThanOrEqual(2);
    // It did collide: the bus terminus had to move. Since Story 4.9 the search
    // may also displace other nodes when that is cheaper (`octi` §4.2).
    expect(
      schematicLayoutDiagnostics(layout)?.relocatedNodes,
    ).toBeGreaterThanOrEqual(1);
    // The metro still runs straight along one row.
    expect(new Set(metro.map((p) => p.y)).size).toBe(1);
    const row = metro[0].y;
    const [minX, maxX] = [
      Math.min(...metro.map((p) => p.x)),
      Math.max(...metro.map((p) => p.x)),
    ];
    // Neither bus end sits on the metro's run (row and span, inclusive).
    for (const end of [bus[0], bus[bus.length - 1]]) {
      const onMetro =
        Math.abs(end.y - row) < 1e-6 &&
        end.x >= minX - 1e-6 &&
        end.x <= maxX + 1e-6;
      expect(onMetro).toBe(false);
    }
  });
});

describe('modes outside the scale', () => {
  it('leaves planes and passenger ships out of the schematic network', () => {
    const city = corridorCity([
      { modes: ['Bus'] },
      { modes: ['Airplane'] },
      { modes: ['PassengerShip', 'IntercityBus'] },
    ]);
    const network = deriveSchematicTransitNetwork(city);
    expect([...network.lines.values()].map((l) => l.mode)).toEqual(['Bus']);
    // The map's network still has them.
    expect(deriveTransitNetwork(city).lines.size).toBe(4);
  });
});

describe('bends per mode', () => {
  it('reports every mode of the layout, zero for straight runs', () => {
    const network = deriveTransitNetwork(
      corridorCity([{ modes: ['Metro'] }, { modes: ['Bus'] }]),
    );
    const { metrics } = measureSchematicLayout(
      network,
      geographicSchematicLayout(network),
    );
    expect(metrics.bendsByMode).toEqual({ Bus: 0, Metro: 0 });
  });
});
