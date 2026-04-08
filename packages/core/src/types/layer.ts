/** Defines the unique identifier for a logical map layer.
 * @remarks
 * These identifiers act as the contract between the UI toggle controls,
 * the theme engine, and the rendering system.
 */
export type LayerName =
  | 'terrain'
  | 'water'
  | 'roads'
  | 'transit'
  | 'buildings'
  | 'forests'
  | 'districts';

/** An ordered array containing all valid `LayerName` variants.
 * @remarks
 * Guaranteed to be exhaustive. Useful for iterating over all available layers
 * during runtime (e.g., initializing default store states or rendering UI panels)
 * without duplicating the list.
 */
export const LAYER_NAMES: LayerName[] = [
  'terrain',
  'water',
  'roads',
  'transit',
  'buildings',
  'forests',
  'districts',
];

/** A dictionary mapping each layer to its boolean visibility status.
 * @remarks
 * `true` indicates the layer should be processed by the renderer; `false` indicates it should be skipped.
 */
export type LayerVisibility = Record<LayerName, boolean>;
