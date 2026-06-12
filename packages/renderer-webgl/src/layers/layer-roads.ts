/**
 * Roads layer registration: casing and fill lines with data-driven colors.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { buildRoadColorExpression } from '../expressions/road-color';
import {
  ROAD_CASING_WIDTH_EXPR,
  ROAD_WIDTH_EXPR,
} from '../expressions/road-width';
import { buildRoadsGeoJson } from '../geojson-builder';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { RendererTokens } from '../tokens';

/** Adds roads source and both casing + fill layers. */
export function addRoadsLayer(
  map: maplibregl.Map,
  cityData: CityData,
  tokens: RendererTokens,
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

  addLayerIfAbsent(map, {
    id: 'roads-casing',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      ['!=', ['get', 'isTunnel'], true],
      ['!=', ['get', 'isBridge'], true],
      notFerry,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(tokens, 'casing'),
      'line-width': ROAD_CASING_WIDTH_EXPR,
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-fill',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      ['!=', ['get', 'isTunnel'], true],
      ['!=', ['get', 'isBridge'], true],
      notFerry,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(tokens, 'fill'),
      'line-width': ROAD_WIDTH_EXPR,
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-tunnel-bridge-casing',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      [
        'any',
        ['==', ['get', 'isTunnel'], true],
        ['==', ['get', 'isBridge'], true],
      ],
      notFerry,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(tokens, 'casing'),
      'line-width': ROAD_CASING_WIDTH_EXPR,
      'line-dasharray': [6, 3],
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-tunnel-bridge-fill',
    type: 'line',
    source: 'roads',
    filter: [
      'all',
      [
        'any',
        ['==', ['get', 'isTunnel'], true],
        ['==', ['get', 'isBridge'], true],
      ],
      notFerry,
    ],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(tokens, 'fill'),
      'line-width': ROAD_WIDTH_EXPR,
      'line-dasharray': [6, 3],
    },
  });

  addLayerIfAbsent(map, {
    id: 'roads-ferry',
    type: 'line',
    source: 'roads',
    filter: ['==', ['get', 'itemClass'], 'Ferry Path'],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': '#1A5276',
      'line-opacity': 0.65,
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
    id: 'roads-railway-casing',
    type: 'line',
    source: 'roads',
    filter: ['==', ['get', 'itemClass'], 'Train Track'],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': buildRoadColorExpression(tokens, 'casing'),
      'line-width': ROAD_CASING_WIDTH_EXPR,
      'line-dasharray': [1, 1],
    },
  });
}
