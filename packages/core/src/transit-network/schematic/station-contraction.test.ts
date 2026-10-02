import { describe, expect, it } from 'vitest';
import {
  connectedTerminalCity,
  looseTerminalCity,
  makeCityData,
  makeRoadSegment,
  makeTransitLine,
  splitStationCity,
  transitFixture,
} from '../../testing';
import type { CityData } from '../../types/city-data';
import { deriveTransitNetwork } from '../derive';
import {
  contractSchematicStations,
  deriveSchematicTransitNetwork,
  STATION_CONTRACTION_RADIUS_M,
  STATION_PART_HOP_M,
} from './station-contraction';

const routeOf = (city: CityData, lineId: string): string[] =>
  city.transitLines
    .find((line) => line.id === lineId)!
    .route.flatMap((r) => r.segmentIds);

const stopsOf = (city: CityData, lineId: string): string[] =>
  city.transitLines
    .find((line) => line.id === lineId)!
    .stops.map((stop) => stop.id);

const segmentOf = (city: CityData, segId: string) =>
  city.roadSegments.find((seg) => seg.id === segId)!;

describe('contractSchematicStations', () => {
  it('uses the map threshold for both the radius and the part hop', () => {
    expect(STATION_CONTRACTION_RADIUS_M).toBe(48);
    expect(STATION_PART_HOP_M).toBe(48);
  });

  it('returns the very same CityData when no stop has a stationId', () => {
    const city = transitFixture('dense');
    expect(contractSchematicStations(city)).toBe(city);
  });

  it('drops the bays of a terminal that shares no node with the street', () => {
    const city = looseTerminalCity();
    const contracted = contractSchematicStations(city);

    expect(routeOf(contracted, 'B1')).toEqual(['sa', 'sb', 'sc']);
    expect(stopsOf(contracted, 'B1')).toEqual(['p0', 's1', 'p3']);
    const rep = contracted.transitLines[0].stops[1];
    expect(rep).toMatchObject({
      id: 's1',
      name: 'Stop s1',
      stationId: 'T',
      mode: 'Bus',
      position: { x: 200, y: 0, z: 60 },
    });
    // No spoke was rewired, so no central node is needed.
    expect(contracted.roadNodes.some((n) => n.id.startsWith('station:'))).toBe(
      false,
    );

    const network = deriveSchematicTransitNetwork(city);
    for (const edge of network.edges.values()) {
      expect(edge.segmentIds.some((id) => id.startsWith('tb'))).toBe(false);
    }
    expect(network.stops.filter((s) => s.lineId === 'B1')).toHaveLength(3);
    expect(network.nodes.size).toBeLessThan(
      deriveTransitNetwork(city).nodes.size,
    );
  });

  it('contracts a connected terminal into a central node with spokes', () => {
    const city = connectedTerminalCity();
    const contracted = contractSchematicStations(city);
    const centre = 'station:T:s1';

    expect(routeOf(contracted, 'B1')).toEqual(['sa', 'r1', 'r2', 'sd']);
    expect(contracted.roadNodes.find((n) => n.id === centre)?.position).toEqual(
      { x: 200, y: 0, z: 50 },
    );
    expect(segmentOf(contracted, 'r1')).toMatchObject({
      startNodeId: 'b',
      endNodeId: centre,
      // The curve point at 31.6 m from a stop lay inside the radius.
      points: [],
    });
    expect(segmentOf(contracted, 'r2')).toMatchObject({
      startNodeId: centre,
      endNodeId: 'c',
    });
    // The street the other line uses is untouched.
    expect(segmentOf(contracted, 'sbc')).toBe(segmentOf(city, 'sbc'));
    expect(stopsOf(contracted, 'B1')).toEqual(['p0', 's1', 'p3']);

    const network = deriveSchematicTransitNetwork(city);
    // Both spokes carry only B1, so the corridor runs straight through the
    // central node: one corridor, through the station's centroid.
    const through = network.edges.get(network.segmentToCorridor.get('r1')!)!;
    expect(through.segmentIds).toEqual(['r1', 'r2']);
    expect(through.path).toContainEqual({ x: 200, z: 50 });
    // Exactly one station entry for the terminal.
    expect(
      network.stops.filter((s) => s.lineId === 'B1' && s.stationId === 'T'),
    ).toHaveLength(1);
  });

  it('ends a line that enters and leaves by the same spoke at the station', () => {
    const city = connectedTerminalCity({ sameSide: true });
    const contracted = contractSchematicStations(city);
    const centre = 'station:T:s1';

    expect(routeOf(contracted, 'B3')).toEqual(['sa', 'r1', 'r1', 'sa']);
    const network = deriveSchematicTransitNetwork(city);
    // No U-turn connector: the transition builder skips a corridor to itself.
    expect(
      network.transitions.filter(
        (t) => t.lineId === 'B3' && t.nodeId === centre,
      ),
    ).toEqual([]);
    const spoke = network.edges.get(network.segmentToCorridor.get('r1')!)!;
    expect([spoke.nodeA, spoke.nodeB]).toContain(centre);
  });

  it('never contracts a node a passing line touches', () => {
    const city = connectedTerminalCity({ passing: true });
    const contracted = contractSchematicStations(city);
    const centre = 'station:T:s1';

    // `e1` is touched by B4, which does not stop: it stays where it is.
    expect(segmentOf(contracted, 'x1')).toBe(segmentOf(city, 'x1'));
    expect(segmentOf(contracted, 'x0')).toBe(segmentOf(city, 'x0'));
    expect(segmentOf(contracted, 'r1')).toBe(segmentOf(city, 'r1'));
    expect(segmentOf(contracted, 'i1')).toMatchObject({
      startNodeId: 'e1',
      endNodeId: centre,
    });
    expect(routeOf(contracted, 'B4')).toEqual(routeOf(city, 'B4'));

    const before = deriveTransitNetwork(city);
    const after = deriveSchematicTransitNetwork(city);
    const pathOf = (network: typeof before) =>
      network.edges.get(network.segmentToCorridor.get('x1')!)!.path;
    expect(pathOf(after)).toEqual(pathOf(before));
  });

  it('splits a station whose stops are more than one hop apart into parts', () => {
    const city = splitStationCity();
    const contracted = contractSchematicStations(city);

    const centres = contracted.roadNodes
      .filter((n) => n.id.startsWith('station:'))
      .map((n) => n.id)
      .sort();
    expect(centres).toEqual(['station:A:pb', 'station:A:pm']);
    expect(segmentOf(contracted, 'm1').endNodeId).toBe('station:A:pm');
    expect(segmentOf(contracted, 'b2').startNodeId).toBe('station:A:pb');

    const network = deriveSchematicTransitNetwork(city);
    const metro = network.edges.get(network.segmentToCorridor.get('m1')!)!;
    expect(metro.path).toContainEqual({ x: 0, z: 500 });
    const bus = network.edges.get(network.segmentToCorridor.get('b1')!)!;
    expect(bus.path).toContainEqual({ x: 65, z: 500 });
    expect(
      network.stops.filter((s) => s.stationId === 'A').map((s) => s.stopId),
    ).toEqual(['pb', 'pm']);
  });

  it('leaves a station stop without finite coordinates alone', () => {
    const base = looseTerminalCity();
    const broken = {
      id: 'sx',
      mode: 'Bus' as const,
      position: { x: Number.NaN, y: 0, z: Number.NaN },
      name: 'Broken',
      stationId: 'T',
    };
    const city: CityData = {
      ...base,
      transitLines: base.transitLines.map((line) =>
        line.id === 'B1' ? { ...line, stops: [...line.stops, broken] } : line,
      ),
    };
    const contracted = contractSchematicStations(city);
    const stops = contracted.transitLines.find((l) => l.id === 'B1')!.stops;
    expect(stops.at(-1)).toBe(broken);
    expect(stops.map((s) => s.id)).toEqual(['p0', 's1', 'p3', 'sx']);
  });

  it('uses the first finite copy of a stop shared by several lines', () => {
    const base = looseTerminalCity();
    // `A0` sorts before `B1` and carries a broken copy of `s1`.
    const broken = {
      id: 's1',
      mode: 'Bus' as const,
      position: { x: Number.NaN, y: 0, z: Number.NaN },
      name: 'Stop s1',
      stationId: 'T',
    };
    const city: CityData = {
      ...base,
      transitLines: [
        makeTransitLine({
          id: 'A0',
          stops: [broken],
          route: [{ segmentIds: ['sa'] }],
        }),
        ...base.transitLines,
      ],
    };
    const contracted = contractSchematicStations(city);
    const b1 = contracted.transitLines.find((l) => l.id === 'B1')!;
    expect(b1.stops.map((s) => s.id)).toEqual(['p0', 's1', 'p3']);
    expect(b1.stops[1].position).toEqual({ x: 200, y: 0, z: 60 });
    // The broken copy itself is still left alone.
    expect(contracted.transitLines.find((l) => l.id === 'A0')!.stops[0]).toBe(
      broken,
    );
  });

  it('rewires a segment joining two parts of one station to both centres', () => {
    const at = (id: string, x: number) => ({
      id,
      position: { x, y: 0, z: 10 },
    });
    const city = makeCityData({
      source: 'vellummap',
      roadNodes: [at('o1', -200), at('n1', 0), at('n2', 100), at('o2', 300)],
      roadSegments: [
        makeRoadSegment({ id: 'in', startNodeId: 'o1', endNodeId: 'n1' }),
        makeRoadSegment({ id: 'j', startNodeId: 'n1', endNodeId: 'n2' }),
        makeRoadSegment({ id: 'out', startNodeId: 'n2', endNodeId: 'o2' }),
      ],
      transitLines: [
        makeTransitLine({
          id: 'L',
          stops: [
            {
              id: 'p1',
              mode: 'Bus',
              position: { x: 0, y: 0, z: 0 },
              name: 'Hub',
              stationId: 'A',
            },
            {
              id: 'p2',
              mode: 'Bus',
              position: { x: 100, y: 0, z: 0 },
              name: 'Hub',
              stationId: 'A',
            },
          ],
          route: [{ segmentIds: ['in', 'j', 'out'] }],
        }),
      ],
    });
    const contracted = contractSchematicStations(city);
    expect(routeOf(contracted, 'L')).toEqual(['in', 'j', 'out']);
    expect(segmentOf(contracted, 'j')).toMatchObject({
      startNodeId: 'station:A:p1',
      endNodeId: 'station:A:p2',
    });
  });

  it('only groups by stationId: street stops keep their own identity', () => {
    const city = makeCityData({
      roadNodes: [
        { id: 'a', position: { x: 0, y: 0, z: 0 } },
        { id: 'b', position: { x: 100, y: 0, z: 0 } },
      ],
      roadSegments: [
        makeRoadSegment({ id: 's', startNodeId: 'a', endNodeId: 'b' }),
      ],
      transitLines: [
        makeTransitLine({
          id: 'L',
          stops: [
            {
              id: 'q1',
              mode: 'Bus',
              position: { x: 0, y: 0, z: 0 },
              name: 'X',
            },
            {
              id: 'q2',
              mode: 'Bus',
              position: { x: 10, y: 0, z: 0 },
              name: 'X',
            },
            {
              id: 'q3',
              mode: 'Bus',
              position: { x: 100, y: 0, z: 0 },
              name: 'Y',
              stationId: 'S',
            },
          ],
          route: [{ segmentIds: ['s'] }],
        }),
      ],
    });
    const contracted = contractSchematicStations(city);
    expect(stopsOf(contracted, 'L')).toEqual(['q1', 'q2', 'q3']);
    expect(contracted.transitLines[0].stops[0]).toBe(
      city.transitLines[0].stops[0],
    );
  });

  describe('turnarounds', () => {
    /** A monorail terminus whose turning loop reaches 60 m past the platform. */
    const terminus = (callAtLoop: boolean): CityData =>
      makeCityData({
        source: 'vellummap',
        roadNodes: [
          { id: 'a', position: { x: -300, y: 0, z: 0 } },
          { id: 'e', position: { x: 0, y: 0, z: 10 } },
          { id: 'x', position: { x: 0, y: 0, z: 60 } },
        ],
        roadSegments: [
          makeRoadSegment({ id: 'ra', startNodeId: 'a', endNodeId: 'e' }),
          makeRoadSegment({ id: 'l1', startNodeId: 'e', endNodeId: 'x' }),
          makeRoadSegment({ id: 'l2', startNodeId: 'x', endNodeId: 'e' }),
        ],
        transitLines: [
          makeTransitLine({
            id: 'M',
            mode: 'Monorail',
            stops: [
              {
                id: 'pa',
                mode: 'Monorail',
                position: { x: -300, y: 0, z: 0 },
                name: 'A',
              },
              {
                id: 's1',
                mode: 'Monorail',
                position: { x: 0, y: 0, z: 0 },
                name: 'Terminus',
                stationId: 'T',
              },
              ...(callAtLoop
                ? [
                    {
                      id: 'px',
                      mode: 'Monorail' as const,
                      position: { x: 0, y: 0, z: 60 },
                      name: 'Loop',
                    },
                  ]
                : []),
            ],
            route: [{ segmentIds: ['ra', 'l1', 'l2', 'ra'] }],
          }),
        ],
      });

    it('drops a loop that leaves the station and returns without a call', () => {
      const city = terminus(false);
      expect(routeOf(contractSchematicStations(city), 'M')).toEqual([
        'ra',
        'ra',
      ]);
      const network = deriveSchematicTransitNetwork(city);
      for (const edge of network.edges.values()) {
        expect(edge.nodeA === edge.nodeB).toBe(false);
      }
    });

    it('never drops a loop that is all the line has to draw', () => {
      // The whole drawable route is a no-call loop from the station; `ghost`
      // is not in the road network and must not count as route left over.
      const base = terminus(false);
      const city: CityData = {
        ...base,
        transitLines: base.transitLines.map((line) => ({
          ...line,
          stops: line.stops.filter((s) => s.id === 's1'),
          route: [{ segmentIds: ['l1', 'l2', 'ghost'] }],
        })),
      };
      expect(routeOf(contractSchematicStations(city), 'M')).toEqual([
        'l1',
        'l2',
        'ghost',
      ]);
    });

    it('keeps the loop when the line calls along it', () => {
      expect(routeOf(contractSchematicStations(terminus(true)), 'M')).toEqual([
        'ra',
        'l1',
        'l2',
        'ra',
      ]);
    });
  });

  it('is deterministic and never mutates its input', () => {
    for (const make of [
      looseTerminalCity,
      () => connectedTerminalCity({ sameSide: true, passing: true }),
      splitStationCity,
    ]) {
      const city = make();
      const snapshot = structuredClone(city);
      const first = contractSchematicStations(city);
      const second = contractSchematicStations(city);
      expect(second).toEqual(first);
      expect(city).toEqual(snapshot);
      expect(contractSchematicStations(make())).toEqual(first);
    }
  });

  it('does not change the geographic map network', () => {
    const city = connectedTerminalCity();
    const snapshot = structuredClone(city);
    deriveSchematicTransitNetwork(city);
    expect(deriveTransitNetwork(city)).toEqual(deriveTransitNetwork(snapshot));
    expect(deriveTransitNetwork(city).nodes.has('station:T:s1')).toBe(false);
  });
});
