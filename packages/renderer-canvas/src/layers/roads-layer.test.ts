import { describe, it, expect, vi } from 'vitest';
import { renderRoadsLayer } from './roads-layer';
import type { RoadNode } from '@vellum/core';
import { makeCityData, makeRoadSegment } from '@vellum/core/testing';

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

function makeNodeMap(nodes: RoadNode[]): Map<string, RoadNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

const DEFAULT_NODES: RoadNode[] = [
  { id: 'node-1', position: { x: -1000, y: 60, z: -1000 } },
  { id: 'node-2', position: { x: 1000, y: 60, z: 1000 } },
];

const MOCK_TOKENS = {
  terrain: '#f7f6f1',
  terrainLow: '#b2c29d',
  terrainMid: '#deddbe',
  terrainHigh: '#eee5b2',
  water: '#90cccb',
  green: '#d0dcae',
  text: '#333333',
  transitBg: '#1a1a2e',
  roadHighway: '#f6a800',
  roadArterial: '#fcd47a',
  roadLocal: '#ffffff',
  roadPedestrian: '#ededed',
  roadCasing: '#aaaaaa',
};

const BOUNDS = makeCityData().bounds;

describe('renderRoadsLayer', () => {
  it('no lanza con segmentos vacíos', () => {
    const ctx = makeCtx();
    expect(() =>
      renderRoadsLayer(ctx, [], new Map(), BOUNDS, MOCK_TOKENS, 800, 800, 1),
    ).not.toThrow();
  });

  it('no lanza si un nodo no existe (referencia rota)', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'missing-1',
      endNodeId: 'missing-2',
    });
    expect(() =>
      renderRoadsLayer(ctx, [seg], new Map(), BOUNDS, MOCK_TOKENS, 800, 800, 1),
    ).not.toThrow();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('llama stroke dos veces por segmento (casing + fill)', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({ startNodeId: 'node-1', endNodeId: 'node-2' });
    renderRoadsLayer(
      ctx,
      [seg],
      makeNodeMap(DEFAULT_NODES),
      BOUNDS,
      MOCK_TOKENS,
      800,
      800,
      1,
    );
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it('aplica color de highway para WayType Highway', () => {
    const ctx = makeCtx();
    const colors: string[] = [];
    Object.defineProperty(ctx, 'strokeStyle', {
      set: (v: string) => colors.push(v),
      get: () => colors.at(-1) ?? '',
    });
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      wayType: ['Highway'],
    });
    renderRoadsLayer(
      ctx,
      [seg],
      makeNodeMap(DEFAULT_NODES),
      BOUNDS,
      MOCK_TOKENS,
      800,
      800,
      1,
    );
    expect(colors).toContain('#f6a800');
  });

  it('aplica color de local para WayType Road', () => {
    const ctx = makeCtx();
    const colors: string[] = [];
    Object.defineProperty(ctx, 'strokeStyle', {
      set: (v: string) => colors.push(v),
      get: () => colors.at(-1) ?? '',
    });
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      wayType: ['Road'],
    });
    renderRoadsLayer(
      ctx,
      [seg],
      makeNodeMap(DEFAULT_NODES),
      BOUNDS,
      MOCK_TOKENS,
      800,
      800,
      1,
    );
    expect(colors).toContain('#ffffff');
  });

  it('ancho highway > ancho local (jerarquía visual)', () => {
    const highwayWidths: number[] = [];
    const highwayCtx = makeCtx();
    Object.defineProperty(highwayCtx, 'lineWidth', {
      set: (v: number) => highwayWidths.push(v),
      get: () => highwayWidths.at(-1) ?? 0,
    });

    const localWidths: number[] = [];
    const localCtx = makeCtx();
    Object.defineProperty(localCtx, 'lineWidth', {
      set: (v: number) => localWidths.push(v),
      get: () => localWidths.at(-1) ?? 0,
    });

    const nodes = makeNodeMap(DEFAULT_NODES);
    const hSeg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      wayType: ['Highway'],
    });
    const lSeg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      wayType: ['Road'],
    });

    renderRoadsLayer(
      highwayCtx,
      [hSeg],
      nodes,
      BOUNDS,
      MOCK_TOKENS,
      800,
      800,
      1,
    );
    renderRoadsLayer(localCtx, [lSeg], nodes, BOUNDS, MOCK_TOKENS, 800, 800, 1);

    // La pasada de fill (segunda asignación) es el ancho visible
    const highwayFillWidth = highwayWidths.at(-1) ?? 0;
    const localFillWidth = localWidths.at(-1) ?? 0;
    expect(highwayFillWidth).toBeGreaterThan(localFillWidth);
  });

  it('flags compuestos: ["Road", "Elevated", "Highway"] → estilo highway', () => {
    const ctx = makeCtx();
    const colors: string[] = [];
    Object.defineProperty(ctx, 'strokeStyle', {
      set: (v: string) => colors.push(v),
      get: () => colors.at(-1) ?? '',
    });
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      wayType: ['Road', 'Elevated', 'Highway'],
    });
    renderRoadsLayer(
      ctx,
      [seg],
      makeNodeMap(DEFAULT_NODES),
      BOUNDS,
      MOCK_TOKENS,
      800,
      800,
      1,
    );
    expect(colors).toContain('#f6a800');
  });

  it('zoom mayor → ancho mayor (fórmula fixed + scaled × zoom)', () => {
    const widthsZoom1: number[] = [];
    const ctx1 = makeCtx();
    Object.defineProperty(ctx1, 'lineWidth', {
      set: (v: number) => widthsZoom1.push(v),
      get: () => widthsZoom1.at(-1) ?? 0,
    });

    const widthsZoom3: number[] = [];
    const ctx3 = makeCtx();
    Object.defineProperty(ctx3, 'lineWidth', {
      set: (v: number) => widthsZoom3.push(v),
      get: () => widthsZoom3.at(-1) ?? 0,
    });

    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      wayType: ['Road'],
    });
    const nodes = makeNodeMap(DEFAULT_NODES);
    renderRoadsLayer(ctx1, [seg], nodes, BOUNDS, MOCK_TOKENS, 800, 800, 1);
    renderRoadsLayer(ctx3, [seg], nodes, BOUNDS, MOCK_TOKENS, 800, 800, 3);

    const fillWidth1 = widthsZoom1.at(-1) ?? 0;
    const fillWidth3 = widthsZoom3.at(-1) ?? 0;
    expect(fillWidth3).toBeGreaterThan(fillWidth1);
  });
});
