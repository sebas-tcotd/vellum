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
    ellipse: vi.fn(),
    rect: vi.fn(),
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

  it('llama stroke dos veces por segmento en ruta (bg + fg)', () => {
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
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
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

  it('dos líneas en el mismo segmento tienen anchos de trazo distintos (bandas concéntricas)', () => {
    const lineWidths: number[] = [];
    const ctx = makeCtx();
    Object.defineProperty(ctx, 'lineWidth', {
      set: (v: number) => lineWidths.push(v),
      get: () => lineWidths.at(-1) ?? 0,
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

    // 2 líneas × 2 passes (bg + fg) = 4 strokes
    expect(ctx.stroke).toHaveBeenCalledTimes(4);
    // La primera línea usa un trazo más ancho que la segunda (banda exterior vs interior)
    const uniqueWidths = new Set(lineWidths);
    expect(uniqueWidths.size).toBeGreaterThan(1);
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
    // Cada modo dibuja en bg + fg = 2 strokes por línea
    expect(ctx.stroke).toHaveBeenCalledTimes(modes.length * 2);
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
    // 2 segmentos × 2 passes (bg + fg) = 4 strokes
    expect(ctx.stroke).toHaveBeenCalledTimes(4);
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

      // points=[] → 2 worldPoints → 1 moveTo + 1 lineTo por pass; 2 passes → 2 moveTo + 2 lineTo
      expect(moveToCalls).toHaveLength(2);
      expect(lineToCalls).toHaveLength(2);
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

      // worldPoints = [startNode, midpoint, endNode] → 1 moveTo + 2 lineTo por pass; 2 passes → 2 moveTo + 4 lineTo
      expect(moveToCalls).toHaveLength(2);
      expect(lineToCalls).toHaveLength(4);
    });

    it('punto intermedio produce primer lineTo distinto al de un segmento recto', () => {
      const straightLineTo: [number, number][] = [];
      const curvedLineTo: [number, number][] = [];

      const ctxStraight = makeCtx();
      ctxStraight.lineTo = vi.fn((x: number, y: number) =>
        straightLineTo.push([x, y]),
      );
      const ctxCurved = makeCtx();
      ctxCurved.lineTo = vi.fn((x: number, y: number) =>
        curvedLineTo.push([x, y]),
      );

      const line = makeTransitLine({ route: [{ segmentIds: ['seg-1'] }] });

      // Segmento recto: el primer lineTo va directo a node-2
      renderTransitLayer(
        ctxStraight,
        [line],
        makeSegmentMap([DEFAULT_SEGMENT]),
        makeNodeMap(DEFAULT_NODES),
        BOUNDS,
        800,
        800,
        1,
      );

      // Segmento curvo: el primer lineTo va al punto intermedio (-500, 500)
      const segCurved: RoadSegment = {
        ...DEFAULT_SEGMENT,
        points: [{ x: -500, y: 60, z: 500 }],
      };
      renderTransitLayer(
        ctxCurved,
        [line],
        makeSegmentMap([segCurved]),
        makeNodeMap(DEFAULT_NODES),
        BOUNDS,
        800,
        800,
        1,
      );

      // El primer lineTo difiere: en recto va a node-2, en curvo va al punto intermedio
      expect(straightLineTo[0]).not.toEqual(curvedLineTo[0]);
    });
  });

  describe('renderizado de paradas', () => {
    it('parada Bus solitaria renderiza círculo (arc llamado)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Bus',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Bus',
        position: { x: 500, y: 60, z: 0 },
      });
      const line = makeTransitLine({ stops: [stopA, stopB], route: [] });

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

      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.rect).not.toHaveBeenCalled();
    });

    it('parada Tram solitaria renderiza cuadrado (rect llamado, arc no llamado)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Tram',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Tram',
        position: { x: 500, y: 60, z: 0 },
      });
      const line = makeTransitLine({
        mode: 'Tram',
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

      expect(ctx.rect).toHaveBeenCalled();
      expect(ctx.arc).not.toHaveBeenCalled();
      expect(ctx.ellipse).not.toHaveBeenCalled();
    });

    it('parada Train solitaria renderiza diamante (moveTo/lineTo/closePath, no arc/rect)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Train',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Train',
        position: { x: 500, y: 60, z: 0 },
      });
      const line = makeTransitLine({
        mode: 'Train',
        stops: [stopA, stopB],
        route: [], // empty route → drawOffsetPolyline never runs; all moveTo/lineTo come from the stop marker
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

      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.closePath).toHaveBeenCalled();
      expect(ctx.arc).not.toHaveBeenCalled();
      expect(ctx.rect).not.toHaveBeenCalled();
    });

    it('parada Metro renderiza círculo invertido (arc llamado, fillStyle=lineColor, strokeStyle=blanco)', () => {
      const fillStyles: string[] = [];
      const strokeStyles: string[] = [];
      const ctx = makeCtx();
      Object.defineProperty(ctx, 'fillStyle', {
        set: (v: string) => fillStyles.push(v),
        get: () => fillStyles.at(-1) ?? '',
      });
      Object.defineProperty(ctx, 'strokeStyle', {
        set: (v: string) => strokeStyles.push(v),
        get: () => strokeStyles.at(-1) ?? '',
      });
      const lineColor = '#FF6600';
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Metro',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Metro',
        position: { x: 500, y: 60, z: 0 },
      });
      const line = makeTransitLine({
        color: lineColor,
        mode: 'Metro',
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

      expect(ctx.arc).toHaveBeenCalled();
      // Metro inverts colors: line color is the fill, white is the stroke
      expect(fillStyles).toContain(lineColor);
      expect(strokeStyles).toContain('#ffffff');
    });

    it('parada Blimp renderiza elipse (ellipse llamado)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Blimp',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Blimp',
        position: { x: 500, y: 60, z: 0 },
      });
      const line = makeTransitLine({
        mode: 'Blimp',
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

      expect(ctx.ellipse).toHaveBeenCalled();
      expect(ctx.arc).not.toHaveBeenCalled();
    });

    it('parada CableCar renderiza triángulo (moveTo/lineTo/closePath, no arc/rect/ellipse)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'CableCar',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'CableCar',
        position: { x: 500, y: 60, z: 0 },
      });
      const line = makeTransitLine({
        mode: 'CableCar',
        stops: [stopA, stopB],
        route: [], // empty route → drawOffsetPolyline never runs; all moveTo/lineTo come from the stop marker
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

      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.closePath).toHaveBeenCalled();
      expect(ctx.arc).not.toHaveBeenCalled();
      expect(ctx.rect).not.toHaveBeenCalled();
      expect(ctx.ellipse).not.toHaveBeenCalled();
    });

    it('parada Monorail renderiza rectángulo horizontal (rect llamado, no arc/ellipse)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Monorail',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Monorail',
        position: { x: 500, y: 60, z: 0 },
      });
      const line = makeTransitLine({
        mode: 'Monorail',
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

      expect(ctx.rect).toHaveBeenCalled();
      expect(ctx.arc).not.toHaveBeenCalled();
      expect(ctx.ellipse).not.toHaveBeenCalled();
    });

    it('parada Ferry renderiza pentágono (moveTo/lineTo/closePath, no arc/rect/ellipse)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Ferry',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Ferry',
        position: { x: 500, y: 60, z: 0 },
      });
      const line = makeTransitLine({
        mode: 'Ferry',
        stops: [stopA, stopB],
        route: [], // empty route → drawOffsetPolyline never runs; all moveTo/lineTo come from the stop marker
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

      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.closePath).toHaveBeenCalled();
      expect(ctx.arc).not.toHaveBeenCalled();
      expect(ctx.rect).not.toHaveBeenCalled();
      expect(ctx.ellipse).not.toHaveBeenCalled();
    });

    it('todos los TransitMode de paradas renderizan sin error', () => {
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
        'Unknown',
      ] as const;
      const ctx = makeCtx();
      const lines = modes.map((mode, i) => {
        const stopA = makeStop({
          id: `stop-${i}a`,
          mode,
          position: { x: i * 200, y: 60, z: 0 },
        });
        const stopB = makeStop({
          id: `stop-${i}b`,
          mode,
          position: { x: i * 200 + 500, y: 60, z: 0 },
        });
        return makeTransitLine({
          id: `line-${i}`,
          mode,
          stops: [stopA, stopB],
          route: [],
        });
      });

      expect(() =>
        renderTransitLayer(
          ctx,
          lines,
          new Map(),
          new Map(),
          BOUNDS,
          800,
          800,
          1,
        ),
      ).not.toThrow();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('dos paradas Bus cercanas se fusionan en un único círculo', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Bus',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Bus',
        position: { x: 10, y: 60, z: 0 },
      });

      const lineA = makeTransitLine({
        id: 'line-a',
        stops: [stopA],
        route: [],
      });
      const lineB = makeTransitLine({
        id: 'line-b',
        stops: [stopB],
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

      // stopA y stopB están a 10m → mismo modo (Bus) → fusionados → 1 solo arc
      expect(ctx.arc).toHaveBeenCalledTimes(1);
    });

    it('Bus y Tram en la misma ubicación → ambas formas dibujadas (arc Y rect)', () => {
      const ctx = makeCtx();
      const stopBus = makeStop({
        id: 'stop-bus',
        mode: 'Bus',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopTram = makeStop({
        id: 'stop-tram',
        mode: 'Tram',
        position: { x: 5, y: 60, z: 0 },
      });

      const lineBus = makeTransitLine({
        id: 'line-bus',
        mode: 'Bus',
        stops: [
          stopBus,
          makeStop({ id: 'stop-bus2', position: { x: 500, y: 60, z: 0 } }),
        ],
        route: [],
      });
      const lineTram = makeTransitLine({
        id: 'line-tram',
        mode: 'Tram',
        stops: [
          stopTram,
          makeStop({ id: 'stop-tram2', position: { x: -500, y: 60, z: 0 } }),
        ],
        route: [],
      });

      renderTransitLayer(
        ctx,
        [lineBus, lineTram],
        new Map(),
        new Map(),
        BOUNDS,
        800,
        800,
        1,
      );

      // Multi-modo en el mismo grupo → arc (Bus) Y rect (Tram) ambos llamados
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.rect).toHaveBeenCalled();
    });

    it('dos paradas lejanas (>48m) NO se fusionan — cada una tiene su propio marcador', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Bus',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Bus',
        position: { x: 100, y: 60, z: 0 },
      });

      const lineA = makeTransitLine({
        id: 'line-a',
        stops: [stopA],
        route: [],
      });
      const lineB = makeTransitLine({
        id: 'line-b',
        stops: [stopB],
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

      // 100m > 48m → 2 grupos separados → arc llamado 2 veces (2 círculos Bus)
      expect(ctx.arc).toHaveBeenCalledTimes(2);
    });

    it(`STOP_MERGE_THRESHOLD es ${STOP_MERGE_THRESHOLD} metros`, () => {
      expect(STOP_MERGE_THRESHOLD).toBe(48);
    });

    it('paradas exactamente a 48m se fusionan (límite ≤ threshold)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Bus',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Bus',
        position: { x: 48, y: 60, z: 0 },
      });

      const lineA = makeTransitLine({
        id: 'line-a',
        stops: [stopA],
        route: [],
      });
      const lineB = makeTransitLine({
        id: 'line-b',
        stops: [stopB],
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

      // 48m === STOP_MERGE_THRESHOLD → fusionar → 1 solo arc
      expect(ctx.arc).toHaveBeenCalledTimes(1);
    });

    it('paradas exactamente a 49m NO se fusionan (>threshold)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Bus',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Bus',
        position: { x: 49, y: 60, z: 0 },
      });

      const lineA = makeTransitLine({
        id: 'line-a',
        stops: [stopA],
        route: [],
      });
      const lineB = makeTransitLine({
        id: 'line-b',
        stops: [stopB],
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

      // 49m > STOP_MERGE_THRESHOLD → 2 grupos separados → arc llamado 2 veces
      expect(ctx.arc).toHaveBeenCalledTimes(2);
    });

    it('línea con un solo stop renderiza su marcador', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Bus',
        position: { x: 0, y: 60, z: 0 },
      });
      const line = makeTransitLine({ stops: [stopA], route: [] });

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

      // Un solo stop en una línea → se renderiza como grupo solitario → arc llamado
      expect(ctx.arc).toHaveBeenCalled();
    });

    it('parada Trolleybus renderiza círculo (arc llamado, sin rect/ellipse)', () => {
      const ctx = makeCtx();
      const stopA = makeStop({
        id: 'stop-a',
        mode: 'Trolleybus',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopB = makeStop({
        id: 'stop-b',
        mode: 'Trolleybus',
        position: { x: 500, y: 60, z: 0 },
      });
      const line = makeTransitLine({
        mode: 'Trolleybus',
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

      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.rect).not.toHaveBeenCalled();
      expect(ctx.ellipse).not.toHaveBeenCalled();
    });

    it('AC2: Bus y Tram fusionados se disponen en fila horizontal centrada en el centroide', () => {
      const arcXPositions: number[] = [];
      const rectXPositions: number[] = [];
      const ctx = makeCtx();
      ctx.arc = vi.fn((x: number) => arcXPositions.push(x));
      ctx.rect = vi.fn((x: number) => rectXPositions.push(x));

      // Both stops at (0,0) → centroid (0,0) → canvasCX=400, canvasCY=400
      const stopBus = makeStop({
        id: 'stop-bus',
        mode: 'Bus',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopTram = makeStop({
        id: 'stop-tram',
        mode: 'Tram',
        position: { x: 0, y: 60, z: 0 },
      });

      const lineBus = makeTransitLine({
        id: 'line-bus',
        mode: 'Bus',
        stops: [stopBus],
        route: [],
      });
      const lineTram = makeTransitLine({
        id: 'line-tram',
        mode: 'Tram',
        stops: [stopTram],
        route: [],
      });

      renderTransitLayer(
        ctx,
        [lineBus, lineTram],
        new Map(),
        new Map(),
        BOUNDS,
        800,
        800,
        1,
      );

      // 2 modes, MULTI_STOP_SPACING=11: startX = 400 - 5.5 = 394.5
      // Bus (index 0) → arc at cx=394.5
      // Tram (index 1) → rect at cx=405.5, so rect first arg = 405.5 - 4 = 401.5
      expect(arcXPositions[0]).toBeCloseTo(394.5, 1);
      expect(rectXPositions[0]).toBeCloseTo(401.5, 1);
    });

    it('AC2: tres modos únicos en la misma ubicación → tres formas distintas dibujadas', () => {
      const ctx = makeCtx();

      const stopBus = makeStop({
        id: 'stop-bus',
        mode: 'Bus',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopTram = makeStop({
        id: 'stop-tram',
        mode: 'Tram',
        position: { x: 0, y: 60, z: 0 },
      });
      const stopTrain = makeStop({
        id: 'stop-train',
        mode: 'Train',
        position: { x: 0, y: 60, z: 0 },
      });

      const lineBus = makeTransitLine({
        id: 'line-bus',
        mode: 'Bus',
        stops: [stopBus],
        route: [],
      });
      const lineTram = makeTransitLine({
        id: 'line-tram',
        mode: 'Tram',
        stops: [stopTram],
        route: [],
      });
      const lineTrain = makeTransitLine({
        id: 'line-train',
        mode: 'Train',
        stops: [stopTrain],
        route: [],
      });

      renderTransitLayer(
        ctx,
        [lineBus, lineTram, lineTrain],
        new Map(),
        new Map(),
        BOUNDS,
        800,
        800,
        1,
      );

      // 3 unique modes → arc (Bus) + rect (Tram) + moveTo/lineTo/closePath (Train) all called
      expect(ctx.arc).toHaveBeenCalledTimes(1);
      expect(ctx.rect).toHaveBeenCalledTimes(1);
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.closePath).toHaveBeenCalled();
    });
  });
});
