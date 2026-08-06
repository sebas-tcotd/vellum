/**
 * Transit layer group: offset corridor lines, inner connections, stations.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 *
 * Implements the paper's rendering model (SIGSPATIAL 2018 §5) on MapLibre:
 * each line feature carries `offsetIdx` (its slot in the corridor bundle) and
 * is displaced by `line-offset`. The offset expression is calibrated so that
 * one index unit equals exactly `SLOT_M` world meters at every zoom
 * (`px = m × 512·2^zoom / 40075016.686` at the equator, where all Vellum
 * geometry lives — see coordinate-transform.ts). This keeps the GPU-offset
 * line ends congruent with the precomputed world-space inner-connection
 * Béziers and station polygons.
 *
 * `line-width` follows the same geographic scaling at detail zooms but is
 * clamped at low zooms for legibility (documented deviation: at overview
 * zooms the offsets collapse below a pixel and the bundle visually merges
 * into a single stroke, which matches how geographic maps degrade).
 */

import type { CityData } from '@vellum/core';
import maplibregl from 'maplibre-gl';
import { buildTransitRenderData } from '../geojson';
import { LINE_WIDTH_M, SLOT_M } from '../transit/render-geometry';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';

// Pixels per world meter at the equator for zoom 13 (512px tiles):
// 512 × 2^13 / 40075016.686
const PX_PER_M_Z13 = (512 * 8192) / 40075016.686;
const Z_LO = 13;
const Z_HI = 18;
const SCALE_HI = 2 ** (Z_HI - Z_LO);

// Station marker style (paper §5.4 / Fig. 10: solid white body, visible black
// stroke). Kept as named constants here — consistent with how this layer
// already carried its marker colors — rather than added to the theme system,
// since the black-on-white station convention is fixed, not theme-dependent.
export const STATION_FILL = '#ffffff';
export const STATION_STROKE = '#111111';
/** Black outline width in world meters (drawn as a scaled line on the ring). */
const STATION_STROKE_M = LINE_WIDTH_M * 0.4;
/** Minimum on-screen stroke width in px, so the outline stays visible when zoomed out. */
export const STATION_STROKE_MIN_PX = 1.2;

/**
 * Minimum on-screen transit-line width, in px. Derived to match the largest
 * arterial road at overview zoom (~2 px at z13: fixed 0.3 + scaled 2.0 ×
 * zoomFactor 0.85), so the transit system stays at least as prominent as the
 * major road grid at every zoom instead of collapsing to a hairline. Above the
 * detail zooms the geographic width takes over, keeping `line-offset` (which is
 * geographic) and the line width in agreement so bundles fill their slots.
 */
export const TRANSIT_LINE_MIN_PX = 2.2;

// Station capsule ⇆ dot cross-fade. The world-locked capsule only reads at
// detail zoom (its thickness is geographic); below that it is sub-pixel, so a
// floored-size `circle` dot stands in. They cross-fade over [Z_FADE_LO, Z_FADE_HI].
const Z_FADE_LO = 15.5;
const Z_FADE_HI = 16.5;
/** Minimum station-dot radius in px — keeps stops discoverable/clickable at overview. */
export const STATION_DOT_MIN_PX = 3.4;

/** Geographic exponential width expression scaled by `factor`, floored at `minPx`. */
function scaledWidthExpression(
  worldMeters: number,
  minPx: number,
): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    Z_LO,
    Math.max(minPx, worldMeters * PX_PER_M_Z13),
    16,
    Math.max(minPx, worldMeters * PX_PER_M_Z13 * 2 ** (16 - Z_LO)),
    Z_HI,
    worldMeters * PX_PER_M_Z13 * SCALE_HI,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** Transit-line width: geographic at detail, floored to arterial parity at overview. */
function widthExpression(): maplibregl.ExpressionSpecification {
  return scaledWidthExpression(LINE_WIDTH_M, TRANSIT_LINE_MIN_PX);
}

/** Linear zoom cross-fade from `lo` opacity to `hi` opacity over [Z_FADE_LO, Z_FADE_HI]. */
function fadeExpression(
  lo: number,
  hi: number,
): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    Z_FADE_LO,
    lo,
    Z_FADE_HI,
    hi,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** Adds transit corridor lines, inner connections, and station polygons. */
export function addTransitLayers(
  map: maplibregl.Map,
  cityData: CityData,
): void {
  const data = buildTransitRenderData(cityData);

  addSourceIfAbsent(map, 'transit', { type: 'geojson', data: data.lines });
  addSourceIfAbsent(map, 'transit-connectors', {
    type: 'geojson',
    data: data.connectors,
  });
  addSourceIfAbsent(map, 'transit-stops', {
    type: 'geojson',
    data: data.stations,
  });
  addSourceIfAbsent(map, 'transit-stops-dots', {
    type: 'geojson',
    data: data.stationDots,
  });

  // Inner connections first (under the corridor lines): their geometry is
  // pre-displaced, so they render without line-offset.
  addLayerIfAbsent(map, {
    id: 'transit-connector',
    type: 'line',
    source: 'transit-connectors',
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': [
        'get',
        'color',
      ] as unknown as maplibregl.ExpressionSpecification,
      'line-width': widthExpression(),
    },
  });

  addLayerIfAbsent(map, {
    id: 'transit-line',
    type: 'line',
    source: 'transit',
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': [
        'get',
        'color',
      ] as unknown as maplibregl.ExpressionSpecification,
      // Exact geographic offset: offsetIdx × SLOT_M meters at every zoom, so
      // GPU-offset line ends meet the precomputed connector endpoints.
      'line-offset': [
        'interpolate',
        ['exponential', 2],
        ['zoom'],
        Z_LO,
        ['*', ['get', 'offsetIdx'], SLOT_M * PX_PER_M_Z13],
        Z_HI,
        ['*', ['get', 'offsetIdx'], SLOT_M * PX_PER_M_Z13 * SCALE_HI],
      ] as unknown as maplibregl.ExpressionSpecification,
      'line-width': widthExpression(),
    },
  });

  // Station markers on top (paper §5 step 4): solid white capsule body, faded
  // IN at detail zoom where the world-locked geometry is large enough to read…
  addLayerIfAbsent(map, {
    id: 'transit-stops',
    type: 'fill',
    source: 'transit-stops',
    paint: {
      'fill-color': STATION_FILL,
      'fill-opacity': fadeExpression(0, 1),
    },
  });

  // …with a clearly visible black stroke. A `line` layer on the same polygon
  // source renders the ring at a real, zoom-scaled width (the fill layer's
  // `fill-outline-color` is only a hairline 1px and reads as barely visible).
  addLayerIfAbsent(map, {
    id: 'transit-stops-outline',
    type: 'line',
    source: 'transit-stops',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': STATION_STROKE,
      'line-width': scaledWidthExpression(
        STATION_STROKE_M,
        STATION_STROKE_MIN_PX,
      ),
      'line-opacity': fadeExpression(0, 1),
    },
  });

  // Min-size dot: the overview-zoom stand-in for the capsule. Floored radius
  // keeps stops visible and clickable when the capsule is sub-pixel; it fades
  // OUT as the capsule fades in, so exactly one marker reads at any zoom.
  addLayerIfAbsent(map, {
    id: 'transit-stops-dot',
    type: 'circle',
    source: 'transit-stops-dots',
    paint: {
      'circle-color': STATION_FILL,
      'circle-stroke-color': STATION_STROKE,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        STATION_DOT_MIN_PX,
        16,
        STATION_DOT_MIN_PX + 1,
      ] as unknown as maplibregl.ExpressionSpecification,
      'circle-stroke-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        10,
        1.2,
        16,
        1.8,
      ] as unknown as maplibregl.ExpressionSpecification,
      'circle-opacity': fadeExpression(1, 0),
      'circle-stroke-opacity': fadeExpression(1, 0),
    },
  });
}
