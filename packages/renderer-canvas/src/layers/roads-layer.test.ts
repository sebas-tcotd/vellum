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
    setLineDash: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'round' as CanvasLineCap,
    lineJoin: 'round' as CanvasLineJoin,
  } as unknown as OffscreenCanvasRenderingContext2D;
}

function makeNodeMap(nodes: RoadNode[]): Map<string, RoadNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

const DEFAULT_NODES: RoadNode[] = [
  { id: 'node-1', position: { x: -1000, y: 60, z: -1000 } },
  { id: 'node-2', position: { x: 1000, y: 60, z: 1000 } },
];

// Tokens Humanitarian — deben coincidir con FALLBACKS en tokens.ts
const MOCK_TOKENS = {
  terrain: '#f7f6f1',
  terrainLow: '#b2c29d',
  terrainMid: '#deddbe',
  terrainHigh: '#eee5b2',
  water: '#6db8b7',
  green: '#d0dcae',
  text: '#333333',
  transitBg: '#1a1a2e',
  roadHighway: '#a098b0',
  roadHighwayCasing: '#7d748e',
  roadLargeArterial: '#d2938e',
  roadLargeArterialCasing: '#b8756e',
  roadMediumArterial: '#d4a882',
  roadLocal: '#e4e1d1',
  roadLocalCasing: '#8a8278',
  roadGravel: '#e0d5c1',
  roadGravelCasing: '#c4b89e',
  roadPedestrian: '#7a6e60',
  roadPedestrianCasing: '#5d5550',
  roadPedestrianWay: '#8b7d6b',
  roadRailway: '#eceff1',
  roadRailwayCasing: '#455a64',
  buildingFill: '#c8bfb5',
  buildingStroke: '#a09585',
};

const BOUNDS = makeCityData().bounds;

// ─── Helpers de captura ───────────────────────────────────────────────────────

function captureColors(ctx: ReturnType<typeof makeCtx>): string[] {
  const colors: string[] = [];
  Object.defineProperty(ctx, 'strokeStyle', {
    set: (v: string) => colors.push(v),
    get: () => colors.at(-1) ?? '',
  });
  return colors;
}

function captureWidths(ctx: ReturnType<typeof makeCtx>): number[] {
  const widths: number[] = [];
  Object.defineProperty(ctx, 'lineWidth', {
    set: (v: number) => widths.push(v),
    get: () => widths.at(-1) ?? 0,
  });
  return widths;
}

// ─── Tests base ───────────────────────────────────────────────────────────────

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

  it('local llama stroke dos veces por segmento (casing + fill)', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Small Road',
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
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it('ancho highway > ancho local (jerarquía visual)', () => {
    const highwayWidths = captureWidths(makeCtx());
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
      itemClass: 'Highway',
      width: 22,
    });
    const lSeg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Small Road',
      width: 16,
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

    const highwayFillWidth = highwayWidths.at(-1) ?? 0;
    const localFillWidth = localWidths.at(-1) ?? 0;
    expect(highwayFillWidth).toBeGreaterThan(localFillWidth);
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
      itemClass: 'Small Road',
    });
    const nodes = makeNodeMap(DEFAULT_NODES);
    renderRoadsLayer(ctx1, [seg], nodes, BOUNDS, MOCK_TOKENS, 800, 800, 1);
    renderRoadsLayer(ctx3, [seg], nodes, BOUNDS, MOCK_TOKENS, 800, 800, 3);

    const fillWidth1 = widthsZoom1.at(-1) ?? 0;
    const fillWidth3 = widthsZoom3.at(-1) ?? 0;
    expect(fillWidth3).toBeGreaterThan(fillWidth1);
  });
});

// ─── Clasificación por itemClass ──────────────────────────────────────────────

describe('classifyRoadSegment — itemClass como fuente de verdad', () => {
  it('Highway → color highway (#a098b0)', () => {
    const ctx = makeCtx();
    const colors = captureColors(ctx);
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Highway',
      width: 22,
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
    expect(colors).toContain('#a098b0');
  });

  it('Large Road → color largeArterial (#d2938e)', () => {
    const ctx = makeCtx();
    const colors = captureColors(ctx);
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Large Road',
      width: 32,
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
    expect(colors).toContain('#d2938e');
  });

  it('Medium Road → color mediumArterial (#d4a882)', () => {
    const ctx = makeCtx();
    const colors = captureColors(ctx);
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Medium Road',
      width: 32,
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
    expect(colors).toContain('#d4a882');
  });

  it('Small Road → color local (#e4e1d1)', () => {
    const ctx = makeCtx();
    const colors = captureColors(ctx);
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Small Road',
      width: 16,
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
    expect(colors).toContain('#e4e1d1');
  });

  it('Pedestrian Way → color pedestrianWay (#8b7d6b)', () => {
    const ctx = makeCtx();
    const colors = captureColors(ctx);
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Pedestrian Way',
      wayType: ['Pedestrian'],
      width: 8,
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
    expect(colors).toContain('#8b7d6b');
  });

  it('Small Road Tunnel → tier local (fill aclarado de #e4e1d1)', () => {
    const ctx = makeCtx();
    const colors = captureColors(ctx);
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Small Road Tunnel',
      wayType: ['Road', 'Tunnel'],
      width: 16,
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
    // El fill de tunnel es la versión aclarada — NO el color original
    expect(colors).not.toContain('#e4e1d1');
    // Debe contener algún color (el aclarado)
    expect(colors.length).toBeGreaterThan(0);
  });
});

// ─── Reglas de casing ─────────────────────────────────────────────────────────

describe('casing condicional — solo tiers neutros', () => {
  it('Large Road: con casing — stroke se llama 2 veces', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Large Road',
      width: 32,
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
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it('Medium Road: sin casing — stroke se llama 1 vez', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Medium Road',
      width: 32,
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
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('Small Road: con casing — stroke se llama 2 veces', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Small Road',
      width: 16,
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
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });

  it('Highway: con casing — stroke se llama 2 veces', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Highway',
      width: 22,
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
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });
});

// ─── Highway connectors ───────────────────────────────────────────────────────

describe('highway connectors (width≤14 → más finos)', () => {
  it('connector (width=12) tiene fill más fino que mainline (width=22)', () => {
    const mainWidths: number[] = [];
    const mainCtx = makeCtx();
    Object.defineProperty(mainCtx, 'lineWidth', {
      set: (v: number) => mainWidths.push(v),
      get: () => mainWidths.at(-1) ?? 0,
    });

    const connWidths: number[] = [];
    const connCtx = makeCtx();
    Object.defineProperty(connCtx, 'lineWidth', {
      set: (v: number) => connWidths.push(v),
      get: () => connWidths.at(-1) ?? 0,
    });

    const nodes = makeNodeMap(DEFAULT_NODES);
    const mainSeg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Highway',
      width: 22,
    });
    const connSeg = makeRoadSegment({
      id: 'seg-conn',
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Highway',
      width: 12,
    });

    renderRoadsLayer(
      mainCtx,
      [mainSeg],
      nodes,
      BOUNDS,
      MOCK_TOKENS,
      800,
      800,
      1,
    );
    renderRoadsLayer(
      connCtx,
      [connSeg],
      nodes,
      BOUNDS,
      MOCK_TOKENS,
      800,
      800,
      1,
    );

    // El fill es la última asignación de lineWidth
    const mainFill = mainWidths.at(-1) ?? 0;
    const connFill = connWidths.at(-1) ?? 0;
    expect(connFill).toBeLessThan(mainFill);
  });

  it('connector y mainline tienen el mismo color (#a098b0)', () => {
    const mainCtx = makeCtx();
    const mainColors = captureColors(mainCtx);
    const connCtx = makeCtx();
    const connColors = captureColors(connCtx);

    const nodes = makeNodeMap(DEFAULT_NODES);
    const mainSeg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Highway',
      width: 22,
    });
    const connSeg = makeRoadSegment({
      id: 'seg-conn',
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Highway',
      width: 12,
    });

    renderRoadsLayer(
      mainCtx,
      [mainSeg],
      nodes,
      BOUNDS,
      MOCK_TOKENS,
      800,
      800,
      1,
    );
    renderRoadsLayer(
      connCtx,
      [connSeg],
      nodes,
      BOUNDS,
      MOCK_TOKENS,
      800,
      800,
      1,
    );

    expect(mainColors).toContain('#a098b0');
    expect(connColors).toContain('#a098b0');
  });
});

// ─── Tunnel / Bridge ──────────────────────────────────────────────────────────

describe('Tunnel treatment', () => {
  it('Small Road Tunnel: activa setLineDash', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Small Road Tunnel',
      wayType: ['Road', 'Tunnel'],
      width: 16,
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
    expect(ctx.setLineDash).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Number)]),
    );
  });

  it('Small Road normal: NO activa setLineDash con array no-vacío', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Small Road',
      wayType: ['Road'],
      width: 16,
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
    // Si se llama, debe ser con [] (reset), nunca con dash pattern
    const calls = (ctx.setLineDash as ReturnType<typeof vi.fn>).mock.calls;
    const nonEmptyCalls = calls.filter((c) => (c[0] as number[]).length > 0);
    expect(nonEmptyCalls).toHaveLength(0);
  });

  it('Pedestrian Bridge: activa setLineDash', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Pedestrian Bridge',
      wayType: ['Pedestrian', 'Bridge'],
      width: 7,
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
    expect(ctx.setLineDash).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Number)]),
    );
  });
});

// ─── DLC / Fallback ───────────────────────────────────────────────────────────

describe('DLC fallback', () => {
  it('itemClass desconocido + wayType Highway → color highway', () => {
    const ctx = makeCtx();
    const colors = captureColors(ctx);
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'NExtHighway2L',
      wayType: ['Highway'],
      width: 22,
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
    expect(colors).toContain('#a098b0');
  });

  it('itemClass desconocido + wayType Road + width≥28 → color largeArterial', () => {
    const ctx = makeCtx();
    const colors = captureColors(ctx);
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'NEXTbasicroadmedianGroundTrees',
      wayType: ['Road'],
      width: 32,
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
    expect(colors).toContain('#d2938e');
  });

  it('itemClass desconocido + wayType Road + width=16 → color local', () => {
    const ctx = makeCtx();
    const colors = captureColors(ctx);
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'SomeMod4LRoad',
      wayType: ['Road'],
      width: 16,
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
    expect(colors).toContain('#e4e1d1');
  });
});

// ─── Gravel ───────────────────────────────────────────────────────────────────

describe('Gravel Road', () => {
  it('Gravel Road: activa setLineDash (camino sin pavimentar)', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Gravel Road',
      wayType: ['Road'],
      width: 8,
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
    expect(ctx.setLineDash).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Number)]),
    );
  });
});

// ─── Railway ─────────────────────────────────────────────────────────────────

describe('Train Track — tier railway', () => {
  it('Train Track → color railway (#eceff1)', () => {
    const ctx = makeCtx();
    const colors = captureColors(ctx);
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Train Track',
      wayType: ['None'],
      width: 10,
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
    expect(colors).toContain('#eceff1');
  });

  it('Train Track: casing ancho → stroke se llama 2 veces', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Train Track',
      wayType: ['None'],
      width: 10,
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
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });
});

// ─── Exclusión de infraestructura no-vial ────────────────────────────────────

describe('infraestructura excluida — no renderizar', () => {
  it('Electricity Wire: stroke NO se llama', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Electricity Wire',
      width: 12.4,
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
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('Airplane Path: stroke NO se llama', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Airplane Path',
      width: 20,
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
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('Tram Line: stroke NO se llama', () => {
    const ctx = makeCtx();
    const seg = makeRoadSegment({
      startNodeId: 'node-1',
      endNodeId: 'node-2',
      itemClass: 'Tram Line',
      width: 10,
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
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});

// ─── Guard de bounds ──────────────────────────────────────────────────────────

describe('guard de bounds', () => {
  it('no lanza si rangeX es 0 (bounds degenerados)', () => {
    const ctx = makeCtx();
    const flatBounds = { minX: 0, maxX: 0, minZ: -100, maxZ: 100, seaLevel: 0 };
    const seg = makeRoadSegment({ startNodeId: 'node-1', endNodeId: 'node-2' });
    expect(() =>
      renderRoadsLayer(
        ctx,
        [seg],
        makeNodeMap(DEFAULT_NODES),
        flatBounds,
        MOCK_TOKENS,
        800,
        800,
        1,
      ),
    ).not.toThrow();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('no lanza si rangeZ es negativo (bounds invertidos)', () => {
    const ctx = makeCtx();
    const invertedBounds = {
      minX: -100,
      maxX: 100,
      minZ: 100,
      maxZ: -100,
      seaLevel: 0,
    };
    const seg = makeRoadSegment({ startNodeId: 'node-1', endNodeId: 'node-2' });
    expect(() =>
      renderRoadsLayer(
        ctx,
        [seg],
        makeNodeMap(DEFAULT_NODES),
        invertedBounds,
        MOCK_TOKENS,
        800,
        800,
        1,
      ),
    ).not.toThrow();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
