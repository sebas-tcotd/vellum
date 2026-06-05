import { describe, it, expect } from 'vitest';
import {
  buildRoadsGeoJson,
  buildTransitGeoJson,
  buildTransitStopsGeoJson,
  buildBuildingsGeoJson,
  buildForestsGeoJson,
  buildDistrictsGeoJson,
  buildWaterGeoJson,
  buildTerrainGeoJson,
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
  it('always returns exactly 1 full-world-extent Polygon, regardless of tile data', () => {
    const fc = buildWaterGeoJson();
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.type).toBe('Polygon');
  });

  it('polygon is a closed ring (first === last coordinate)', () => {
    const fc = buildWaterGeoJson();
    const ring = fc.features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('polygon covers the geographic range of CS1_HALF_EXTENT_DEG', () => {
    const fc = buildWaterGeoJson();
    const ring = fc.features[0].geometry.coordinates[0];
    const lngs = ring.map(([lng]) => lng);
    const lats = ring.map(([, lat]) => lat);
    // Should span the full ±CS1_HALF_EXTENT_DEG range in both axes
    expect(Math.max(...lngs)).toBeCloseTo(CS1_HALF_EXTENT_DEG, 4);
    expect(Math.min(...lngs)).toBeCloseTo(-CS1_HALF_EXTENT_DEG, 4);
    expect(Math.max(...lats)).toBeCloseTo(CS1_HALF_EXTENT_DEG, 4);
    expect(Math.min(...lats)).toBeCloseTo(-CS1_HALF_EXTENT_DEG, 4);
  });
});

// ─── buildTerrainGeoJson ──────────────────────────────────────────────────────

describe('buildTerrainGeoJson', () => {
  it('returns empty FeatureCollection when no land tiles', () => {
    const city = makeCityData({ landTiles: [] });
    const fc = buildTerrainGeoJson(city);
    expect(fc.features).toHaveLength(0);
  });

  it('produces Polygon features with normalised elev property', () => {
    const tiles: LandTile[] = [
      { x: 0, z: 0, elevation: 50, resolution: 0 },
      { x: 1000, z: 1000, elevation: 200, resolution: 0 },
    ];
    const city = makeCityData({ landTiles: tiles });
    const fc = buildTerrainGeoJson(city);
    expect(fc.features.length).toBeGreaterThan(0);
    expect(fc.features[0].geometry.type).toBe('Polygon');
    const elevValues = fc.features.map((f) => f.properties.elev);
    for (const e of elevValues) {
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });

  it('excludes inland water tiles (resolution > SEA_LEVEL_DEFAULT)', () => {
    const dryTile: LandTile = {
      x: 0,
      z: 0,
      elevation: 80,
      resolution: 0, // dry land
    };
    const inlandWaterTile: LandTile = {
      x: 10000, // far enough to be in a different sample bucket
      z: 0,
      elevation: 50,
      resolution: SEA_LEVEL_DEFAULT + 10, // river / lake
    };
    const city = makeCityData({ landTiles: [dryTile, inlandWaterTile] });
    const fcWithBoth = buildTerrainGeoJson(city);
    const cityDryOnly = makeCityData({ landTiles: [dryTile] });
    const fcDryOnly = buildTerrainGeoJson(cityDryOnly);
    // Inland water tile must not add any terrain polygon
    expect(fcWithBoth.features).toHaveLength(fcDryOnly.features.length);
  });

  it('produces coordinates in geographic range', () => {
    const tiles: LandTile[] = [
      { x: 5000, z: -5000, elevation: 100, resolution: 0 },
    ];
    const city = makeCityData({ landTiles: tiles });
    const fc = buildTerrainGeoJson(city);
    expect(fc.features.length).toBeGreaterThan(0);
    for (const feature of fc.features) {
      for (const [lng, lat] of feature.geometry.coordinates[0]) {
        expect(inGeoRange(lng)).toBe(true);
        expect(inGeoRange(lat)).toBe(true);
      }
    }
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
    const lines = JSON.parse(fc.features[0].properties.lines) as Array<{
      name: string;
      color: string;
      mode: string;
    }>;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ name: 'Bus 1', color: '#FF6600', mode: 'Bus' });
  });

  it('deduplicates stops shared by multiple lines and includes all lines in properties', () => {
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
    // color is from the first line
    expect(fc.features[0].properties.color).toBe('#FF0000');
    const lines = JSON.parse(fc.features[0].properties.lines) as Array<{
      name: string;
      color: string;
      mode: string;
    }>;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ name: 'Bus 1', color: '#FF0000', mode: 'Bus' });
    expect(lines[1]).toEqual({ name: 'Bus 2', color: '#0000FF', mode: 'Bus' });
  });

  it('deduplicates a stop that appears twice in the same line (circular route)', () => {
    const stop: TransitStop = {
      id: 'terminal',
      name: '',
      mode: 'Bus',
      position: { x: 0, y: 0, z: 0 },
    };
    const circularLine: TransitLine = {
      id: 'L1',
      name: 'Circular 1',
      mode: 'Bus',
      color: '#AABBCC',
      stops: [stop, stop],
      route: [],
    };
    const city = makeCityData({ transitLines: [circularLine] });
    const fc = buildTransitStopsGeoJson(city);
    expect(fc.features).toHaveLength(1);
    const lines = JSON.parse(fc.features[0].properties.lines) as Array<{
      name: string;
      color: string;
      mode: string;
    }>;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      name: 'Circular 1',
      color: '#AABBCC',
      mode: 'Bus',
    });
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
