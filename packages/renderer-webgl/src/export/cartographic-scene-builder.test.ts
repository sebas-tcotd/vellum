import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYER_OPTIONS,
  SCENE_LAYER_ORDER,
  projectScenePoint,
  type CartographicScene,
  type ExportSnapshotBase,
  type LayerOptions,
  type LayerVisibility,
  type RenderStyleParams,
  type SceneEntity,
} from '@vellum/core';
import {
  makeBuilding,
  makeCityData,
  makeRoadSegment,
} from '@vellum/core/testing';
import type { CityData } from '@vellum/core';
import { buildCartographicScene } from './cartographic-scene-builder';
import { csToGeoArray } from '../coordinate-transform';

const STYLE = {
  mapBackground: '#ffffff',
  transitBackground: '#101010',
  mapFrame: '#000000',
  water: '#a0c8f0',
  terrain: { base: '#e8e0d8', low: '#d9e6c3', mid: '#c9b98a', high: '#f2f2f2' },
  contourLine: '#b0a080',
  forests: '#3f7d3f',
  districts: { fill: '#cc4444', label: '#222222' },
  buildings: {
    none: { fill: '#d0d0d0', stroke: '#909090' },
    civic: {
      publicTransport: { fill: '#8888cc', stroke: '#444488' },
      education: { fill: '#cc88cc', stroke: '#884488' },
      services: { fill: '#88cccc', stroke: '#448888' },
    },
  },
  roads: {
    highway: { generic: { fill: '#e8a33d', casing: '#b87a1d' } },
    largeArterial: { generic: { fill: '#f5d76e', casing: '#c9a63e' } },
    mediumArterial: { generic: { fill: '#ffffff', casing: '#c0c0c0' } },
    local: {
      generic: { fill: '#ffffff', casing: '#d0d0d0' },
      gravel: { fill: '#e0d8c8', casing: '#b0a890' },
    },
    pedestrian: {
      path: { fill: '#f0e0d0', casing: '#c0b0a0' },
      way: { fill: '#f0e0d0', casing: '#c0b0a0' },
      street: { fill: '#f0e0d0', casing: '#c0b0a0' },
    },
    rail: {
      train: { fill: '#707070', casing: '#404040' },
      metro: { fill: '#8060a0', casing: '#503070' },
    },
    ferry: { fill: '#4080c0' },
  },
  grid: { color: '#000000', opacity: 0.1, width: 1, dasharray: [2, 2] },
} as unknown as RenderStyleParams;

const ALL_VISIBLE: LayerVisibility = {
  terrain: true,
  basemap: true,
  roads: true,
  transit: true,
  buildings: true,
  forests: true,
  districts: true,
};

function snapshot(
  cityData: CityData,
  overrides: {
    activeLayers?: LayerVisibility;
    layerOptions?: LayerOptions;
  } = {},
): ExportSnapshotBase {
  return {
    snapshotId: 'scene-test',
    cityData,
    style: STYLE,
    activeLayers: overrides.activeLayers ?? ALL_VISIBLE,
    layerOptions: overrides.layerOptions ?? DEFAULT_LAYER_OPTIONS,
    transitDimming: false,
    watermarkVisible: false,
    camera: { longitude: 0, latitude: 0, zoom: 12, bearing: 0, pitch: 0 },
    extent: { minX: -8640, maxX: 8640, minZ: -8640, maxZ: 8640 },
    surface: { width: 1728, height: 1728 },
  };
}

function build(
  cityData: CityData,
  overrides: Parameters<typeof snapshot>[1] = {},
  roadWidthFactor = 7.25,
): CartographicScene {
  return buildCartographicScene({
    snapshot: snapshot(cityData, overrides),
    background: 'white',
    roadWidthFactor,
  });
}

function layerEntities(
  scene: CartographicScene,
  id: (typeof SCENE_LAYER_ORDER)[number],
): readonly SceneEntity[] {
  return scene.layers.find((layer) => layer.id === id)!.entities;
}

/** Two connected nodes so a segment survives `isValidSegment`. */
function roadCity(itemClass: string, id = 'seg-1'): CityData {
  return makeCityData({
    roadNodes: [
      { id: 'n1', position: { x: -1000, y: 50, z: 0 } },
      { id: 'n2', position: { x: 1000, y: 50, z: 0 } },
    ],
    roadSegments: [
      makeRoadSegment({
        id,
        startNodeId: 'n1',
        endNodeId: 'n2',
        itemClass,
        width: 16,
      }),
    ],
  });
}

describe('buildCartographicScene', () => {
  it('emits every layer, always in the documented z-order', () => {
    const scene = build(makeCityData());
    expect(scene.layers.map((layer) => layer.id)).toEqual([
      ...SCENE_LAYER_ORDER,
    ]);
  });

  it('carries visibility without dropping the group, so z-order survives a toggle', () => {
    const scene = build(makeCityData(), {
      activeLayers: { ...ALL_VISIBLE, roads: false },
    });
    const roads = scene.layers.find((layer) => layer.id === 'roads')!;
    expect(roads.visible).toBe(false);
    expect(roads.entities).toEqual([]);
    expect(scene.layers.map((layer) => layer.id)).toEqual([
      ...SCENE_LAYER_ORDER,
    ]);
  });

  it('never renders a Bus Line as road geometry', () => {
    // The virtual connector CS1 uses purely for transit routing.
    expect(layerEntities(build(roadCity('Bus Line')), 'roads')).toHaveLength(0);
    // A real road with the same shape does render, proving the filter is the
    // ItemClass and not the geometry.
    expect(
      layerEntities(build(roadCity('Small Road')), 'roads').length,
    ).toBeGreaterThan(0);
  });

  it.each([
    'Electricity Wire',
    'Airplane Path',
    'Ship Path',
    'Tram Line',
    'Tram Facility',
    'Landscaping Canal',
    'Landscaping Flood Wall',
  ])('excludes the non-road class %s', (itemClass) => {
    expect(layerEntities(build(roadCity(itemClass)), 'roads')).toHaveLength(0);
  });

  it('classifies by itemClass, not by segment name or width', () => {
    // Same `width: 16` in both, so only `itemClass` can produce the difference.
    const highway = layerEntities(build(roadCity('Highway')), 'roads');
    const local = layerEntities(build(roadCity('Small Road')), 'roads');
    const highwayFill = highway.find(
      (entity) => !entity.id.endsWith('-casing'),
    )!;
    const localFill = local.find((entity) => !entity.id.endsWith('-casing'))!;
    expect(highwayFill.stroke!.widthPx).toBeGreaterThan(
      localFill.stroke!.widthPx,
    );
    expect(highwayFill.stroke!.color).toBe('#e8a33d');
    expect(localFill.stroke!.color).toBe('#ffffff');
  });

  it('bakes the caller policy into a literal stroke width, casing under fill', () => {
    const roads = layerEntities(build(roadCity('Small Road')), 'roads');
    const casing = roads.find((entity) => entity.id.endsWith('-casing'))!;
    const fill = roads.find((entity) => !entity.id.endsWith('-casing'))!;
    // ROAD_WIDTH_STYLES.local = { fixed: 0.2, scaled: 0.8 }; factor 7.25 → 6px.
    expect(fill.stroke!.widthPx).toBeCloseTo(6, 10);
    expect(casing.stroke!.widthPx).toBeGreaterThan(fill.stroke!.widthPx);
    expect(roads.indexOf(casing)).toBeLessThan(roads.indexOf(fill));
  });

  it('keeps entity identity traceable to the domain object', () => {
    const roads = layerEntities(
      build(roadCity('Small Road', 'seg-42')),
      'roads',
    );
    expect(roads.map((entity) => entity.id)).toEqual([
      'road-seg-42-casing',
      'road-seg-42',
    ]);
  });

  it('produces coordinates that project back to the original world position', () => {
    const scene = build(roadCity('Small Road'));
    const fill = layerEntities(scene, 'roads').find(
      (entity) => !entity.id.endsWith('-casing'),
    )!;
    const geometry = fill.geometry as {
      kind: 'path';
      points: { x: number; z: number }[];
    };
    expect(geometry.points[0]!.x).toBeCloseTo(-1000, 6);
    expect(geometry.points[geometry.points.length - 1]!.x).toBeCloseTo(1000, 6);
    // World X → output X across a 1728px surface spanning ±8640.
    expect(
      projectScenePoint(scene.projection, geometry.points[0]!).x,
    ).toBeCloseTo(764, 6);
  });

  it('excludes buildings whose ItemClass has no map representation', () => {
    const city = makeCityData({
      buildings: [
        makeBuilding({
          id: 'b-rock',
          itemClass: 'Beautification Item',
          name: 'Rock Formation 01',
          footprint: [
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
            { x: 10, y: 0, z: 10 },
          ],
        }),
        makeBuilding({
          id: 'b-house',
          itemClass: 'Residential Low',
          name: 'Small House',
          footprint: [
            { x: 100, y: 0, z: 100 },
            { x: 110, y: 0, z: 100 },
            { x: 110, y: 0, z: 110 },
          ],
        }),
      ],
    });
    const ids = layerEntities(build(city), 'buildings').map(
      (entity) => entity.id,
    );
    expect(ids).toContain('building-b-house');
    expect(ids).not.toContain('building-b-rock');
  });

  it('drops degenerate geometry and reports it instead of failing silently', () => {
    const city = makeCityData({
      buildings: [
        makeBuilding({
          id: 'b-degenerate',
          itemClass: 'Residential Low',
          name: 'Sliver',
          // Three vertices, but all identical — no enclosable area.
          footprint: [
            { x: 5, y: 0, z: 5 },
            { x: 5, y: 0, z: 5 },
            { x: 5, y: 0, z: 5 },
          ],
        }),
      ],
    });
    const scene = build(city);
    expect(layerEntities(scene, 'buildings')).toHaveLength(0);
    expect(scene.warnings).toContainEqual(
      expect.objectContaining({ code: 'degenerate-geometry' }),
    );
  });

  it('resolves the background from the theme and drops it entirely for transparent', () => {
    const base = snapshot(makeCityData());
    expect(
      buildCartographicScene({
        snapshot: base,
        background: 'white',
        roadWidthFactor: 1,
      }).background,
    ).toBe('#ffffff');
    expect(
      buildCartographicScene({
        snapshot: base,
        background: 'dark',
        roadWidthFactor: 1,
      }).background,
    ).toBe('#101010');
    expect(
      buildCartographicScene({
        snapshot: base,
        background: 'transparent',
        roadWidthFactor: 1,
      }).background,
    ).toBeNull();
  });

  it('exposes the elevation ramp as an editable gradient, only when relief is on', () => {
    const withRelief = build(makeCityData());
    expect(
      withRelief.gradients.map((gradient) => gradient.stops.length),
    ).toEqual([3]);
    expect(withRelief.gradients[0]!.stops.map((stop) => stop.color)).toEqual([
      '#d9e6c3',
      '#c9b98a',
      '#f2f2f2',
    ]);

    const withoutRelief = build(makeCityData(), {
      layerOptions: {
        ...DEFAULT_LAYER_OPTIONS,
        terrain: { ...DEFAULT_LAYER_OPTIONS.terrain, showColorRelief: false },
      },
    });
    expect(withoutRelief.gradients).toEqual([]);
  });

  it('handles an empty city without throwing and reports the empty layers', () => {
    const scene = build(makeCityData());
    expect(scene.layers.every((layer) => layer.visible)).toBe(true);
    expect(
      scene.warnings.find((warning) => warning.code === 'empty-layer')?.count,
    ).toBeGreaterThan(0);
  });

  it('honours the boundary of the world extent without producing NaN', () => {
    const city = makeCityData({
      districts: [
        { id: 'd-edge', name: 'Edge', position: { x: -8640, z: 8640 } },
      ] as CityData['districts'],
    });
    const scene = build(city);
    const district = layerEntities(scene, 'districts')[0]!;
    const center = (district.geometry as { center: { x: number; z: number } })
      .center;
    const projected = projectScenePoint(scene.projection, center);
    expect(Number.isFinite(projected.x)).toBe(true);
    expect(Number.isFinite(projected.y)).toBe(true);
    expect(projected.x).toBeCloseTo(0, 6);
    expect(projected.y).toBeCloseTo(1728, 6);
  });

  it('never mutates the CityData it reads', () => {
    const city = roadCity('Small Road');
    const before = JSON.stringify(city);
    build(city);
    expect(JSON.stringify(city)).toBe(before);
  });

  it('unprojection is the exact inverse of the builders projection', () => {
    // The builders emit fake-WGS84; the scene unprojects with `geoToCs`. If
    // those ever diverge, every coordinate in an export shifts silently.
    const [lng, lat] = csToGeoArray({ x: 1234.5, z: -6789.25 });
    const city = makeCityData({
      districts: [
        { id: 'd-1', name: 'Round trip', position: { x: 1234.5, z: -6789.25 } },
      ] as CityData['districts'],
    });
    const district = layerEntities(build(city), 'districts')[0]!;
    const center = (district.geometry as { center: { x: number; z: number } })
      .center;
    expect(center.x).toBeCloseTo(1234.5, 6);
    expect(center.z).toBeCloseTo(-6789.25, 6);
    expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true);
  });
});
