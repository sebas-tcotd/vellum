import type { TransitMode } from './city-data';

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

/** Ordered array of every `TransitMode` variant, including the `'Unknown'` DLC fallback. */
export const TRANSIT_MODES: TransitMode[] = [
  'Bus',
  'Tram',
  'Train',
  'Metro',
  'CableCar',
  'Monorail',
  'Ferry',
  'Blimp',
  'Trolleybus',
  'Unknown',
];

/** Top-level zoning group a building belongs to, derived from `Building.serviceType`
 * via `BUILDING_SERVICE_TYPE_CATEGORY` (the substring before the first `.`).
 * @remarks
 * Mirrors the top-level keys of `BuildingColorParams` — kept here rather than in
 * `theme.ts` since it's a filtering concern, not a color one.
 */
export type BuildingServiceCategory =
  | 'residential'
  | 'commercial'
  | 'office'
  | 'industry'
  | 'civic'
  | 'none';

/** Ordered array of every `BuildingServiceCategory` variant. */
export const BUILDING_SERVICE_CATEGORIES: BuildingServiceCategory[] = [
  'residential',
  'commercial',
  'office',
  'industry',
  'civic',
  'none',
];

/**
 * Per-layer advanced filter options for the layers whose visibility isn't just
 * a single on/off switch — see `future-work-panel-opciones-avanzadas.md`.
 * @remarks
 * Only layers with an actual filterable dimension get an entry here; layers
 * like `terrain` or `roads` have no sub-filter and are fully covered by
 * `LayerVisibility` alone.
 */
export interface LayerOptions {
  /** Transit lines/stops whose `mode` is not in this list are hidden. */
  transit: { visibleModes: TransitMode[] };
  buildings: {
    /** Buildings whose zoning category is not in this list are hidden. */
    visibleCategories: BuildingServiceCategory[];
    /**
     * When `true`, residential/commercial/office/industry buildings render in
     * fixed RICO zoning colors instead of the theme's flat default. Civic
     * buildings always render in their theme-specific subcategory color
     * regardless of this flag.
     */
    colorByCategory: boolean;
  };
}

/** `LayerOptions` with every mode/category visible and RICO coloring off — the app's starting state. */
export const DEFAULT_LAYER_OPTIONS: LayerOptions = {
  transit: { visibleModes: [...TRANSIT_MODES] },
  buildings: {
    visibleCategories: [...BUILDING_SERVICE_CATEGORIES],
    colorByCategory: false,
  },
};
