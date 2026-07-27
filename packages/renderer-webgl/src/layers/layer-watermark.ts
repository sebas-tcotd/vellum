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

  const firstLayerId = map.getStyle().layers?.[0]?.id;
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
    firstLayerId,
  );
}
