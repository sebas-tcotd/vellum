/**
 * MapLibre interaction subscriptions: hover tooltips and viewport tracking.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { TransitMode } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import type { TransitStopFeatureProperties } from '../geojson';
import type { ViewportBounds } from '../map-libre-renderer';

type TransitLineInfo = { name: string; color: string; mode: TransitMode };

/** Station hit-test layers: the detail-zoom capsule and the overview-zoom dot. */
const STATION_HIT_LAYERS = ['transit-stops', 'transit-stops-dot'];

/**
 * Subscribes to viewport changes (pan/zoom).
 *
 * @remarks
 * Also fires once on the next `idle` event so that Minimap receives an
 * initial viewport state even when `render()` deferred `fitBounds` to the
 * MapLibre `load` event.
 *
 * @returns Cleanup function that unregisters all listeners.
 */
export function subscribeViewport(
  map: maplibregl.Map,
  callback: (bounds: ViewportBounds) => void,
): () => void {
  const handler = () => {
    const b = map.getBounds();
    callback({
      westLng: b.getWest(),
      eastLng: b.getEast(),
      northLat: b.getNorth(),
      southLat: b.getSouth(),
    });
  };

  let idleFired = false;
  const idleHandler = () => {
    if (idleFired) return;
    idleFired = true;
    handler();
  };

  map.on('move', handler);
  map.on('moveend', handler);
  map.on('idle', idleHandler);

  return () => {
    map.off('move', handler);
    map.off('moveend', handler);
    map.off('idle', idleHandler);
  };
}

/**
 * Subscribes to hover events over transit-stop features.
 *
 * @remarks
 * Uses layer-filtered MapLibre events (`mousemove`/`mouseleave` on
 * `transit-stops`) so the handler only fires when the cursor is over a stop
 * feature. A ±6px bbox query handles visually overlapping stops.
 *
 * @returns Cleanup function that unregisters both listeners.
 */
export function subscribeHover(
  map: maplibregl.Map,
  callback: (
    info: { screenX: number; screenY: number; lines: TransitLineInfo[] } | null,
  ) => void,
): () => void {
  const handleMove = (
    e: maplibregl.MapMouseEvent & {
      features?: maplibregl.MapGeoJSONFeature[];
    },
  ) => {
    const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
      [e.point.x - 6, e.point.y - 6],
      [e.point.x + 6, e.point.y + 6],
    ];
    const nearby = map.queryRenderedFeatures(bbox, {
      layers: STATION_HIT_LAYERS,
    });
    if (nearby.length === 0) return;

    const linesSeen = new Set<string>();
    const allLines: Array<TransitLineInfo> = [];

    for (const feature of nearby) {
      if (!feature.properties) continue;
      const props = feature.properties as TransitStopFeatureProperties;
      let parsed: Array<TransitLineInfo>;
      try {
        parsed = JSON.parse(props.lines) as Array<TransitLineInfo>;
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      for (const line of parsed) {
        const key = `${line.name}:${line.color}`;
        if (!linesSeen.has(key)) {
          linesSeen.add(key);
          allLines.push(line);
        }
      }
    }

    if (allLines.length === 0) return;

    map.getCanvas().style.cursor = 'pointer';
    callback({ screenX: e.point.x, screenY: e.point.y, lines: allLines });
  };

  const handleLeave = () => {
    map.getCanvas().style.cursor = '';
    callback(null);
  };

  // Both markers are hit targets: the capsule reads at detail zoom, the floored
  // dot at overview zoom (where the capsule is sub-pixel). Registering on both
  // keeps stops interactive at every zoom, matching the visible geometry.
  for (const layer of STATION_HIT_LAYERS) {
    map.on('mousemove', layer, handleMove);
    map.on('mouseleave', layer, handleLeave);
  }

  return () => {
    for (const layer of STATION_HIT_LAYERS) {
      map.off('mousemove', layer, handleMove);
      map.off('mouseleave', layer, handleLeave);
    }
  };
}
