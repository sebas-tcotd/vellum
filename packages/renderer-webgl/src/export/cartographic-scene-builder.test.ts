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
    roadCasingAddPx: 1.1,
  });
}

function layerEntities(
  scene: CartographicScene,
  id: (typeof SCENE_LAYER_ORDER)[number],
): readonly SceneEntity[] {
  return scene.layers.find((layer) => layer.id === id)!.entities;
}

/** A short polyline in WGS-84, offset so each ring is distinguishable. */
function ring(offset: number): [number, number][] {
  return [
    csToGeoArray({ x: offset * 100, z: 0 }),
    csToGeoArray({ x: offset * 100 + 500, z: 500 }),
  ];
}

/** A closed triangle in WGS-84, offset so each polygon is distinguishable. */
function square(offset: number): CityData['landPolygon'][number] {
  return {
    exterior: [
      csToGeoArray({ x: offset, z: 0 }),
      csToGeoArray({ x: offset + 500, z: 0 }),
      csToGeoArray({ x: offset + 500, z: 500 }),
    ],
    holes: [],
  };
}

/**
 * Two hypsometric bands over a 0–100 ramp domain, deliberately supplied out of
 * order so the low-to-high paint order has to come from the builder.
 */
function bandCity(): CityData {
  return makeCityData({
    terrainDem: { dataUri: 'data:image/png;base64,', elevMin: 0, elevMax: 100 },
    landPolygon: [square(0)],
    terrainBands: [
      { elevationMin: 50, elevationMax: 100, polygons: [square(600)] },
      { elevationMin: 0, elevationMax: 50, polygons: [square(0)] },
    ],
  });
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
        roadCasingAddPx: 1.1,
      }).background,
    ).toBe('#ffffff');
    expect(
      buildCartographicScene({
        snapshot: base,
        background: 'dark',
        roadWidthFactor: 1,
        roadCasingAddPx: 1.1,
      }).background,
    ).toBe('#101010');
    expect(
      buildCartographicScene({
        snapshot: base,
        background: 'transparent',
        roadWidthFactor: 1,
        roadCasingAddPx: 1.1,
      }).background,
    ).toBeNull();
  });

  it('never paints terrain with a gradient', () => {
    // A document-wide gradient only looks like elevation: it is a
    // top-to-bottom fade unrelated to the terrain under it. Relief comes from
    // the hypsometric bands and contours, both driven by measured elevation.
    const scene = build(makeCityData());
    expect(scene.gradients).toEqual([]);
    for (const entity of layerEntities(scene, 'terrain')) {
      expect(entity.fill?.gradientId).toBeUndefined();
    }
  });

  it('fills each hypsometric band with the ramp colour at its own midpoint', () => {
    const city = bandCity();
    const bands = layerEntities(build(city), 'terrain').filter((entity) =>
      entity.id.includes('-band-'),
    );
    // Midpoints 25 and 75 over a 1–100 domain: halfway low→mid and halfway
    // mid→high, straight from RenderStyleParams.terrain — a theme change moves
    // both. Sorted low to high even though the city listed them high first.
    // The domain starts at 1, not the DEM's `elevMin` of 0: the ramp floors at
    // `DEM_RAMP_FLOOR` so the transparent out-of-map sentinel one unit below it
    // stays encodable. Over this synthetic 100-unit domain that shift moves the
    // last hex digit; over a real city's ~40 000 units it is invisible.
    expect(bands.map((entity) => entity.fill!.color)).toEqual([
      '#d1d0a7',
      '#ddd5bd',
    ]);
  });

  it('keeps the flat land fill underneath the bands', () => {
    // Bands are simplified independently of the coastline; without a base coat
    // any disagreement between the two shows as background bleeding through.
    const terrain = layerEntities(build(bandCity()), 'terrain');
    const land = terrain.findIndex((entity) => entity.id.includes('-land-'));
    const band = terrain.findIndex((entity) => entity.id.includes('-band-'));
    expect(land).toBeGreaterThanOrEqual(0);
    expect(land).toBeLessThan(band);
  });

  it('omits the bands entirely when relief is switched off', () => {
    const scene = build(bandCity(), {
      layerOptions: {
        ...DEFAULT_LAYER_OPTIONS,
        terrain: { ...DEFAULT_LAYER_OPTIONS.terrain, showColorRelief: false },
      },
    });
    expect(
      layerEntities(scene, 'terrain').filter((entity) =>
        entity.id.includes('-band-'),
      ),
    ).toHaveLength(0);
  });

  it('tints contour lines by their own elevation, using the active theme ramp', () => {
    const city = makeCityData({
      terrainDem: {
        dataUri: 'data:image/png;base64,',
        elevMin: 0,
        elevMax: 100,
      },
      contourLines: [
        { elevation: 0, lines: [ring(0)] },
        { elevation: 50, lines: [ring(1)] },
        { elevation: 100, lines: [ring(2)] },
      ],
    });
    const contours = layerEntities(build(city), 'terrain').filter((entity) =>
      entity.id.includes('-contour-'),
    );
    // low / mid / high straight from RenderStyleParams.terrain — a theme
    // change moves these, which is the whole point. The middle one lands one
    // hex step off `terrain.mid` because the ramp floors at `DEM_RAMP_FLOOR`,
    // putting this synthetic domain's midpoint at 50.5 rather than 50.
    expect(contours.map((entity) => entity.stroke!.color)).toEqual([
      '#d9e6c3',
      '#c9b98b',
      '#f2f2f2',
    ]);
  });

  it('falls back to the flat contour colour when relief is switched off', () => {
    // Relief off means the user asked for a plain contour map; tinting it
    // would be applying an option they turned off.
    const city = makeCityData({
      terrainDem: {
        dataUri: 'data:image/png;base64,',
        elevMin: 0,
        elevMax: 100,
      },
      contourLines: [{ elevation: 50, lines: [ring(0)] }],
    });
    const scene = build(city, {
      layerOptions: {
        ...DEFAULT_LAYER_OPTIONS,
        terrain: { ...DEFAULT_LAYER_OPTIONS.terrain, showColorRelief: false },
      },
    });
    const contour = layerEntities(scene, 'terrain').find((entity) =>
      entity.id.includes('-contour-'),
    )!;
    expect(contour.stroke!.color).toBe('#b0a080');
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
    // maxZ is the top row, so the northernmost point lands at y = 0.
    expect(projected.y).toBeCloseTo(0, 6);
  });

  it('puts the northernmost world point at the top of the document', () => {
    // Pins the orientation against the raster planner's own convention
    // (`tile-planner.ts` resolves tile extents descending from maxZ). A flip
    // here silently mirrors every exported map.
    const city = makeCityData({
      districts: [
        { id: 'd-north', name: 'North', position: { x: 0, z: 8640 } },
        { id: 'd-south', name: 'South', position: { x: 0, z: -8640 } },
      ] as CityData['districts'],
    });
    const scene = build(city);
    const [north, south] = layerEntities(scene, 'districts').map(
      (entity) =>
        projectScenePoint(
          scene.projection,
          (entity.geometry as { center: { x: number; z: number } }).center,
        ).y,
    );
    expect(north).toBeLessThan(south!);
    expect(north).toBeCloseTo(0, 6);
    expect(south).toBeCloseTo(1728, 6);
  });

  it.each([
    'Airplane Path',
    'Ship Path',
    'Water Facility',
    'Earthquake Sensor',
    'Firewatch',
    'Radio',
    'Tsunami Buoy',
  ])('never draws the utility class %s as a building', (itemClass) => {
    const city = makeCityData({
      buildings: [
        makeBuilding({
          id: 'b-utility',
          itemClass,
          name: 'Utility',
          footprint: [
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
            { x: 10, y: 0, z: 10 },
          ],
        }),
      ],
    });
    expect(layerEntities(build(city), 'buildings')).toHaveLength(0);
  });

  it('discards a polygon whose exterior ring is degenerate, holes and all', () => {
    // Dropping only the bad ring would promote the first hole to exterior,
    // painting a lake as solid land.
    const city = makeCityData({
      landPolygon: [
        {
          exterior: [
            csToGeoArray({ x: 0, z: 0 }),
            csToGeoArray({ x: 0, z: 0 }),
            csToGeoArray({ x: 0, z: 0 }),
          ],
          holes: [
            [
              csToGeoArray({ x: 100, z: 100 }),
              csToGeoArray({ x: 500, z: 100 }),
              csToGeoArray({ x: 500, z: 500 }),
            ],
          ],
        },
      ] as CityData['landPolygon'],
    });
    const scene = build(city);
    expect(
      layerEntities(scene, 'terrain').filter((entity) =>
        entity.id.includes('-land-'),
      ),
    ).toHaveLength(0);
    expect(scene.warnings).toContainEqual(
      expect.objectContaining({ code: 'degenerate-geometry' }),
    );
  });

  it('reproduces transit dimming on every layer except transit itself', () => {
    const city = makeCityData({
      districts: [
        { id: 'd-1', name: 'Centro', position: { x: 0, z: 0 } },
      ] as CityData['districts'],
    });
    const dimmed = buildCartographicScene({
      snapshot: { ...snapshot(city), transitDimming: true },
      background: 'white',
      roadWidthFactor: 7.25,
      roadCasingAddPx: 1.1,
    });
    const district = layerEntities(dimmed, 'districts')[0]!;
    // TRANSIT_DIM_FACTOR is 0.15; the district fill was fully opaque.
    expect(district.fill!.opacity).toBeCloseTo(0.15, 10);
    // Undimmed, it stays untouched — the flag is what drives it.
    expect(layerEntities(build(city), 'districts')[0]!.fill!.opacity).toBe(
      undefined,
    );
  });

  it('adds the casing border the caller resolved, not one derived from the width', () => {
    const scene = buildCartographicScene({
      snapshot: snapshot(roadCity('Highway')),
      background: 'white',
      roadWidthFactor: 1,
      roadCasingAddPx: 2.4,
    });
    const roads = layerEntities(scene, 'roads');
    const casing = roads.find((entity) => entity.id.endsWith('-casing'))!;
    const fill = roads.find((entity) => !entity.id.endsWith('-casing'))!;
    expect(casing.stroke!.widthPx - fill.stroke!.widthPx).toBeCloseTo(2.4, 10);
  });

  it('emits the Vellum mark as vector artwork when the watermark is on', () => {
    const scene = buildCartographicScene({
      snapshot: { ...snapshot(makeCityData()), watermarkVisible: true },
      background: 'white',
      roadWidthFactor: 1,
      roadCasingAddPx: 1.1,
    });
    expect(scene.emblem).not.toBeNull();
    // Real paths from the bundled asset, never a raster stand-in.
    expect(scene.emblem!.svgMarkup).toContain('<path');
    expect(scene.emblem!.svgMarkup).not.toContain('<svg');
    expect(scene.emblem!.svgMarkup).not.toContain('data:image');
    // The artwork's own `<g opacity="0.2">` ceiling is unwrapped — group
    // opacity multiplies, so leaving it would cap the mark at 20% no matter
    // what the scene asks for, and on a white export that is invisible.
    expect(scene.emblem!.svgMarkup.startsWith('<g opacity="0.2"')).toBe(false);
    expect(scene.emblem!.opacity).toBe(0.5);
    expect(scene.emblem!.widthPx).toBeCloseTo(1728 * 0.3, 6);
    expect(scene.emblem!.xPx).toBeCloseTo((1728 - 1728 * 0.3) / 2, 6);
    expect(scene.emblem!.yPx).toBeCloseTo((1728 - 1728 * 0.3) / 2, 6);
  });

  it('omits the mark when the watermark was off at capture time', () => {
    expect(build(makeCityData()).emblem).toBeNull();
  });

  it('keeps the mark out of the layer stack, so hiding every layer keeps it', () => {
    const scene = buildCartographicScene({
      snapshot: {
        ...snapshot(makeCityData(), {
          activeLayers: {
            terrain: false,
            basemap: false,
            roads: false,
            transit: false,
            buildings: false,
            forests: false,
            districts: false,
          },
        }),
        watermarkVisible: true,
      },
      background: 'white',
      roadWidthFactor: 1,
      roadCasingAddPx: 1.1,
    });
    expect(scene.layers.every((layer) => !layer.visible)).toBe(true);
    expect(scene.emblem).not.toBeNull();
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
