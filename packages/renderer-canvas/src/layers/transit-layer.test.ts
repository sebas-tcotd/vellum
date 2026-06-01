import { describe, it, expect, vi } from 'vitest';
import { renderTransitLayer, STOP_MERGE_THRESHOLD } from './transit-layer';
import type { RoadSegment, RoadNode, TransitStop } from '@vellum/core';
import { makeCityData, makeTransitLine } from '@vellum/core/testing';

function makeCtx() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    fillStyle: '',
  } as unknown as OffscreenCanvasRenderingContext2D;
}

function makeStop(overrides?: Partial<TransitStop>): TransitStop {
  return {
    id: 'stop-1',
    mode: 'Bus',
    position: { x: 0, y: 60, z: 0 },
    name: 'Test Stop',
    ...overrides,
  };
}

const DEFAULT_NODES: RoadNode[] = [
  { id: 'node-1', position: { x: -1000, y: 60, z: -1000 } },
  { id: 'node-2', position: { x: 1000, y: 60, z: 1000 } },
  { id: 'node-3', position: { x: 1000, y: 60, z: -1000 } },
];

function makeSegmentMap(segs: RoadSegment[]): Map<string, RoadSegment> {
  return new Map(segs.map((s) => [s.id, s]));
}

function makeNodeMap(nodes: RoadNode[]): Map<string, RoadNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

const DEFAULT_SEGMENT: RoadSegment = {
  id: 'seg-1',
  startNodeId: 'node-1',
  endNodeId: 'node-2',
  points: [],
  wayType: ['Road'],
  itemClass: 'Basic Road',
  width: 16,
};

const BOUNDS = makeCityData().bounds;

describe('renderTransitLayer', () => {
  it('no lanza con transitLines vacío', () => {
    const ctx = makeCtx();
    expect(() =>
      renderTransitLayer(ctx, [], new Map(), new Map(), BOUNDS, 800, 800, 1),
    ).not.toThrow();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('no lanza si un segmento no existe (referencia rota)', () => {
    const ctx = makeCtx();
    const line = makeTransitLine({
      route: [{ segmentIds: ['missing-seg'] }],
    });
    expect(() =>
      renderTransitLayer(
        ctx,
        [line],
        new Map(),
        makeNodeMap(DEFAULT_NODES),
        BOUNDS,
        800,
        800,
        1,
      ),
    ).not.toThrow();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('no lanza si un nodo no existe (referencia rota)', () => {
    const ctx = makeCtx();
    const brokenSeg: RoadSegment = {
      ...DEFAULT_SEGMENT,
      startNodeId: 'missing-node',
    };
    const line = makeTransitLine({ route: [{ segmentIds: ['seg-1'] }] });
    expect(() =>
      renderTransitLayer(
        ctx,
        [line],
        makeSegmentMap([brokenSeg]),
        makeNodeMap(DEFAULT_NODES),
        BOUNDS,
        800,
        800,
        1,
      ),
    ).not.toThrow();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('llama stroke una vez por segmento en ruta', () => {
    const ctx = makeCtx();
    const line = makeTransitLine({ route: [{ segmentIds: ['seg-1'] }] });
    renderTransitLayer(
      ctx,
      [line],
      makeSegmentMap([DEFAULT_SEGMENT]),
      makeNodeMap(DEFAULT_NODES),
      BOUNDS,
      800,
      800,
      1,
    );
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('usa el color de la línea como strokeStyle', () => {
    const ctx = makeCtx();
    const colors: string[] = [];
    Object.defineProperty(ctx, 'strokeStyle', {
      set: (v: string) => colors.push(v),
      get: () => colors.at(-1) ?? '',
    });
    const line = makeTransitLine({
      color: '#AA1122',
      route: [{ segmentIds: ['seg-1'] }],
    });
    renderTransitLayer(
      ctx,
      [line],
      makeSegmentMap([DEFAULT_SEGMENT]),
      makeNodeMap(DEFAULT_NODES),
      BOUNDS,
      800,
      800,
      1,
    );
    expect(colors).toContain('#AA1122');
  });

  it('dos líneas en el mismo segmento tienen offsets distintos', () => {
    const moveToCalls: [number, number][] = [];
    const ctx = makeCtx();
    ctx.moveTo = vi.fn((x: number, y: number) => {
      moveToCalls.push([x, y]);
    });

    const lineA = makeTransitLine({
      id: 'line-a',
      color: '#FF0000',
      route: [{ segmentIds: ['seg-1'] }],
    });
    const lineB = makeTransitLine({
      id: 'line-b',
      color: '#0000FF',
      route: [{ segmentIds: ['seg-1'] }],
    });

    renderTransitLayer(
      ctx,
      [lineA, lineB],
      makeSegmentMap([DEFAULT_SEGMENT]),
      makeNodeMap(DEFAULT_NODES),
      BOUNDS,
      800,
      800,
      1,
    );

    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(moveToCalls[0]).not.toEqual(moveToCalls[1]);
  });

  it('una sola línea en un segmento NO tiene offset (centrada)', () => {
    const moveToCalls: [number, number][] = [];
    const ctx = makeCtx();
    ctx.moveTo = vi.fn((x: number, y: number) => {
      moveToCalls.push([x, y]);
    });

    const line = makeTransitLine({ route: [{ segmentIds: ['seg-1'] }] });
    renderTransitLayer(
      ctx,
      [line],
      makeSegmentMap([DEFAULT_SEGMENT]),
      makeNodeMap(DEFAULT_NODES),
      BOUNDS,
      800,
      800,
      1,
    );

    const node1 = DEFAULT_NODES.find((n) => n.id === 'node-1')!;
    const bounds = BOUNDS;
    const rangeX = bounds.maxX - bounds.minX;
    const rangeZ = bounds.maxZ - bounds.minZ;
    const expectedX = ((node1.position.x - bounds.minX) / rangeX) * 800;
    const expectedY = 800 - ((node1.position.z - bounds.minZ) / rangeZ) * 800;
    expect(moveToCalls[0][0]).toBeCloseTo(expectedX, 1);
    expect(moveToCalls[0][1]).toBeCloseTo(expectedY, 1);
  });

  it('todos los TransitMode renderizan sin error', () => {
    const modes = [
      'Bus',
      'Tram',
      'Train',
      'Metro',
      'CableCar',
      'Monorail',
      'Ferry',
      'Blimp',
      'Trolleybus',
    ] as const;
    const ctx = makeCtx();
    const lines = modes.map((mode, i) =>
      makeTransitLine({
        id: `line-${i}`,
        mode,
        route: [{ segmentIds: ['seg-1'] }],
      }),
    );
    expect(() =>
      renderTransitLayer(
        ctx,
        lines,
        makeSegmentMap([DEFAULT_SEGMENT]),
        makeNodeMap(DEFAULT_NODES),
        BOUNDS,
        800,
        800,
        1,
      ),
    ).not.toThrow();
    expect(ctx.stroke).toHaveBeenCalledTimes(modes.length);
  });

  it('no renderiza nada con bounds degenerados (rangeX=0)', () => {
    const ctx = makeCtx();
    const line = makeTransitLine({ route: [{ segmentIds: ['seg-1'] }] });
    const degenerateBounds = { ...BOUNDS, minX: 100, maxX: 100 };
    renderTransitLayer(
      ctx,
      [line],
      makeSegmentMap([DEFAULT_SEGMENT]),
      makeNodeMap(DEFAULT_NODES),
      degenerateBounds,
      800,
      800,
      1,
    );
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('ruta con múltiples PathSegments y múltiples segmentos llama stroke por cada segmento', () => {
    const ctx = makeCtx();
    const seg2: RoadSegment = {
      ...DEFAULT_SEGMENT,
      id: 'seg-2',
      startNodeId: 'node-2',
      endNodeId: 'node-3',
    };
    const line = makeTransitLine({
      route: [{ segmentIds: ['seg-1'] }, { segmentIds: ['seg-2'] }],
    });
    renderTransitLayer(
      ctx,
      [line],
      makeSegmentMap([DEFAULT_SEGMENT, seg2]),
      makeNodeMap(DEFAULT_NODES),
      BOUNDS,
      800,
      800,
      1,
    );
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  describe('geometría de segmento (points)', () => {
    it('segmento sin points intermedios dibuja línea recta (fallback)', () => {
      const moveToCalls: [number, number][] = [];
      const lineToCalls: [number, number][] = [];
      const ctx = makeCtx();
      ctx.moveTo = vi.fn((x, y) => moveToCalls.push([x, y]));
      ctx.lineTo = vi.fn((x, y) => lineToCalls.push([x, y]));

      const line = makeTransitLine({ route: [{ segmentIds: ['seg-1'] }] });
      renderTransitLayer(
        ctx,
        [line],
        makeSegmentMap([DEFAULT_SEGMENT]),
        makeNodeMap(DEFAULT_NODES),
        BOUNDS,
        800,
        800,
        1,
      );

      // Con points=[], worldPoints tiene solo 2 elementos → 1 moveTo + 1 lineTo
      expect(moveToCalls).toHaveLength(1);
      expect(lineToCalls).toHaveLength(1);
    });

    it('segmento con un punto intermedio genera polilínea de 3 puntos', () => {
      const moveToCalls: [number, number][] = [];
      const lineToCalls: [number, number][] = [];
      const ctx = makeCtx();
      ctx.moveTo = vi.fn((x, y) => moveToCalls.push([x, y]));
      ctx.lineTo = vi.fn((x, y) => lineToCalls.push([x, y]));

      const segWithMidpoint: RoadSegment = {
        ...DEFAULT_SEGMENT,
        points: [{ x: 0, y: 60, z: 0 }],
      };
      const line = makeTransitLine({ route: [{ segmentIds: ['seg-1'] }] });
      renderTransitLayer(
        ctx,
        [line],
        makeSegmentMap([segWithMidpoint]),
        makeNodeMap(DEFAULT_NODES),
        BOUNDS,
        800,
        800,
        1,
      );

      // worldPoints = [startNode, midpoint, endNode] → 1 moveTo + 2 lineTo
      expect(moveToCalls).toHaveLength(1);
      expect(lineToCalls).toHaveLength(2);
    });

    it('punto intermedio produce moveTo distinto al de un segmento recto', () => {
      const straightMoveTo: [number, number][] = [];
      const curvedMoveTo: [number, number][] = [];

      const ctxStraight = makeCtx();
      ctxStraight.moveTo = vi.fn((x, y) => straightMoveTo.push([x, y]));
      const ctxCurved = makeCtx();
      ctxCurved.moveTo = vi.fn((x, y) => curvedMoveTo.push([x, y]));

      const lineA = makeTransitLine({
        id: 'line-a',
        color: '#FF0000',
        route: [{ segmentIds: ['seg-1'] }],
      });
      const lineB = makeTransitLine({
        id: 'line-b',
        color: '#0000FF',
        route: [{ segmentIds: ['seg-1'] }],
      });

      // Dos líneas en segmento recto: offset perpendicular al eje startNode→endNode
      renderTransitLayer(
        ctxStraight,
        [lineA, lineB],
        makeSegmentMap([DEFAULT_SEGMENT]),
        makeNodeMap(DEFAULT_NODES),
        BOUNDS,
        800,
        800,
        1,
      );

      // Dos líneas en segmento con curva: offset perpendicular al primer sub-segmento
      const segCurved: RoadSegment = {
        ...DEFAULT_SEGMENT,
        points: [{ x: -500, y: 60, z: 500 }],
      };
      renderTransitLayer(
        ctxCurved,
        [lineA, lineB],
        makeSegmentMap([segCurved]),
        makeNodeMap(DEFAULT_NODES),
        BOUNDS,
        800,
        800,
        1,
      );

      // Los moveTos deben diferir porque el vector perpendicular cambió
      expect(straightMoveTo[0]).not.toEqual(curvedMoveTo[0]);
    });
  });

  describe('renderizado de paradas', () => {
    it('parada solitaria renderiza cabeza de flecha (arc no llamado)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({ id: 'stop-a', position: { x: 0, y: 60, z: 0 } });
      const stopB = makeStop({
        id: 'stop-b',
        position: { x: 500, y: 60, z: 0 },
      });
      const line = makeTransitLine({
        stops: [stopA, stopB],
        route: [],
      });

      renderTransitLayer(
        ctx,
        [line],
        new Map(),
        new Map(),
        BOUNDS,
        800,
        800,
        1,
      );

      // Dos stops en la misma línea, sin otro stop cercano → dos arrowheads (arc no se usa)
      expect(ctx.arc).not.toHaveBeenCalled();
      // fill sí se llama para los arrowheads
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.closePath).toHaveBeenCalled();
    });

    it('dos paradas cercanas se fusionan en círculo', () => {
      const ctx = makeCtx();
      // Dos stops de distintas líneas dentro del threshold (< 48m)
      const stopA = makeStop({ id: 'stop-a', position: { x: 0, y: 60, z: 0 } });
      const stopB = makeStop({
        id: 'stop-b',
        position: { x: 10, y: 60, z: 0 },
      });

      const lineA = makeTransitLine({
        id: 'line-a',
        stops: [
          stopA,
          makeStop({ id: 'stop-a2', position: { x: 500, y: 60, z: 0 } }),
        ],
        route: [],
      });
      const lineB = makeTransitLine({
        id: 'line-b',
        stops: [
          stopB,
          makeStop({ id: 'stop-b2', position: { x: -500, y: 60, z: 0 } }),
        ],
        route: [],
      });

      renderTransitLayer(
        ctx,
        [lineA, lineB],
        new Map(),
        new Map(),
        BOUNDS,
        800,
        800,
        1,
      );

      // stopA y stopB están a 10m → se fusionan → circle → arc llamado
      expect(ctx.arc).toHaveBeenCalled();
    });

    it('dos paradas lejanas NO se fusionan (arc no llamado)', () => {
      const ctx = makeCtx();
      // Dos stops de distintas líneas fuera del threshold (> 48m)
      const stopA = makeStop({ id: 'stop-a', position: { x: 0, y: 60, z: 0 } });
      const stopB = makeStop({
        id: 'stop-b',
        position: { x: 100, y: 60, z: 0 },
      });

      const lineA = makeTransitLine({
        id: 'line-a',
        stops: [
          stopA,
          makeStop({ id: 'stop-a2', position: { x: 500, y: 60, z: 0 } }),
        ],
        route: [],
      });
      const lineB = makeTransitLine({
        id: 'line-b',
        stops: [
          stopB,
          makeStop({ id: 'stop-b2', position: { x: -500, y: 60, z: 0 } }),
        ],
        route: [],
      });

      renderTransitLayer(
        ctx,
        [lineA, lineB],
        new Map(),
        new Map(),
        BOUNDS,
        800,
        800,
        1,
      );

      // 100m > STOP_MERGE_THRESHOLD (48) → no merge → sólo arrowheads
      expect(ctx.arc).not.toHaveBeenCalled();
    });

    it(`STOP_MERGE_THRESHOLD es ${STOP_MERGE_THRESHOLD} metros`, () => {
      expect(STOP_MERGE_THRESHOLD).toBe(48);
    });

    it('línea con un solo stop no renderiza arrowhead (no hay siguiente stop para dirección)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({ id: 'stop-a', position: { x: 0, y: 60, z: 0 } });
      const line = makeTransitLine({
        stops: [stopA],
        route: [],
      });

      expect(() =>
        renderTransitLayer(
          ctx,
          [line],
          new Map(),
          new Map(),
          BOUNDS,
          800,
          800,
          1,
        ),
      ).not.toThrow();

      // Con un solo stop no hay dirección → se omite sin crash
      expect(ctx.fill).not.toHaveBeenCalled();
    });
  });
});
