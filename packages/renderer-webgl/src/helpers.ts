/**
 * Shared helpers for MapLibre source/layer registration and coordinate conversion.
 *
 * @remarks
 * These are internal utilities — not exported from the package barrel.
 */

import type { CityData } from '@vellum/core';
import type * as maplibregl from 'maplibre-gl';
import { CS1_WORLD_HALF, csToGeoArray } from './coordinate-transform';

/**
 * Converts a `CityData` bounding box to a `[[swLng, swLat], [neLng, neLat]]`
 * pair suitable for `map.fitBounds()` and `map.setMaxBounds()`.
 */
export function getCityBoundsGeoJSON(
  cityData: CityData,
): [[number, number], [number, number]] {
  const { bounds } = cityData;
  const [swLng, swLat] = csToGeoArray({ x: bounds.minX, z: bounds.minZ });
  const [neLng, neLat] = csToGeoArray({ x: bounds.maxX, z: bounds.maxZ });
  return [
    [swLng, swLat],
    [neLng, neLat],
  ];
}

/**
 * The whole terrain extent (±{@link CS1_WORLD_HALF} on both axes) as a
 * `[[swLng, swLat], [neLng, neLat]]` pair.
 *
 * @remarks
 * Not the city's bounds: those wrap the road network only, while the terrain
 * is painted across the entire world.
 */
export function getWorldBoundsGeoJSON(): [[number, number], [number, number]] {
  return [
    csToGeoArray({ x: -CS1_WORLD_HALF, z: -CS1_WORLD_HALF }),
    csToGeoArray({ x: CS1_WORLD_HALF, z: CS1_WORLD_HALF }),
  ];
}

/**
 * Adds a GeoJSON source if it does not exist, or updates its data if it does.
 */
export function addSourceIfAbsent(
  map: maplibregl.Map,
  id: string,
  data: maplibregl.SourceSpecification,
): void {
  if (map.getSource(id)) {
    (map.getSource(id) as maplibregl.GeoJSONSource).setData(
      (data as maplibregl.GeoJSONSourceSpecification).data as Parameters<
        maplibregl.GeoJSONSource['setData']
      >[0],
    );
  } else {
    map.addSource(id, data);
  }
}

/**
 * Adds a layer only if it does not already exist on the map.
 */
export function addLayerIfAbsent(
  map: maplibregl.Map,
  layer: maplibregl.LayerSpecification,
): void {
  if (!map.getLayer(layer.id)) {
    map.addLayer(layer);
  }
}
