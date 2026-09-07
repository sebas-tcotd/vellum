/**
 * Roads layer registration: casing and fill lines with data-driven colors.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData, RoadCategory } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
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
import { buildRoadsGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';
import {
  AIRSHIP_LINE_DASHARRAY,
  AIRSHIP_LINE_OPACITY,
  CABLECAR_LINE_DASHARRAY,
  CABLECAR_LINE_OPACITY,
  resolveAirshipColor,
  resolveCableCarColor,
} from '../expressions/transit-color';

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
      'line-opacity': 0.65,
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
      'line-dasharray': [3, 1],
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
