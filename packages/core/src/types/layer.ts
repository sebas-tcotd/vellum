// packages/core/src/types/layer.ts
export type LayerName =
  | 'terrain'
  | 'water'
  | 'roads'
  | 'transit'
  | 'buildings'
  | 'forests'
  | 'districts';

export const LAYER_NAMES: LayerName[] = [
  'terrain',
  'water',
  'roads',
  'transit',
  'buildings',
  'forests',
  'districts',
];

export type LayerVisibility = Record<LayerName, boolean>;
