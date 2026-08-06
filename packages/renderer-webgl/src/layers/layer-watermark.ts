import maplibregl from 'maplibre-gl';
import { vellumLogoDataUri } from '../assets/vellum-logo';
import { WATERMARK_LAYER_ID } from '../constants/layer.constants';
import { csToGeo } from '../coordinate-transform';

import { addSourceIfAbsent } from '../helpers';

const SOURCE_ID = 'vellum-watermark-source';

// Linear zoom interpolation matching the map-frame layer. Stops cover the full
// camera zoom range (z0–z22) so MapLibre never clamps. Values are chosen to
// keep the displayed watermark well within the world-extent inner area at every
// zoom level — it never overflows the map frame.
const WATERMARK_SIZE_EXPR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  0,
  0.01,
  6,
  0.05,
  10,
  0.2,
  12,
  0.6,
  14,
  1.0,
  16,
  1.4,
  18,
  1.8,
  22,
  2.5,
];

function loadWatermarkImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = vellumLogoDataUri();
  });
}

export async function addWatermarkLayer(map: maplibregl.Map): Promise<void> {
  if (map.getLayer(WATERMARK_LAYER_ID)) return;

  const img = await loadWatermarkImage();

  if (!map.hasImage('vellum-logo')) {
    map.addImage('vellum-logo', img, { pixelRatio: 2 });
  }

  const center = csToGeo({ x: 0, z: 0 });

  addSourceIfAbsent(map, SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [center.lng, center.lat],
          },
          properties: {},
        },
      ],
    },
  });

  map.addLayer(
    {
      id: WATERMARK_LAYER_ID,
      type: 'symbol',
      source: SOURCE_ID,
      layout: {
        'icon-image': 'vellum-logo',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': WATERMARK_SIZE_EXPR,
      },
      paint: {
        'icon-opacity': 1,
      },
    },
    layerAboveBackground(map),
  );
}

/**
 * Id of the layer that sits directly above the opaque background.
 *
 * @remarks
 * `addLayer`'s second argument is a `beforeId`, so passing the *first* layer's
 * id — as this once did — inserted the watermark underneath everything,
 * including the `background` layer. A MapLibre `background` layer paints the
 * whole viewport opaque, so the mark was drawn and then completely covered:
 * present in the style, invisible on screen. It only became noticeable once
 * the background started following the active theme; before that it was
 * transparent enough to see through.
 *
 * Directly above the background is also the right place on its own terms — a
 * watermark belongs behind the cartography, not over it — so with layers on it
 * stays hidden, and with every layer off it is the only thing left to see.
 *
 * @param map - Map whose current layer stack is inspected.
 * @returns The `beforeId` to insert at, or `undefined` to append on top.
 */
function layerAboveBackground(map: maplibregl.Map): string | undefined {
  const layers = map.getStyle().layers ?? [];
  const backgroundIndex = layers.findIndex(
    (layer) => layer.id === 'background',
  );
  // No background to sit above: appending on top is the only safe choice, and
  // is still better than being buried at the bottom.
  if (backgroundIndex < 0) return undefined;
  return layers[backgroundIndex + 1]?.id;
}
