/**
 * Roads layer registration: casing and fill lines with data-driven colors.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData, RoadCategory, RoadTier } from '@vellum/core';
import type * as maplibregl from 'maplibre-gl';
import {
  buildRoadColorExpression,
  BRIDGE_CASING_DARKEN_PERCENT,
} from '../expressions/road-color';
import {
  ROAD_CASING_WIDTH_EXPR,
  ROAD_SHADOW_WIDTH_EXPR,
  ROAD_WIDTH_EXPR,
} from '../expressions/road-width';
import {
  RAILWAY_CASING_WIDTH_EXPR,
  RAILWAY_WIDTH_EXPR,
} from '../expressions/railway-width';
import { HEAVY_SOURCE_MAX_ZOOM } from '../constants/layer.constants';
import { buildRoadLabelsGeoJson, buildRoadsGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';
import {
  AIRSHIP_LINE_DASHARRAY,
  AIRSHIP_LINE_OPACITY,
  CONNECTION_LINE_DASHARRAY,
  CONNECTION_LINE_OPACITY,
  CONNECTION_MIN_ZOOM,
  FERRY_LINE_DASHARRAY,
  FERRY_LINE_OPACITY,
  FLIGHT_LINE_DASHARRAY,
  FLIGHT_LINE_OPACITY,
  CABLECAR_LINE_DASHARRAY,
  CABLECAR_LINE_OPACITY,
  resolveAirshipColor,
  resolveCableCarColor,
} from '../expressions/transit-color';

/** A flight path is a hairline at every zoom: it annotates, it is not a way. */
const FLIGHT_LINE_WIDTH_EXPR = [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  10,
  0.6,
  14,
  1,
  18,
  1.5,
] as unknown as maplibregl.ExpressionSpecification;

/** Transport connections only appear from their min zoom, so start there. */
const CONNECTION_LINE_WIDTH_EXPR = [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  CONNECTION_MIN_ZOOM,
  0.6,
  18,
  1.5,
] as unknown as maplibregl.ExpressionSpecification;

/** Adds roads source and both casing + fill layers. */
export function addRoadsLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'roads', {
    type: 'geojson',
    data: buildRoadsGeoJson(cityData),
    // Capped so detail-zoom panning re-uses tiles instead of slicing new ones.
    maxzoom: HEAVY_SOURCE_MAX_ZOOM,
  });

  // Network membership comes from the canonical `category` property emitted by
  // the GeoJSON builder (`classifyRoadCategory` in `@vellum/core`), never from
  // item-class literals repeated per layer.
  const isCategory = (category: RoadCategory) =>
    [
      '==',
      ['get', 'category'],
      category,
    ] as unknown as maplibregl.ExpressionSpecification;
  // Positive membership, not a stack of exclusions: a new category is left out
  // of the ordinary road layers by default instead of needing another `notX`
  // added in seven places. `runway` belongs here — it *is* road geometry; the
  // category only tells the surface layers to cap it flat.
  const drawnAsRoad = [
    'in',
    ['get', 'category'],
    ['literal', ['road', 'runway']],
  ] as unknown as maplibregl.ExpressionSpecification;

  // A runway is a flat strip of tarmac, not a street: a round cap would bulge
  // half a line-width past each threshold and round off the very ends that
  // make it read as a runway from above.
  const surfaceLineCap = [
    'case',
    ['==', ['get', 'category'], 'runway'],
    'butt',
    'round',
  ] as unknown as maplibregl.ExpressionSpecification;

  // Tunnels render *below* at-grade roads (added first): solid casing avoids
  // the dash-alignment gap bug, dashed fill + reduced opacity signal depth.
  addLayerIfAbsent(map, {
    id: 'roads-tunnel-casing',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      [
        'any',
        ['==', ['get', 'isTunnel'], true],
        ['==', ['get', 'isUnderground'], true],
      ],
      drawnAsRoad,
    ],
    layout: { 'line-cap': surfaceLineCap, 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'casing'),
      'line-width': ROAD_CASING_WIDTH_EXPR,
      'line-opacity': 0.55,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-tunnel-fill',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      [
        'any',
        ['==', ['get', 'isTunnel'], true],
        ['==', ['get', 'isUnderground'], true],
      ],
      drawnAsRoad,
    ],
    layout: { 'line-cap': surfaceLineCap, 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'fill'),
      'line-width': ROAD_WIDTH_EXPR,
      'line-dasharray': [6, 3],
      'line-opacity': 0.55,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-casing',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      ['!=', ['get', 'isTunnel'], true],
      ['!=', ['get', 'isUnderground'], true],
      ['!=', ['get', 'isBridge'], true],
      ['!=', ['get', 'isElevated'], true],
      drawnAsRoad,
    ],
    layout: { 'line-cap': surfaceLineCap, 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'casing'),
      'line-width': ROAD_CASING_WIDTH_EXPR,
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-fill',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      ['!=', ['get', 'isTunnel'], true],
      ['!=', ['get', 'isUnderground'], true],
      ['!=', ['get', 'isBridge'], true],
      ['!=', ['get', 'isElevated'], true],
      drawnAsRoad,
    ],
    layout: { 'line-cap': surfaceLineCap, 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'fill'),
      'line-width': ROAD_WIDTH_EXPR,
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });

  // A round cap juts half a casing-width past the end of the line. On the
  // elevated layers that casing is darker than the surface network, so where a
  // viaduct lands the cap reads as a lid laid across the road. `capEnds` is
  // false exactly there and the line butts instead; the road it lands on still
  // draws its own round cap underneath, so nothing is left uncovered.
  // `line-cap` is data-driven from MapLibre 5 / style-spec 24.
  const elevatedLineCap = [
    'case',
    ['==', ['get', 'capEnds'], false],
    'butt',
    'round',
  ] as unknown as maplibregl.ExpressionSpecification;

  // Shadow beneath bridges/elevated: a wider, blurred dark line creates a depth
  // cue so elevated roads read as raised above the surface network.
  addLayerIfAbsent(map, {
    id: 'roads-bridge-shadow',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      [
        'any',
        ['==', ['get', 'isBridge'], true],
        ['==', ['get', 'isElevated'], true],
      ],
      drawnAsRoad,
    ],
    // Blurred and drawn under everything, so it keeps a round cap: it costs
    // nothing visually and softens the joint where elevated branches fork.
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': '#000000',
      'line-width': ROAD_SHADOW_WIDTH_EXPR,
      'line-opacity': 0.3,
      'line-blur': 2,
      'line-opacity-transition': { duration: 300 },
    },
  });

  // Bridges render *above* at-grade roads (added after): solid casing + solid
  // fill, since an elevated viaduct is a continuous structure, not a gap.
  addLayerIfAbsent(map, {
    id: 'roads-bridge-casing',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      [
        'any',
        ['==', ['get', 'isBridge'], true],
        ['==', ['get', 'isElevated'], true],
      ],
      drawnAsRoad,
    ],
    layout: { 'line-cap': elevatedLineCap, 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(
        colors,
        'casing',
        BRIDGE_CASING_DARKEN_PERCENT,
      ),
      'line-width': ROAD_CASING_WIDTH_EXPR,
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-bridge-fill',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      [
        'any',
        ['==', ['get', 'isBridge'], true],
        ['==', ['get', 'isElevated'], true],
      ],
      drawnAsRoad,
    ],
    layout: { 'line-cap': elevatedLineCap, 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'fill'),
      'line-width': ROAD_WIDTH_EXPR,
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-ferry',
    type: 'line',
    source: 'roads',
    filter: isCategory('ferry'),
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': colors.ferry,
      'line-opacity': FERRY_LINE_OPACITY,
      'line-opacity-transition': { duration: 300 },
      'line-width': [
        'interpolate',
        ['exponential', 1.5],
        ['zoom'],
        10,
        1,
        14,
        2,
        18,
        4,
      ] as unknown as maplibregl.ExpressionSpecification,
      'line-dasharray': [...FERRY_LINE_DASHARRAY],
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-blimp',
    type: 'line',
    source: 'roads',
    filter: isCategory('airship'),
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': resolveAirshipColor(colors.ferry),
      'line-width': ROAD_WIDTH_EXPR,
      'line-dasharray': [...AIRSHIP_LINE_DASHARRAY],
      'line-opacity': AIRSHIP_LINE_OPACITY,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-cablecar',
    type: 'line',
    source: 'roads',
    filter: isCategory('cablecar'),
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': resolveCableCarColor(colors.ferry),
      // Its own width, like the ferry layer's: a CableCar Path is 12.4 world
      // units wide, which the width heuristic tiers as a pedestrian way, and a
      // 0.1/0.3 hairline is exactly why the cable car was invisible before.
      'line-width': [
        'interpolate',
        ['exponential', 1.5],
        ['zoom'],
        10,
        1,
        14,
        2,
        18,
        3.5,
      ] as unknown as maplibregl.ExpressionSpecification,
      'line-dasharray': [...CABLECAR_LINE_DASHARRAY],
      'line-opacity': CABLECAR_LINE_OPACITY,
      'line-opacity-transition': { duration: 300 },
    },
  });

  // Native-only ways (`.vellummap`): a `.cslmap` never emits these
  // categories, so its map is unchanged.
  addLayerIfAbsent(map, {
    id: 'roads-flight',
    type: 'line',
    source: 'roads',
    filter: isCategory('flight'),
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': colors.districtLabel,
      'line-width': FLIGHT_LINE_WIDTH_EXPR,
      'line-dasharray': [...FLIGHT_LINE_DASHARRAY],
      'line-opacity': FLIGHT_LINE_OPACITY,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-connection',
    type: 'line',
    source: 'roads',
    filter: isCategory('connection'),
    minzoom: CONNECTION_MIN_ZOOM,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': colors.roadCasing.pedestrianWay,
      'line-width': CONNECTION_LINE_WIDTH_EXPR,
      'line-dasharray': [...CONNECTION_LINE_DASHARRAY],
      'line-opacity': CONNECTION_LINE_OPACITY,
      'line-opacity-transition': { duration: 300 },
    },
  });

  // ─── Railways: surface / elevated / underground ──────────────────────────

  const isRailway = isCategory('railway');

  // Surface railways: solid casing + dashed fill (cross-tie pattern).
  addLayerIfAbsent(map, {
    id: 'roads-railway-surface-casing',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      isRailway,
      ['!=', ['get', 'isElevated'], true],
      ['!=', ['get', 'isUnderground'], true],
      ['!=', ['get', 'isTunnel'], true],
      ['!=', ['get', 'isBridge'], true],
    ],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'casing'),
      'line-width': RAILWAY_CASING_WIDTH_EXPR,
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-railway-surface-fill',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      isRailway,
      ['!=', ['get', 'isElevated'], true],
      ['!=', ['get', 'isUnderground'], true],
      ['!=', ['get', 'isTunnel'], true],
      ['!=', ['get', 'isBridge'], true],
    ],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'fill'),
      'line-width': RAILWAY_WIDTH_EXPR,
      'line-dasharray': [4, 2],
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });

  // Elevated railways: solid casing + solid fill (continuous viaduct structure).
  addLayerIfAbsent(map, {
    id: 'roads-railway-elevated-casing',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      isRailway,
      [
        'any',
        ['==', ['get', 'isElevated'], true],
        ['==', ['get', 'isBridge'], true],
      ],
    ],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'casing'),
      'line-width': RAILWAY_CASING_WIDTH_EXPR,
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-railway-elevated-fill',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      isRailway,
      [
        'any',
        ['==', ['get', 'isElevated'], true],
        ['==', ['get', 'isBridge'], true],
      ],
    ],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'fill'),
      'line-width': RAILWAY_WIDTH_EXPR,
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });

  // Underground railways: solid casing + dashed fill, reduced opacity.
  addLayerIfAbsent(map, {
    id: 'roads-railway-underground-casing',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      isRailway,
      [
        'any',
        ['==', ['get', 'isUnderground'], true],
        ['==', ['get', 'isTunnel'], true],
      ],
    ],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'casing'),
      'line-width': RAILWAY_CASING_WIDTH_EXPR,
      'line-opacity': 0.55,
      'line-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-railway-underground-fill',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      isRailway,
      [
        'any',
        ['==', ['get', 'isUnderground'], true],
        ['==', ['get', 'isTunnel'], true],
      ],
    ],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'fill'),
      'line-width': RAILWAY_WIDTH_EXPR,
      'line-dasharray': [6, 4],
      'line-opacity': 0.55,
      'line-opacity-transition': { duration: 300 },
    },
  });
}

/** Label priority by tier: lower is placed first when labels collide. */
const LABEL_RANK: Partial<Record<RoadTier, number>> = {
  highway: 0,
  largeArterial: 1,
  mediumArterial: 2,
  local: 3,
  pedestrianStreet: 4,
  gravel: 4,
  pedestrianWay: 5,
};

const tierIn = (tiers: readonly RoadTier[]) => [
  'in',
  ['get', 'tier'],
  ['literal', tiers],
];

const MAJOR_TIERS: readonly RoadTier[] = [
  'highway',
  'largeArterial',
  'mediumArterial',
];
const MINOR_TIERS: readonly RoadTier[] = [
  ...MAJOR_TIERS,
  'local',
  'pedestrianStreet',
  'gravel',
];

/**
 * Street-name labels along the line (`.vellummap` only: a `.cslmap` has no
 * names, so the layer draws nothing there).
 *
 * @remarks
 * Web-map conventions: arterials from z14, locals from z15, footpaths from
 * z17; higher tiers win collisions (`symbol-sort-key`), and MapLibre's shared
 * collision index keeps names off each other and off the other symbol layers.
 * Labels ride their own source of whole streets (see `buildRoadLabelsGeoJson`)
 * and are registered after transit so lines never cover a name.
 */
export function addRoadLabelsLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'road-labels', {
    type: 'geojson',
    // ponytail: rebuilds the roads collection the roads step already built;
    // hand it over if the load step ever shows up in a profile.
    data: buildRoadLabelsGeoJson(buildRoadsGeoJson(cityData)),
    maxzoom: HEAVY_SOURCE_MAX_ZOOM,
  });

  addLayerIfAbsent(map, {
    id: 'roads-labels',
    type: 'symbol',
    source: 'road-labels',
    minzoom: 14,
    // Zoom in a filter is evaluated at integer zooms only, which is exactly
    // the granularity these thresholds need.
    filter: [
      'step',
      ['zoom'],
      tierIn(MAJOR_TIERS),
      15,
      tierIn(MINOR_TIERS),
      17,
      true,
    ] as unknown as maplibregl.FilterSpecification,
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 320,
      'symbol-sort-key': [
        'match',
        ['get', 'tier'],
        ...Object.entries(LABEL_RANK).flat(),
        9,
      ] as unknown as maplibregl.ExpressionSpecification,
      'text-field': ['get', 'name'],
      'text-font': ['DM Mono'],
      'text-size': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14,
        ['match', ['get', 'tier'], MAJOR_TIERS as RoadTier[], 10, 9],
        18,
        ['match', ['get', 'tier'], MAJOR_TIERS as RoadTier[], 14, 12],
      ] as unknown as maplibregl.ExpressionSpecification,
      'text-max-angle': 30,
      'text-padding': 4,
      'text-letter-spacing': 0.04,
    },
    paint: {
      // Theme ink, auto-tinted per tier where it would not read on the fill.
      'text-color': buildRoadColorExpression(colors, 'label'),
      // Haloed in the road's own fill, so the name reads as printed on it.
      'text-halo-color': buildRoadColorExpression(colors, 'fill'),
      'text-halo-width': 1.5,
      'text-opacity': 1,
      'text-opacity-transition': { duration: 300 },
    },
  });
}
