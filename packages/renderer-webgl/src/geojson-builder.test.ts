import { describe, it, expect } from 'vitest';
import {
  buildRoadsGeoJson,
  buildTransitGeoJson,
  buildTransitStopsGeoJson,
  buildBuildingsGeoJson,
  buildForestsGeoJson,
  buildDistrictsGeoJson,
  buildWaterGeoJson,
} from './geojson-builder';
import { makeCityData } from '@vellum/core/testing';
import { CS1_HALF_EXTENT_DEG } from './coordinate-transform';
import type {
  RoadNode,
  RoadSegment,
  Building,
  ForestCell,
  District,
  LandTile,
  WaterTile,
  TransitLine,
  TransitStop,
} from '@vellum/core';
import { SEA_LEVEL_DEFAULT } from '@vellum/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inGeoRange(coord: number): boolean {
  return coord >= -CS1_HALF_EXTENT_DEG && coord <= CS1_HALF_EXTENT_DEG;
}

function makeNode(id: string, x: number, z: number): RoadNode {
  return { id, position: { x, y: 0, z } };
}

function makeSeg(
  id: string,
  startNodeId: string,
  endNodeId: string,
  itemClass = 'Small Road',
): RoadSegment {
  return {
    id,
    startNodeId,
    endNodeId,
    points: [],
    wayType: ['Road'],
    itemClass,
    width: 8,
  };
}

// ─── buildRoadsGeoJson ────────────────────────────────────────────────────────

describe('buildRoadsGeoJson', () => {
  it('includes fixedWidth and scaledWidth properties on each feature', () => {
    const nodes = [makeNode('n1', -100, 0), makeNode('n2', 100, 0)];
    const city = makeCityData({
      roadNodes: nodes,
      roadSegments: [makeSeg('s1', 'n1', 'n2', 'Highway')],
    });
    const fc = buildRoadsGeoJson(city);
    expect(fc.features).toHaveLength(1);
    const props = fc.features[0].properties;
    expect(typeof props.fixedWidth).toBe('number');
    expect(typeof props.scaledWidth).toBe('number');
    expect(props.fixedWidth).toBeGreaterThan(0);
    expect(props.scaledWidth).toBeGreaterThan(0);
  });

  it('produces coordinates in geographic range', () => {
    const nodes = [makeNode('n1', -8640, 0), makeNode('n2', 8640, 0)];
    const city = makeCityData({
      roadNodes: nodes,
      roadSegments: [makeSeg('s1', 'n1', 'n2')],
    });
    const fc = buildRoadsGeoJson(city);
    expect(fc.features).toHaveLength(1);
    const [lng1, lat1] = fc.features[0].geometry.coordinates[0];
    const [lng2] = fc.features[0].geometry.coordinates[1];
    expect(inGeoRange(lng1)).toBe(true);
    expect(inGeoRange(lng2)).toBe(true);
    expect(inGeoRange(lat1)).toBe(true);
  });
});

// ─── buildTransitGeoJson ──────────────────────────────────────────────────────

describe('buildTransitGeoJson', () => {
  it('produces features with color property in hex format', () => {
    const nodes = [makeNode('n1', 0, 0), makeNode('n2', 500, 0)];
    const seg = makeSeg('s1', 'n1', 'n2');
    const line: TransitLine = {
      id: 'L1',
      name: 'Test Bus',
      mode: 'Bus',
      color: '#FF6600',
      stops: [],
      route: [{ segmentIds: ['s1'] }],
    };
    const city = makeCityData({
      roadNodes: nodes,
      roadSegments: [seg],
      transitLines: [line],
    });
    const fc = buildTransitGeoJson(city);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.color).toBe('#FF6600');
    expect(fc.features[0].properties.mode).toBe('Bus');
  });

  it('skips lines with no resolvable geometry', () => {
    const line: TransitLine = {
      id: 'L1',
      name: 'Ghost',
      mode: 'Train',
      color: '#000000',
      stops: [],
      route: [{ segmentIds: ['missing-seg'] }],
    };
    const city = makeCityData({ transitLines: [line] });
    const fc = buildTransitGeoJson(city);
    expect(fc.features).toHaveLength(0);
  });

  it('produces LineString geometry', () => {
    const nodes = [makeNode('n1', -200, 0), makeNode('n2', 200, 0)];
    const seg = makeSeg('s1', 'n1', 'n2');
    const line: TransitLine = {
      id: 'L1',
      name: 'T',
      mode: 'Tram',
      color: '#AABBCC',
      stops: [],
      route: [{ segmentIds: ['s1'] }],
    };
    const city = makeCityData({
      roadNodes: nodes,
      roadSegments: [seg],
      transitLines: [line],
    });
    const fc = buildTransitGeoJson(city);
    expect(fc.features[0].geometry.type).toBe('LineString');
  });
});

// ─── buildBuildingsGeoJson ────────────────────────────────────────────────────

describe('buildBuildingsGeoJson', () => {
  it('produces Polygon geometry', () => {
    const building: Building = {
      id: 'b1',
      position: { x: 0, y: 0, z: 0 },
      itemClass: 'Residential',
      footprint: [
        { x: -50, y: 0, z: -50 },
        { x: 50, y: 0, z: -50 },
        { x: 50, y: 0, z: 50 },
        { x: -50, y: 0, z: 50 },
      ],
    };
    const city = makeCityData({ buildings: [building] });
    const fc = buildBuildingsGeoJson(city);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.type).toBe('Polygon');
  });

  it('closes the polygon ring (first === last coord)', () => {
    const building: Building = {
      id: 'b1',
      position: { x: 0, y: 0, z: 0 },
      itemClass: 'Commercial',
      footprint: [
        { x: -10, y: 0, z: -10 },
        { x: 10, y: 0, z: -10 },
        { x: 10, y: 0, z: 10 },
      ],
    };
    const city = makeCityData({ buildings: [building] });
    const fc = buildBuildingsGeoJson(city);
    const ring = fc.features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('produces coordinates in geographic range', () => {
    const building: Building = {
      id: 'b1',
      position: { x: 0, y: 0, z: 0 },
      itemClass: 'Industrial',
      footprint: [
        { x: -8000, y: 0, z: -8000 },
        { x: 8000, y: 0, z: -8000 },
        { x: 8000, y: 0, z: 8000 },
      ],
    };
    const city = makeCityData({ buildings: [building] });
    const fc = buildBuildingsGeoJson(city);
    const ring = fc.features[0].geometry.coordinates[0];
    for (const [lng, lat] of ring) {
      expect(inGeoRange(lng)).toBe(true);
      expect(inGeoRange(lat)).toBe(true);
    }
  });

  it('skips buildings with fewer than 3 footprint vertices', () => {
    const building: Building = {
      id: 'b1',
      position: { x: 0, y: 0, z: 0 },
      itemClass: 'Residential',
      footprint: [
        { x: -10, y: 0, z: -10 },
        { x: 10, y: 0, z: 10 },
      ],
    };
    const city = makeCityData({ buildings: [building] });
    const fc = buildBuildingsGeoJson(city);
    expect(fc.features).toHaveLength(0);
  });
});

// ─── buildForestsGeoJson ──────────────────────────────────────────────────────

describe('buildForestsGeoJson', () => {
  it('produces Point geometry with density property', () => {
    const cells: ForestCell[] = [
      { x: 100, z: 200, density: 0.75 },
      { x: -300, z: 400, density: 0.3 },
    ];
    const city = makeCityData({ forestCells: cells });
    const fc = buildForestsGeoJson(city);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry.type).toBe('Point');
    expect(fc.features[0].properties.density).toBe(0.75);
    expect(fc.features[1].properties.density).toBe(0.3);
  });

  it('produces coordinates in geographic range', () => {
    const cells: ForestCell[] = [{ x: 8000, z: -8000, density: 1.0 }];
    const city = makeCityData({ forestCells: cells });
    const fc = buildForestsGeoJson(city);
    const [lng, lat] = fc.features[0].geometry.coordinates;
    expect(inGeoRange(lng)).toBe(true);
    expect(inGeoRange(lat)).toBe(true);
  });
});

// ─── buildDistrictsGeoJson ────────────────────────────────────────────────────

describe('buildDistrictsGeoJson', () => {
  it('produces Point geometry with id and name', () => {
    const districts: District[] = [
      { id: 'd1', name: 'Northgate', position: { x: 0, y: 0, z: 0 } },
    ];
    const city = makeCityData({ districts });
    const fc = buildDistrictsGeoJson(city);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.type).toBe('Point');
    expect(fc.features[0].properties.id).toBe('d1');
    expect(fc.features[0].properties.name).toBe('Northgate');
  });
});

// ─── buildWaterGeoJson ────────────────────────────────────────────────────────

describe('buildWaterGeoJson', () => {
  it('produces one Polygon per tile when count < 50 000', () => {
    const tiles: WaterTile[] = [
      { x: 0, z: 0, depth: 1 },
      { x: 100, z: 100, depth: 2 },
      { x: -200, z: 300, depth: 0.5 },
    ];
    const city = makeCityData({ waterTiles: tiles });
    const fc = buildWaterGeoJson(city);
    expect(fc.features).toHaveLength(3);
    expect(fc.features[0].geometry.type).toBe('Polygon');
  });

  it('produces exactly 1 bounding-box feature when count ≥ 50 000', () => {
    const tiles: WaterTile[] = Array.from({ length: 50_000 }, (_, i) => ({
      x: i,
      z: i,
      depth: 1,
    }));
    const city = makeCityData({ waterTiles: tiles });
    const fc = buildWaterGeoJson(city);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.type).toBe('Polygon');
  });

  it('returns empty FeatureCollection when no water tiles', () => {
    const city = makeCityData({ waterTiles: [] });
    const fc = buildWaterGeoJson(city);
    expect(fc.features).toHaveLength(0);
  });

  it('includes inland water tiles (LandTile.resolution > SEA_LEVEL_DEFAULT)', () => {
    const oceanTile: WaterTile = { x: 0, z: 0, depth: 1 };
    const inlandTile: LandTile = {
      x: 200,
      z: 200,
      elevation: 50,
      resolution: SEA_LEVEL_DEFAULT + 1,
    };
    const dryTile: LandTile = {
      x: 400,
      z: 400,
      elevation: 80,
      resolution: 0,
    };
    const city = makeCityData({
      waterTiles: [oceanTile],
      landTiles: [inlandTile, dryTile],
    });
    const fc = buildWaterGeoJson(city);
    // Ocean tile + inland tile only; dry tile excluded
    expect(fc.features).toHaveLength(2);
  });
});

// ─── buildTransitStopsGeoJson ─────────────────────────────────────────────────

describe('buildTransitStopsGeoJson', () => {
  it('returns empty collection when no transit lines', () => {
    const city = makeCityData({ transitLines: [] });
    const fc = buildTransitStopsGeoJson(city);
    expect(fc.features).toHaveLength(0);
  });

  it('produces one Point feature per unique stop', () => {
    const stop: TransitStop = {
      id: 'stop-1',
      name: 'Main St',
      mode: 'Bus',
      position: { x: 100, y: 0, z: 200 },
    };
    const line: TransitLine = {
      id: 'L1',
      name: 'Bus 1',
      mode: 'Bus',
      color: '#FF6600',
      stops: [stop],
      route: [],
    };
    const city = makeCityData({ transitLines: [line] });
    const fc = buildTransitStopsGeoJson(city);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.type).toBe('Point');
    expect(fc.features[0].properties.id).toBe('stop-1');
    expect(fc.features[0].properties.color).toBe('#FF6600');
    expect(fc.features[0].properties.mode).toBe('Bus');
  });

  it('deduplicates stops shared by multiple lines', () => {
    const stop: TransitStop = {
      id: 'shared-stop',
      name: 'Transfer Hub',
      mode: 'Bus',
      position: { x: 0, y: 0, z: 0 },
    };
    const line1: TransitLine = {
      id: 'L1',
      name: 'Bus 1',
      mode: 'Bus',
      color: '#FF0000',
      stops: [stop],
      route: [],
    };
    const line2: TransitLine = {
      id: 'L2',
      name: 'Bus 2',
      mode: 'Bus',
      color: '#0000FF',
      stops: [stop],
      route: [],
    };
    const city = makeCityData({ transitLines: [line1, line2] });
    const fc = buildTransitStopsGeoJson(city);
    expect(fc.features).toHaveLength(1);
  });

  it('produces coordinates in geographic range', () => {
    const stop: TransitStop = {
      id: 's1',
      name: 'Edge Stop',
      mode: 'Train',
      position: { x: 8000, y: 0, z: -8000 },
    };
    const line: TransitLine = {
      id: 'L1',
      name: 'Train',
      mode: 'Train',
      color: '#333333',
      stops: [stop],
      route: [],
    };
    const city = makeCityData({ transitLines: [line] });
    const fc = buildTransitStopsGeoJson(city);
    const [lng, lat] = fc.features[0].geometry.coordinates;
    expect(inGeoRange(lng)).toBe(true);
    expect(inGeoRange(lat)).toBe(true);
  });
});
