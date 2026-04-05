// packages/core/src/types/layer.ts

/** Identificador de una capa de renderizado. */
export type LayerName =
  | 'terrain'
  | 'water'
  | 'roads'
  | 'transit'
  | 'buildings'
  | 'forests'
  | 'districts';

/** Array ordenado con todos los nombres de capa válidos. Usar para inicializar visibilidad. */
export const LAYER_NAMES: LayerName[] = [
  'terrain',
  'water',
  'roads',
  'transit',
  'buildings',
  'forests',
  'districts',
];

/** Mapa de visibilidad por capa: `true` = visible, `false` = oculta. */
export type LayerVisibility = Record<LayerName, boolean>;
