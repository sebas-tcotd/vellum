import type {
  BuildingServiceCategory,
  CityData,
  LayerName,
  LayerOptions,
  LayerVisibility,
  ThemeMetadata,
  TransitMode,
  VellumError,
} from '@vellum/core';
import { DEFAULT_LAYER_OPTIONS, LAYER_NAMES } from '@vellum/core';
import type { ThemeWarning } from '@vellum/theme-engine';
import { create } from 'zustand';
import { i18n } from '../i18n/i18n-setup';

/**
 * Represents the explicit finite state machine for asynchronous operations.
 * @remarks
 * **CRITICAL RULE:** NEVER use primitive boolean flags like `isLoading`, `isSuccess`,
 * or `isError`. Always rely on this explicit state union to prevent impossible UI states
 * (e.g., rendering a loading spinner and an error message simultaneously).
 */
type LoadingState = 'idle' | 'loading' | 'error';

/** The global application state contract managed by Zustand. */
interface VellumStore {
  /** The parsed, immutable domain model of the city.
   * `null` if no map has been loaded yet. */
  cityData: CityData | null;

  /** Current phase of the map loading lifecycle. */
  loadingState: LoadingState;

  /** Stores the error details if the parsing or loading phase fails. */
  loadingError: VellumError | null;

  /** Counter for anti-race-condition load requests. Incremented on each new load. */
  loadRequestId: number;

  /** DLC/mod asset warnings collected during the last successful parse.
   * Non-empty triggers the DlcWarningToast (AC1). */
  dlcWarnings: string[];

  /** True when the displayed map was loaded via allow_partial mode (AC3).
   * Triggers the "partial data" variant of DlcWarningToast. */
  hasPartialData: boolean;

  /** Dictionary controlling the visibility of individual map layers in the renderer. */
  activeLayers: LayerVisibility;

  /** Identifier of the currently active visual theme (e.g., 'day', 'night'). */
  activeTheme: string;

  /**
   * Whether non-transit layers should dim to ~15% opacity while the Transit theme is active.
   * @remarks
   * `false` by default so the Transit theme keeps its original, undimmed look (Story 5.3
   * feedback: dimming looked great as an opt-in but eroded the theme's own charm as a forced
   * default). No UI toggle exists yet — this flag is the storage mechanism for the future
   * "advanced layer options" panel (see `future-work-panel-opciones-avanzadas.md`) to control.
   */
  transitDimmingEnabled: boolean;

  /**
   * Advanced per-layer visibility filters (transit-mode filter, buildings RICO
   * filter) — see `future-work-panel-opciones-avanzadas.md`. Orthogonal to
   * `activeLayers`: a layer can be fully visible here and still hidden by its
   * parent's on/off switch, and vice versa.
   */
  layerOptions: LayerOptions;

  /** Metadata for every theme loaded at startup — drives the selector pills. */
  availableThemes: ThemeMetadata[];

  /** The layer whose advanced-options sub-panel is currently open, or null if closed. */
  expandedPanelLayer: LayerName | null;

  /** Warnings for `.vellumstyle` files that were skipped as invalid (AC #5).
   * Non-empty triggers the ThemeWarningToast. */
  themeWarnings: ThemeWarning[];

  /** Indicates whether the automatic update checker is enabled. */
  autoUpdateEnabled: boolean;

  /** The currently active application language code. */
  activeLanguage: 'en' | 'es';

  // Actions
  /** Transitions the loading state machine and optionally sets an error payload. */
  setLoadingState: (state: LoadingState, error?: VellumError | null) => void;

  /**
   * Injects the parsed domain model into the global store.
   * @remarks
   * Automatically resets `loadingState` to 'idle' and clears any `loadingError`.
   */
  setCityData: (data: CityData) => void;

  /** Sets the DLC/mod asset warnings from the last parse. Pass [] to clear. */
  setDlcWarnings: (warnings: string[]) => void;

  /** Sets whether the current map was loaded via partial-parse mode. */
  setHasPartialData: (value: boolean) => void;

  /** Toggles the visibility state of a specific map layer. */
  toggleLayer: (layer: LayerName) => void;

  /** Applies a new visual theme.
   * @remarks Pure setter — the `applyTheme()` side effect lives in the renderer host (`MapLibreRoot`),
   * not here, to keep the store unaware of the renderer. */
  setActiveTheme: (theme: string) => void;

  /** Replaces the list of available themes (populated once at startup by `useThemes`). */
  setAvailableThemes: (themes: ThemeMetadata[]) => void;

  /** Toggles automatic non-transit layer dimming while the Transit theme is active. */
  setTransitDimmingEnabled: (enabled: boolean) => void;

  /** Adds/removes a transit mode from `layerOptions.transit.visibleModes`. */
  toggleTransitMode: (mode: TransitMode) => void;

  /** Adds/removes a building zoning category from `layerOptions.buildings.visibleCategories`. */
  toggleBuildingCategory: (category: BuildingServiceCategory) => void;

  /** Toggles the RICO "color by category" overlay for buildings. */
  setBuildingColorByCategory: (enabled: boolean) => void;

  /** Toggles between the district marker circle (off) and the text-label display mode (on). */
  setDistrictsShowNameOnMap: (enabled: boolean) => void;

  /** Shows or hides DLC park-area markers and labels within the districts layer. */
  setDistrictsShowParkAreas: (enabled: boolean) => void;

  /** Shows or hides the terrain contour lines. */
  setTerrainShowContourLines: (enabled: boolean) => void;
  /** Shows or hides the terrain colour-relief hypsometric ramp. */
  setTerrainShowColorRelief: (enabled: boolean) => void;
  /** Shows or hides the terrain hillshade shading. */
  setTerrainShowHillshade: (enabled: boolean) => void;

  /** Shows or hides the 9×9 projection grid on the basemap layer. */
  setBasemapShowGrid: (enabled: boolean) => void;

  /** Opens or closes the advanced-options sub-panel for a layer. Pass null to close. */
  setExpandedPanelLayer: (layer: LayerName | null) => void;

  /** Replaces the theme-loading warnings. Pass [] to clear. */
  setThemeWarnings: (warnings: ThemeWarning[]) => void;

  /**
   * Updates the application language globally.
   * @remarks
   * **Side Effects:** This action intentionally triggers an immediate hot-swap in `i18next` (NFR16)
   * and persists the choice to local storage.
   */
  setLanguage: (lang: 'en' | 'es') => void;

  /**
   * Synchronizes the Zustand state with the language detected during app initialization.
   * @remarks
   * **CRITICAL INVARIANT:** Designed EXCLUSIVELY for use within `App.tsx` immediately after
   * `initI18n()` resolves. It strictly bypasses `i18next` and `localStorage` side-effects to
   * prevent initialization loops.
   */
  syncActiveLanguage: (lang: 'en' | 'es') => void;

  /**
   * Increments the load request ID and resets loading state.
   * @returns The new load request ID.
   */
  incrementLoadRequestId: () => number;
}

/**
 * Pre-computes the initial visibility state where all known layers are enabled by default.
 * @internal
 */
const DEFAULT_ACTIVE_LAYERS = Object.fromEntries(
  LAYER_NAMES.map((name: LayerName) => [name, true] as const),
) as LayerVisibility;

/**
 * The global Zustand store hook for accessing the application state.
 *
 * @remarks
 * **Architectural Rules:**
 * - `CityData` is strictly immutable. Never attempt to mutate its nested properties directly;
 * always replace the entire reference using `setCityData`.
 * - UI preferences (layers, theme, language) are currently ephemeral or rely on `localStorage`.
 * Story 7.2 will introduce `tauri-plugin-store` for robust native persistence.
 */
export const useVellumStore = create<VellumStore>((set, get) => ({
  cityData: null,
  loadingState: 'idle',
  loadingError: null,
  loadRequestId: 0,
  activeLayers: DEFAULT_ACTIVE_LAYERS,
  activeTheme: 'day',
  transitDimmingEnabled: false,
  layerOptions: DEFAULT_LAYER_OPTIONS,
  availableThemes: [],
  expandedPanelLayer: null,
  themeWarnings: [],
  autoUpdateEnabled: false,
  activeLanguage: 'en',
  dlcWarnings: [],
  hasPartialData: false,

  setLoadingState: (state, error = null) =>
    set({ loadingState: state, loadingError: error }),

  setCityData: (data) =>
    set({
      cityData: data,
      loadingState: 'idle',
      loadingError: null,
      dlcWarnings: [],
      hasPartialData: false,
    }),

  setDlcWarnings: (warnings) => set({ dlcWarnings: warnings }),

  setHasPartialData: (value) => set({ hasPartialData: value }),

  toggleLayer: (layer) =>
    set((state) => ({
      activeLayers: {
        ...state.activeLayers,
        [layer]: !state.activeLayers[layer],
      },
    })),

  setActiveTheme: (theme) => set({ activeTheme: theme }),

  setAvailableThemes: (themes) => set({ availableThemes: themes }),

  setTransitDimmingEnabled: (enabled) =>
    set({ transitDimmingEnabled: enabled }),

  toggleTransitMode: (mode) =>
    set((state) => {
      const { visibleModes } = state.layerOptions.transit;
      const nextModes = visibleModes.includes(mode)
        ? visibleModes.filter((m) => m !== mode)
        : [...visibleModes, mode];
      return {
        layerOptions: {
          ...state.layerOptions,
          transit: { visibleModes: nextModes },
        },
      };
    }),

  toggleBuildingCategory: (category) =>
    set((state) => {
      const { visibleCategories } = state.layerOptions.buildings;
      const nextCategories = visibleCategories.includes(category)
        ? visibleCategories.filter((c) => c !== category)
        : [...visibleCategories, category];
      return {
        layerOptions: {
          ...state.layerOptions,
          buildings: {
            ...state.layerOptions.buildings,
            visibleCategories: nextCategories,
          },
        },
      };
    }),

  setBuildingColorByCategory: (enabled) =>
    set((state) => ({
      layerOptions: {
        ...state.layerOptions,
        buildings: {
          ...state.layerOptions.buildings,
          colorByCategory: enabled,
        },
      },
    })),

  setDistrictsShowNameOnMap: (enabled) =>
    set((state) => ({
      layerOptions: {
        ...state.layerOptions,
        districts: {
          ...state.layerOptions.districts,
          showNameOnMap: enabled,
        },
      },
    })),

  setDistrictsShowParkAreas: (enabled) =>
    set((state) => ({
      layerOptions: {
        ...state.layerOptions,
        districts: {
          ...state.layerOptions.districts,
          showParkAreas: enabled,
        },
      },
    })),

  setTerrainShowContourLines: (enabled) =>
    set((state) => ({
      layerOptions: {
        ...state.layerOptions,
        terrain: {
          ...state.layerOptions.terrain,
          showContourLines: enabled,
        },
      },
    })),

  setTerrainShowColorRelief: (enabled) =>
    set((state) => ({
      layerOptions: {
        ...state.layerOptions,
        terrain: {
          ...state.layerOptions.terrain,
          showColorRelief: enabled,
        },
      },
    })),

  setTerrainShowHillshade: (enabled) =>
    set((state) => ({
      layerOptions: {
        ...state.layerOptions,
        terrain: {
          ...state.layerOptions.terrain,
          showHillshade: enabled,
        },
      },
    })),

  setBasemapShowGrid: (enabled) =>
    set((state) => ({
      layerOptions: {
        ...state.layerOptions,
        basemap: {
          ...state.layerOptions.basemap,
          showGrid: enabled,
        },
      },
    })),

  setExpandedPanelLayer: (layer) => set({ expandedPanelLayer: layer }),

  setThemeWarnings: (warnings) => set({ themeWarnings: warnings }),

  setLanguage: (lang) => {
    i18n.changeLanguage(lang); // hot-swap inmediato de todos los strings (NFR16)
    localStorage.setItem('preferredLanguage', lang); // persistencia temporal (Story 7.2 usará tauri-plugin-store)
    set({ activeLanguage: lang });
  },

  syncActiveLanguage: (lang) => set({ activeLanguage: lang }),

  incrementLoadRequestId: () => {
    const next = get().loadRequestId + 1;
    set({
      loadRequestId: next,
      cityData: null,
      loadingState: 'loading', // atomic: jump directly to loading, no idle flash
      loadingError: null,
      dlcWarnings: [],
      hasPartialData: false,
    });
    return next;
  },
}));
