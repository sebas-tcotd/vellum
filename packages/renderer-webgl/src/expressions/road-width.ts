/**
 * Zoom-interpolated road width expressions.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 * Width model: totalWidth = fixed + (scaled × zoomFactor).
 */

import type maplibregl from 'maplibre-gl';

/** Line width expression using stored fixedWidth/scaledWidth properties. */
export const ROAD_WIDTH_EXPR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  8,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 0.1]],
  14,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 1.0]],
  18,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 3.0]],
] as unknown as maplibregl.ExpressionSpecification;

/** Casing line width expression (fill width + 1–3px depending on zoom). */
export const ROAD_CASING_WIDTH_EXPR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  8,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 0.1], 1],
  14,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 1.0], 2],
  18,
  ['+', ['get', 'fixedWidth'], ['*', ['get', 'scaledWidth'], 3.0], 3],
] as unknown as maplibregl.ExpressionSpecification;
