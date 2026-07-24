/**
 * MapLibre interaction subscriptions: hover tooltips and viewport tracking.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type { TransitMode } from '@vellum/core';
import type maplibregl from 'maplibre-gl';
import type {
  DistrictFeatureProperties,
  TransitStopFeatureProperties,
} from '../geojson';
import type { ViewportBounds } from '../map-libre-renderer';
import { SERVICE_GROUPS, SERVICE_ICONS_MIN_ZOOM } from '../service-icons';
import type { ServiceGroup } from '../service-icons';
import type {
  DistrictTooltipInfo,
  ServiceIconLegendState,
  TooltipInfo,
  TransitTooltipInfo,
} from '../types/renderer.types';

type TransitLineInfo = { name: string; color: string; mode: TransitMode };

/** Station hit-test layers: the detail-zoom capsule and the overview-zoom dot. */
const STATION_HIT_LAYERS = ['transit-stops', 'transit-stops-dot'];

/** District hover hit-test layer — only active in the default "points" display mode. */
const DISTRICT_HIT_LAYER = 'districts-points';

/** Narrows a raw feature-property value to a known `ServiceGroup`, rejecting anything else. */
function isServiceGroup(value: unknown): value is ServiceGroup {
  return (
    typeof value === 'string' && (SERVICE_GROUPS as string[]).includes(value)
  );
}

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
 * Subscribes to the service-icon legend's relevance: whether the zoom is
 * past the threshold where service icons render, and which `ServiceGroup`s
 * currently have an icon rendered in the viewport.
 *
 * @remarks
 * Unlike {@link subscribeViewport}, the expensive `queryRenderedFeatures`
 * call only runs on `moveend`/`idle` — `move` fires on every animation frame
 * during a drag, and re-querying rendered features that often would compete
 * with the render budget. The `move` handler only re-checks the cheap zoom
 * threshold, so the legend still hides/shows promptly mid-drag; the group
 * list itself settles once the drag ends. `queryRenderedFeatures` is also
 * skipped while the `service-icons` layer hasn't been added to the style yet
 * (e.g. a `move` event racing the async icon-image load in
 * `addServiceIconsLayer`), which would otherwise throw.
 *
 * @returns Cleanup function that unregisters all listeners.
 */
export function subscribeServiceIconLegend(
  map: maplibregl.Map,
  callback: (state: ServiceIconLegendState) => void,
): () => void {
  const zoomHandler = () => {
    if (map.getZoom() < SERVICE_ICONS_MIN_ZOOM) {
      callback({ visible: false, groups: [] });
    }
  };

  const fullHandler = () => {
    const visible = map.getZoom() >= SERVICE_ICONS_MIN_ZOOM;
    if (!visible || !map.getLayer('service-icons')) {
      callback({ visible, groups: [] });
      return;
    }

    const features = map.queryRenderedFeatures({ layers: ['service-icons'] });
    const groups = new Set<ServiceGroup>();
    for (const feature of features) {
      const group = feature.properties?.['serviceGroup'];
      if (isServiceGroup(group)) groups.add(group);
    }
    // Stable, canonical order so the legend list doesn't reorder between
    // pans/zooms just because queryRenderedFeatures' return order changed.
    callback({
      visible: true,
      groups: SERVICE_GROUPS.filter((group) => groups.has(group)),
    });
  };

  let idleFired = false;
  const idleHandler = () => {
    if (idleFired) return;
    idleFired = true;
    fullHandler();
  };

  map.on('move', zoomHandler);
  map.on('moveend', fullHandler);
  map.on('idle', idleHandler);

  return () => {
    map.off('move', zoomHandler);
    map.off('moveend', fullHandler);
    map.off('idle', idleHandler);
  };
}

/**
 * Subscribes to hover events over transit-stop and district-marker features.
 *
 * @remarks
 * Uses layer-filtered MapLibre events (`mousemove`/`mouseleave` on
 * `transit-stops`/`districts-points`) so each handler only fires when the
 * cursor is over its own feature kind. A ±6px bbox query handles visually
 * overlapping features. Districts only emit hover in the default "points"
 * display mode — `districts-points` is hidden (and un-queryable) while the
 * "text on map" mode is active, so no extra kind-check is needed here.
 *
 * @returns Cleanup function that unregisters all listeners.
 */
export function subscribeHover(
  map: maplibregl.Map,
  callback: (info: TooltipInfo | null) => void,
): () => void {
  const handleTransitMove = (
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
    const info: TransitTooltipInfo = {
      kind: 'transit',
      screenX: e.point.x,
      screenY: e.point.y,
      lines: allLines,
    };
    callback(info);
  };

  const handleDistrictMove = (
    e: maplibregl.MapMouseEvent & {
      features?: maplibregl.MapGeoJSONFeature[];
    },
  ) => {
    const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
      [e.point.x - 6, e.point.y - 6],
      [e.point.x + 6, e.point.y + 6],
    ];
    const nearby = map.queryRenderedFeatures(bbox, {
      layers: [DISTRICT_HIT_LAYER],
    });
    const feature = nearby[0];
    if (!feature?.properties) return;
    const props = feature.properties as DistrictFeatureProperties;

    map.getCanvas().style.cursor = 'pointer';
    const info: DistrictTooltipInfo = {
      kind: 'district',
      screenX: e.point.x,
      screenY: e.point.y,
      name: props.name,
    };
    callback(info);
  };

  const handleLeave = () => {
    map.getCanvas().style.cursor = '';
    callback(null);
  };

  // Both markers are hit targets: the capsule reads at detail zoom, the floored
  // dot at overview zoom (where the capsule is sub-pixel). Registering on both
  // keeps stops interactive at every zoom, matching the visible geometry.
  for (const layer of STATION_HIT_LAYERS) {
    map.on('mousemove', layer, handleTransitMove);
    map.on('mouseleave', layer, handleLeave);
  }
  map.on('mousemove', DISTRICT_HIT_LAYER, handleDistrictMove);
  map.on('mouseleave', DISTRICT_HIT_LAYER, handleLeave);

  return () => {
    for (const layer of STATION_HIT_LAYERS) {
      map.off('mousemove', layer, handleTransitMove);
      map.off('mouseleave', layer, handleLeave);
    }
    map.off('mousemove', DISTRICT_HIT_LAYER, handleDistrictMove);
    map.off('mouseleave', DISTRICT_HIT_LAYER, handleLeave);
  };
}
