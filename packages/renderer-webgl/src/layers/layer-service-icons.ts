/**
 * Service-building icon markers: fixed-color Maki icons over civic buildings
 * (electricity, water, waste, health, fire, security, education, parks,
 * monuments), matching Cities: Skylines' own service HUD categories.
 *
 * @remarks
 * Internal module — not exported from the package barrel.
 */

import type maplibregl from 'maplibre-gl';
import {
  SERVICE_GROUPS,
  SERVICE_ICONS_MIN_ZOOM,
  serviceIconDataUri,
  type ServiceGroup,
} from '../service-icons';
import { addLayerIfAbsent } from '../helpers';

/**
 * Loads one service icon's SVG as a data URI and registers it under `id`.
 * Same load pattern as `layer-background.ts`'s grid pattern image.
 */
async function loadServiceIcon(
  map: maplibregl.Map,
  group: ServiceGroup,
): Promise<void> {
  if (map.hasImage(group)) return;

  const img = new Image();
  img.src = serviceIconDataUri(group);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Service icon load timeout: ${group}`)),
      2000,
    );
    img.onload = () => {
      clearTimeout(timeout);
      map.addImage(group, img, { pixelRatio: 2 });
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to load service icon: ${group}`));
    };
  });
}

/**
 * Loads every service icon image and adds the `service-icons` symbol layer —
 * one icon per civic building whose `serviceGroup` matches a known category.
 *
 * @remarks
 * Sources from the existing `buildings` GeoJSON source (must already be
 * registered — call after {@link addBuildingsLayer}); MapLibre places one
 * symbol at each polygon feature's position automatically, no separate point
 * source needed. Each icon fails silently on its own (cosmetic, not
 * critical) so one slow/broken icon never blocks the rest of the render.
 */
export async function addServiceIconsLayer(map: maplibregl.Map): Promise<void> {
  await Promise.all(
    SERVICE_GROUPS.map((group) =>
      loadServiceIcon(map, group).catch(() => {
        // Graceful degradation: a missing icon just means that group renders without one.
      }),
    ),
  );

  addLayerIfAbsent(map, {
    id: 'service-icons',
    type: 'symbol',
    source: 'buildings',
    minzoom: SERVICE_ICONS_MIN_ZOOM,
    filter: [
      'in',
      ['get', 'serviceGroup'],
      ['literal', SERVICE_GROUPS],
    ] as unknown as maplibregl.FilterSpecification,
    layout: {
      'icon-image': ['get', 'serviceGroup'] as unknown as string,
      'icon-size': 1,
      'icon-allow-overlap': true,
    },
    paint: {
      'icon-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14,
        0,
        16,
        1,
      ] as unknown as number,
    },
  });
}
