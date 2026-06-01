import { describe, it, expect, vi } from 'vitest';
import { renderTransitLayer } from './transit-layer';
import type { RoadSegment, RoadNode } from '@vellum/core';
import { makeCityData, makeTransitLine } from '@vellum/core/testing';

function makeCtx() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  } as unknown as OffscreenCanvasRenderingContext2D;
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
});
