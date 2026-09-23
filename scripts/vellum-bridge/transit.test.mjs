import { describe, expect, it } from 'vitest';
import { transitRoutes } from './compare.mjs';

const leg = (pathSegments, pathReady = true) => ({
  fromStop: 1,
  toStop: 2,
  segment: 9,
  pathUnit: 1,
  pathReady,
  pathSegments,
  pathLanes: pathSegments.map(() => 0),
  pathOffsets: pathSegments.map(() => 0),
});

const roads = [
  { id: 10, name: 'Spruce Street' },
  { id: 11, name: 'Ward Street' },
  { id: 12, name: null },
];

describe('rutas de tránsito', () => {
  it('compara el camino crudo con la secuencia de .cslmap por ID de línea', () => {
    const [line] = transitRoutes(
      {
        roads,
        transit: [
          {
            id: 3,
            name: 'Bus Line 2',
            stopNodeIds: [1, 2],
            stopRoadSegments: [10, 12],
            legs: [leg([10, 11]), leg([11, 10])],
          },
        ],
      },
      [
        {
          id: '3',
          route: [{ segmentIds: ['10', '11'] }, { segmentIds: ['11', '10'] }],
        },
      ],
    );
    expect(line).toMatchObject({
      id: 3,
      stops: 2,
      stopsOnNamedRoad: 1,
      inCslmap: true,
      legs: 2,
      legsWithoutPath: 0,
      rawPositions: 4,
      cslmapPositions: 4,
      sameSequence: true,
      segmentOverlap: 1,
    });
  });

  it('distingue rutas distintas, tramos sin ruta y líneas ausentes en .cslmap', () => {
    const [changed, missing] = transitRoutes(
      {
        roads,
        transit: [
          {
            id: 3,
            stopNodeIds: [1],
            stopRoadSegments: [11],
            legs: [leg([10, 12]), leg([], false)],
          },
          { id: 4, stopNodeIds: [], stopRoadSegments: [], legs: [] },
        ],
      },
      [{ id: '3', route: [{ segmentIds: ['10', '11'] }] }],
    );
    expect(changed).toMatchObject({
      legsWithoutPath: 1,
      sameSequence: false,
      segmentOverlap: 0.333,
    });
    expect(missing).toMatchObject({
      inCslmap: false,
      sameSequence: null,
      segmentOverlap: null,
    });
  });

  it('reconoce .cslmap como subsecuencia del camino crudo y segmentos inexistentes', () => {
    const [same, stale] = transitRoutes(
      {
        roads,
        transit: [
          { id: 3, stopNodeIds: [1], legs: [leg([10, 10, 11])] },
          { id: 4, stopNodeIds: [1], legs: [leg([10, 11])] },
        ],
      },
      [
        { id: '3', route: [{ segmentIds: ['10', '11'] }] },
        { id: '4', route: [{ segmentIds: ['10', '99', '11'] }] },
      ],
    );
    expect(same).toMatchObject({
      sameSequence: false,
      cslmapIsSubsequence: true,
      segmentOverlap: 1,
      cslmapMissingSegments: 0,
    });
    expect(stale).toMatchObject({
      cslmapIsSubsequence: false,
      cslmapMissingSegments: 1,
    });
  });

  it('declara líneas sin tramos capturados en vez de compararlas vacías', () => {
    const [line] = transitRoutes(
      { roads, transit: [{ id: 3, stopNodeIds: [1], legs: null }] },
      [],
    );
    expect(line).toMatchObject({
      error: 'tramos no capturados',
      stopsOnNamedRoad: null,
    });
    expect(transitRoutes({ transit: null }, [])).toEqual({
      error: 'tránsito ausente',
    });
  });
});
