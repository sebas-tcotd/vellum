import { describe, expect, it } from 'vitest';
import { deriveTransitNetwork } from './index';
import { makeCityData, makeRoadSegment, makeTransitLine } from '../testing';
import type { CityData, RoadNode } from '../types/city-data';

function node(id: string, x: number, z: number): RoadNode {
  return { id, position: { x, y: 0, z } };
}

function segment(id: string, from: string, to: string) {
  return makeRoadSegment({ id, startNodeId: from, endNodeId: to });
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

function point(value: { x: number; z: number }): [number, number] {
  return [rounded(value.x), rounded(value.z)];
}

/** Stable, JSON-safe baseline spanning topology, order, transitions and geometry. */
function normalize(city: CityData) {
  const network = deriveTransitNetwork(city);
  const geometry = network.renderGeometry;

  return {
    lines: [...network.lines.values()].map(({ id, mode, color }) => ({
      id,
      mode,
      color,
    })),
    bundles: [...network.bundles.values()].map(({ id, lineIds, weight }) => ({
      id,
      lineIds,
      weight,
    })),
    edges: [...network.edges.values()].map((edge) => ({
      id: edge.id,
      nodes: [edge.nodeA, edge.nodeB],
      segments: edge.segmentIds,
      path: edge.path.map(point),
      order: network.lineOrder.get(edge.id),
    })),
    transitions: network.transitions,
    corridors: geometry.corridors.map((corridor) => ({
      id: corridor.edgeId,
      slots: corridor.slots,
      path: corridor.path.map(point),
    })),
    connectors: geometry.connectors.map((connector) => ({
      line: connector.lineId,
      path: connector.path.map(point),
    })),
    stations: geometry.stations.map((station) => ({
      id: station.id,
      lines: station.lines,
      polygon: station.polygon.map(point),
    })),
  };
}

describe('baseline normalizada LOOM previa al traslado', () => {
  it('corredor compartido conserva bundle, orden, slots y estación', () => {
    const stop = {
      id: 'central',
      mode: 'Bus' as const,
      position: { x: 50, y: 0, z: 0 },
      name: 'Central',
    };
    const city = makeCityData({
      roadNodes: [node('a', 0, 0), node('b', 100, 0)],
      roadSegments: [segment('s', 'a', 'b')],
      transitLines: [
        makeTransitLine({
          id: 'metro',
          name: 'Metro',
          mode: 'Metro',
          color: '#112233',
          route: [{ segmentIds: ['s'] }],
          stops: [stop],
        }),
        makeTransitLine({
          id: 'bus',
          name: 'Bus',
          mode: 'Bus',
          color: '#abcdef',
          route: [{ segmentIds: ['s'] }],
          stops: [stop],
        }),
      ],
    });

    expect(normalize(city)).toMatchInlineSnapshot(`
      {
        "bundles": [
          {
            "id": "bus",
            "lineIds": [
              "bus",
              "metro",
            ],
            "weight": 2,
          },
        ],
        "connectors": [],
        "corridors": [
          {
            "id": "c:s",
            "path": [
              [
                0,
                0,
              ],
              [
                100,
                0,
              ],
            ],
            "slots": [
              {
                "lineId": "metro",
                "offsetIndex": -0.5,
              },
              {
                "lineId": "bus",
                "offsetIndex": 0.5,
              },
            ],
          },
        ],
        "edges": [
          {
            "id": "c:s",
            "nodes": [
              "a",
              "b",
            ],
            "order": [
              "metro",
              "bus",
            ],
            "path": [
              [
                0,
                0,
              ],
              [
                100,
                0,
              ],
            ],
            "segments": [
              "s",
            ],
          },
        ],
        "lines": [
          {
            "color": "#112233",
            "id": "metro",
            "mode": "Metro",
          },
          {
            "color": "#abcdef",
            "id": "bus",
            "mode": "Bus",
          },
        ],
        "stations": [
          {
            "id": "central:c:s",
            "lines": [
              {
                "color": "#abcdef",
                "mode": "Bus",
                "name": "Bus",
              },
              {
                "color": "#112233",
                "mode": "Metro",
                "name": "Metro",
              },
            ],
            "polygon": [
              [
                53.75,
                -2.25,
              ],
              [
                53.4645,
                -3.6851,
              ],
              [
                52.6517,
                -4.9017,
              ],
              [
                51.4351,
                -5.7145,
              ],
              [
                50,
                -6,
              ],
              [
                50,
                -6,
              ],
              [
                48.5649,
                -5.7145,
              ],
              [
                47.3483,
                -4.9017,
              ],
              [
                46.5355,
                -3.6851,
              ],
              [
                46.25,
                -2.25,
              ],
              [
                46.25,
                2.25,
              ],
              [
                46.5355,
                3.6851,
              ],
              [
                47.3483,
                4.9017,
              ],
              [
                48.5649,
                5.7145,
              ],
              [
                50,
                6,
              ],
              [
                50,
                6,
              ],
              [
                51.4351,
                5.7145,
              ],
              [
                52.6517,
                4.9017,
              ],
              [
                53.4645,
                3.6851,
              ],
              [
                53.75,
                2.25,
              ],
              [
                53.75,
                -2.25,
              ],
            ],
          },
        ],
        "transitions": [],
      }
    `);
  });

  it('loop con ramales conserva todas las transiciones, incluido wrap', () => {
    const city = makeCityData({
      roadNodes: [
        node('a', 0, 0),
        node('b', 100, 0),
        node('c', 50, 80),
        node('ta', -50, -40),
        node('tb', 150, -40),
        node('tc', 50, 130),
      ],
      roadSegments: [
        segment('ab', 'a', 'b'),
        segment('bc', 'b', 'c'),
        segment('ca', 'c', 'a'),
        segment('ra', 'a', 'ta'),
        segment('rb', 'b', 'tb'),
        segment('rc', 'c', 'tc'),
      ],
      transitLines: [
        makeTransitLine({
          id: 'loop',
          mode: 'Tram',
          color: '#ff6600',
          route: [{ segmentIds: ['ab', 'bc', 'ca'] }],
        }),
        makeTransitLine({ id: 'ra', route: [{ segmentIds: ['ra'] }] }),
        makeTransitLine({ id: 'rb', route: [{ segmentIds: ['rb'] }] }),
        makeTransitLine({ id: 'rc', route: [{ segmentIds: ['rc'] }] }),
      ],
    });

    expect(normalize(city)).toMatchInlineSnapshot(`
      {
        "bundles": [
          {
            "id": "loop",
            "lineIds": [
              "loop",
            ],
            "weight": 1,
          },
          {
            "id": "ra",
            "lineIds": [
              "ra",
            ],
            "weight": 1,
          },
          {
            "id": "rb",
            "lineIds": [
              "rb",
            ],
            "weight": 1,
          },
          {
            "id": "rc",
            "lineIds": [
              "rc",
            ],
            "weight": 1,
          },
        ],
        "connectors": [
          {
            "line": "loop",
            "path": [
              [
                95.75,
                0,
              ],
              [
                96.3449,
                0.0975,
              ],
              [
                96.8803,
                0.3666,
              ],
              [
                97.3367,
                0.7718,
              ],
              [
                97.6944,
                1.2779,
              ],
              [
                97.934,
                1.8495,
              ],
              [
                98.0357,
                2.4512,
              ],
              [
                97.9801,
                3.0478,
              ],
              [
                97.7475,
                3.604,
              ],
            ],
          },
          {
            "line": "loop",
            "path": [
              [
                52.2525,
                76.396,
              ],
              [
                51.8239,
                76.8974,
              ],
              [
                51.28,
                77.2556,
              ],
              [
                50.6592,
                77.4704,
              ],
              [
                50,
                77.5421,
              ],
              [
                49.3408,
                77.4704,
              ],
              [
                48.72,
                77.2556,
              ],
              [
                48.1761,
                76.8974,
              ],
              [
                47.7475,
                76.396,
              ],
            ],
          },
          {
            "line": "loop",
            "path": [
              [
                2.2525,
                3.604,
              ],
              [
                2.0199,
                3.0478,
              ],
              [
                1.9643,
                2.4512,
              ],
              [
                2.066,
                1.8495,
              ],
              [
                2.3056,
                1.2779,
              ],
              [
                2.6633,
                0.7718,
              ],
              [
                3.1197,
                0.3666,
              ],
              [
                3.6551,
                0.0975,
              ],
              [
                4.25,
                0,
              ],
            ],
          },
        ],
        "corridors": [
          {
            "id": "c:ab",
            "path": [
              [
                4.25,
                0,
              ],
              [
                95.75,
                0,
              ],
            ],
            "slots": [
              {
                "lineId": "loop",
                "offsetIndex": 0,
              },
            ],
          },
          {
            "id": "c:bc",
            "path": [
              [
                97.7475,
                3.604,
              ],
              [
                52.2525,
                76.396,
              ],
            ],
            "slots": [
              {
                "lineId": "loop",
                "offsetIndex": 0,
              },
            ],
          },
          {
            "id": "c:ca",
            "path": [
              [
                2.2525,
                3.604,
              ],
              [
                47.7475,
                76.396,
              ],
            ],
            "slots": [
              {
                "lineId": "loop",
                "offsetIndex": 0,
              },
            ],
          },
          {
            "id": "c:ra",
            "path": [
              [
                -3.3187,
                -2.655,
              ],
              [
                -50,
                -40,
              ],
            ],
            "slots": [
              {
                "lineId": "ra",
                "offsetIndex": 0,
              },
            ],
          },
          {
            "id": "c:rb",
            "path": [
              [
                103.3187,
                -2.655,
              ],
              [
                150,
                -40,
              ],
            ],
            "slots": [
              {
                "lineId": "rb",
                "offsetIndex": 0,
              },
            ],
          },
          {
            "id": "c:rc",
            "path": [
              [
                50,
                84.25,
              ],
              [
                50,
                130,
              ],
            ],
            "slots": [
              {
                "lineId": "rc",
                "offsetIndex": 0,
              },
            ],
          },
        ],
        "edges": [
          {
            "id": "c:ab",
            "nodes": [
              "a",
              "b",
            ],
            "order": [
              "loop",
            ],
            "path": [
              [
                0,
                0,
              ],
              [
                100,
                0,
              ],
            ],
            "segments": [
              "ab",
            ],
          },
          {
            "id": "c:bc",
            "nodes": [
              "b",
              "c",
            ],
            "order": [
              "loop",
            ],
            "path": [
              [
                100,
                0,
              ],
              [
                50,
                80,
              ],
            ],
            "segments": [
              "bc",
            ],
          },
          {
            "id": "c:ca",
            "nodes": [
              "a",
              "c",
            ],
            "order": [
              "loop",
            ],
            "path": [
              [
                0,
                0,
              ],
              [
                50,
                80,
              ],
            ],
            "segments": [
              "ca",
            ],
          },
          {
            "id": "c:ra",
            "nodes": [
              "a",
              "ta",
            ],
            "order": [
              "ra",
            ],
            "path": [
              [
                0,
                0,
              ],
              [
                -50,
                -40,
              ],
            ],
            "segments": [
              "ra",
            ],
          },
          {
            "id": "c:rb",
            "nodes": [
              "b",
              "tb",
            ],
            "order": [
              "rb",
            ],
            "path": [
              [
                100,
                0,
              ],
              [
                150,
                -40,
              ],
            ],
            "segments": [
              "rb",
            ],
          },
          {
            "id": "c:rc",
            "nodes": [
              "c",
              "tc",
            ],
            "order": [
              "rc",
            ],
            "path": [
              [
                50,
                80,
              ],
              [
                50,
                130,
              ],
            ],
            "segments": [
              "rc",
            ],
          },
        ],
        "lines": [
          {
            "color": "#ff6600",
            "id": "loop",
            "mode": "Tram",
          },
          {
            "color": "#FF6600",
            "id": "ra",
            "mode": "Bus",
          },
          {
            "color": "#FF6600",
            "id": "rb",
            "mode": "Bus",
          },
          {
            "color": "#FF6600",
            "id": "rc",
            "mode": "Bus",
          },
        ],
        "stations": [],
        "transitions": [
          {
            "fromEdge": "c:ab",
            "fromEnd": "end",
            "lineId": "loop",
            "nodeId": "b",
            "toEdge": "c:bc",
            "toEnd": "start",
          },
          {
            "fromEdge": "c:bc",
            "fromEnd": "end",
            "lineId": "loop",
            "nodeId": "c",
            "toEdge": "c:ca",
            "toEnd": "end",
          },
          {
            "fromEdge": "c:ca",
            "fromEnd": "start",
            "lineId": "loop",
            "nodeId": "a",
            "toEdge": "c:ab",
            "toEnd": "start",
          },
        ],
      }
    `);
  });

  it('modos DLC y Unknown conservan modo, color, prioridad y geometría', () => {
    const city = makeCityData({
      roadNodes: [node('a', 0, 0), node('b', 90, 0)],
      roadSegments: [segment('s', 'a', 'b')],
      transitLines: [
        makeTransitLine({
          id: 'unknown',
          mode: 'Unknown',
          color: '#010203',
          route: [{ segmentIds: ['s'] }],
        }),
        makeTransitLine({
          id: 'blimp',
          mode: 'Blimp',
          color: '#aabbcc',
          route: [{ segmentIds: ['s'] }],
        }),
      ],
    });

    expect(normalize(city)).toMatchInlineSnapshot(`
      {
        "bundles": [
          {
            "id": "blimp",
            "lineIds": [
              "blimp",
              "unknown",
            ],
            "weight": 2,
          },
        ],
        "connectors": [],
        "corridors": [
          {
            "id": "c:s",
            "path": [
              [
                0,
                0,
              ],
              [
                90,
                0,
              ],
            ],
            "slots": [
              {
                "lineId": "blimp",
                "offsetIndex": -0.5,
              },
              {
                "lineId": "unknown",
                "offsetIndex": 0.5,
              },
            ],
          },
        ],
        "edges": [
          {
            "id": "c:s",
            "nodes": [
              "a",
              "b",
            ],
            "order": [
              "blimp",
              "unknown",
            ],
            "path": [
              [
                0,
                0,
              ],
              [
                90,
                0,
              ],
            ],
            "segments": [
              "s",
            ],
          },
        ],
        "lines": [
          {
            "color": "#010203",
            "id": "unknown",
            "mode": "Unknown",
          },
          {
            "color": "#aabbcc",
            "id": "blimp",
            "mode": "Blimp",
          },
        ],
        "stations": [],
        "transitions": [],
      }
    `);
  });

  it('referencia virtual rota conserva el fallback sobre vías reales', () => {
    const city = makeCityData({
      roadNodes: [node('a', 0, 0), node('b', 100, 0), node('c', 200, 0)],
      roadSegments: [segment('101', 'a', 'b'), segment('102', 'b', 'c')],
      transitLines: [
        makeTransitLine({
          id: 'bus-line',
          mode: 'Bus',
          color: '#cc0000',
          route: [{ segmentIds: ['101', 'virtual-201', '102'] }],
        }),
      ],
    });

    expect(normalize(city)).toMatchInlineSnapshot(`
      {
        "bundles": [
          {
            "id": "bus-line",
            "lineIds": [
              "bus-line",
            ],
            "weight": 1,
          },
        ],
        "connectors": [],
        "corridors": [
          {
            "id": "c:101",
            "path": [
              [
                0,
                0,
              ],
              [
                100,
                0,
              ],
              [
                200,
                0,
              ],
            ],
            "slots": [
              {
                "lineId": "bus-line",
                "offsetIndex": 0,
              },
            ],
          },
        ],
        "edges": [
          {
            "id": "c:101",
            "nodes": [
              "a",
              "c",
            ],
            "order": [
              "bus-line",
            ],
            "path": [
              [
                0,
                0,
              ],
              [
                100,
                0,
              ],
              [
                200,
                0,
              ],
            ],
            "segments": [
              "101",
              "102",
            ],
          },
        ],
        "lines": [
          {
            "color": "#cc0000",
            "id": "bus-line",
            "mode": "Bus",
          },
        ],
        "stations": [],
        "transitions": [],
      }
    `);
  });
});
