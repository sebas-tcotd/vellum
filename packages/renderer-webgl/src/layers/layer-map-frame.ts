import type maplibregl from 'maplibre-gl';
import { FRAME_LAYER_IDS } from '../constants/layer.constants';
import { buildWorldExtentGeoJson } from '../geojson';
import { addLayerIfAbsent, addSourceIfAbsent } from '../helpers';
import type { ResolvedColors } from '../style-adapter';

const SHADOW_LAYER_ID = FRAME_LAYER_IDS[0];
const FRAME_LAYER_ID = FRAME_LAYER_IDS[1];

const SOURCE_ID = 'world-extent-source';

const FRAME_WIDTH = 20;
const SHADOW_OFFSET: [number, number] = [0, 4];
const SHADOW_BLUR = 12;
const SHADOW_COLOR = '#4A4035';
const SHADOW_OPACITY = 0.2;

/**
 * Adds a decorative map frame and its drop shadow as the topmost MapLibre layers.
 *
 * @remarks
 * Both layers share a single GeoJSON source built from `buildWorldExtentGeoJson`.
 * The shadow layer uses `line-translate` with viewport anchor and `line-blur` to
 * simulate a CSS `box-shadow` effect as requested: X0, Y4, Blur 12, #4A4035 @ 20%.
 */
export function addMapFrameLayer(
  map: maplibregl.Map,
  colors: ResolvedColors,
): void {
  addSourceIfAbsent(map, SOURCE_ID, {
    type: 'geojson',
    data: buildWorldExtentGeoJson(),
  });

  addLayerIfAbsent(map, {
    id: SHADOW_LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': SHADOW_COLOR,
      'line-opacity': SHADOW_OPACITY,
      'line-width': FRAME_WIDTH,
      'line-blur': SHADOW_BLUR,
      'line-translate': SHADOW_OFFSET,
      'line-translate-anchor': 'viewport',
    },
  });

  addLayerIfAbsent(map, {
    id: FRAME_LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': colors.mapFrame,
      'line-opacity': 1,
      'line-width': FRAME_WIDTH,
    },
  });
}
