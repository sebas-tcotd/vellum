import type {
  CityData,
  LayerName,
  LayerVisibility,
  VellumError,
} from '@vellum/core';
import { LAYER_NAMES } from '@vellum/core';
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

  /** Dictionary controlling the visibility of individual map layers in the renderer. */
  activeLayers: LayerVisibility;

  /** Identifier of the currently active visual theme (e.g., 'day', 'night'). */
  activeTheme: string;

  /** Collection of all available themes loaded by the system.
   * @remarks
   * Currently typed as `unknown[]`. The concrete `ThemeMetadata` type will be implemented in Story 5.x. */
  availableThemes: unknown[]; // será ThemeMetadata[] (Story 5.x)

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

  /** Toggles the visibility state of a specific map layer. */
  toggleLayer: (layer: LayerName) => void;

  /** Applies a new visual theme.  */
  setActiveTheme: (theme: string) => void;

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
   * Resets the store for a new file load operation.
   * Increments `loadRequestId` and clears previous city data and error state.
   */
  resetForNewFile: () => void;

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
  availableThemes: [],
  autoUpdateEnabled: false,
  activeLanguage: 'en',

  setLoadingState: (state, error = null) =>
    set({ loadingState: state, loadingError: error }),

  setCityData: (data) =>
    set({ cityData: data, loadingState: 'idle', loadingError: null }),

  toggleLayer: (layer) =>
    set((state) => ({
      activeLayers: {
        ...state.activeLayers,
        [layer]: !state.activeLayers[layer],
      },
    })),

  setActiveTheme: (theme) => set({ activeTheme: theme }),

  setLanguage: (lang) => {
    i18n.changeLanguage(lang); // hot-swap inmediato de todos los strings (NFR16)
    localStorage.setItem('preferredLanguage', lang); // persistencia temporal (Story 7.2 usará tauri-plugin-store)
    set({ activeLanguage: lang });
  },

  syncActiveLanguage: (lang) => set({ activeLanguage: lang }),

  resetForNewFile: () => {
    set({
      cityData: null,
      loadingState: 'idle',
      loadingError: null,
      loadRequestId: get().loadRequestId + 1,
    });
  },

  incrementLoadRequestId: () => {
    const next = get().loadRequestId + 1;
    set({
      loadRequestId: next,
      cityData: null,
      loadingState: 'idle',
      loadingError: null,
    });
    return next;
  },
}));
