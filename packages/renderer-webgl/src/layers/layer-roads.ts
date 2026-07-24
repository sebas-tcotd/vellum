/**
 * Roads layer registration: casing and fill lines with data-driven colors.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
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
import { buildRoadsGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/** Adds roads source and both casing + fill layers. */
export function addRoadsLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'roads', {
    type: 'geojson',
    data: buildRoadsGeoJson(cityData),
  });

  const notFerry = [
    '!=',
    ['get', 'itemClass'],
    'Ferry Path',
  ] as unknown as maplibregl.ExpressionSpecification;
  const notRailway = [
    '!',
    [
      'in',
      ['get', 'itemClass'],
      [
        'literal',
        [
          'Train Track',
          'Train Track Tunnel',
          'Train Track Elevated',
          'Metro Track',
          'Metro Track Tunnel',
          'Metro Track Elevated',
          'Monorail Track',
          'Monorail Track Elevated',
        ],
      ],
    ],
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
      notFerry,
      notRailway,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
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
      notFerry,
      notRailway,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
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
      notFerry,
      notRailway,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
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
      notFerry,
      notRailway,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(colors, 'fill'),
      'line-width': ROAD_WIDTH_EXPR,
      'line-opacity': 1,
      'line-opacity-transition': { duration: 300 },
    },
  });

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
      notFerry,
      notRailway,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
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
      notFerry,
      notRailway,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
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
      notFerry,
      notRailway,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
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
    filter: ['==', ['get', 'itemClass'], 'Ferry Path'],
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

  // ─── Railways: surface / elevated / underground ──────────────────────────

  const isRailway = [
    'in',
    ['get', 'itemClass'],
    [
      'literal',
      [
        'Train Track',
        'Train Track Tunnel',
        'Train Track Elevated',
        'Metro Track',
        'Metro Track Tunnel',
        'Metro Track Elevated',
        'Monorail Track',
        'Monorail Track Elevated',
      ],
    ],
  ] as unknown as maplibregl.ExpressionSpecification;

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
