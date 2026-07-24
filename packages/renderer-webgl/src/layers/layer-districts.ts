/**
 * Districts layer registration: labeled points and the alternative text-label mode.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import { buildDistrictsGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

/**
 * Adds the districts source plus both display-mode layers: the default
 * marker circle (`districts-points`) and the opt-in text label
 * (`districts-labels`, DM Mono). `MapLayerManager` toggles their layout
 * `visibility` based on `LayerOptions.districts.showNameOnMap` — exactly one
 * is ever visible at a time. Both start hidden; the renderer's initial-state
 * pass sets the real visibility right after this call.
 */
export function addDistrictsLayer(
  map: maplibregl.Map,
  cityData: CityData,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, 'districts', {
    type: 'geojson',
    data: buildDistrictsGeoJson(cityData),
  });

  addLayerIfAbsent(map, {
    id: 'districts-points',
    type: 'circle',
    source: 'districts',
    layout: { visibility: 'none' },
    paint: {
      'circle-color': colors.districtFill,
      'circle-radius': 6,
      'circle-stroke-color': colors.districtLabel,
      'circle-stroke-width': 1,
      'circle-opacity': 1,
      'circle-opacity-transition': { duration: 300 },
    },
  });

  addLayerIfAbsent(map, {
    id: 'districts-labels',
    type: 'symbol',
    source: 'districts',
    layout: {
      visibility: 'none',
      'text-field': ['get', 'name'],
      'text-font': ['DM Mono'],
      'text-size': 12,
      // Collision handled natively by MapLibre — dense clusters simply hide
      // the labels that would overlap until zoom gives them room.
      'text-allow-overlap': false,
      'text-ignore-placement': false,
    },
    paint: {
      'text-color': colors.districtLabel,
      'text-halo-color': colors.background,
      'text-halo-width': 1.5,
      'text-opacity': 1,
    },
  });
}
