import { create } from 'zustand';
import type { CityData, VellumError, LayerName, LayerVisibility } from '@vellum/core';
import { LAYER_NAMES } from '@vellum/core';
import { i18n } from '../i18n/i18n-setup';

type LoadingState = 'idle' | 'loading' | 'error';

interface VellumStore {
  // Ciudad cargada
  cityData: CityData | null;
  loadingState: LoadingState; // NUNCA isLoading: boolean
  loadingError: VellumError | null;

  // Capas
  activeLayers: LayerVisibility;

  // Tema
  activeTheme: string;
  availableThemes: unknown[]; // será ThemeMetadata[] (Story 5.x)

  // Preferencias
  autoUpdateEnabled: boolean;
  activeLanguage: 'en' | 'es';

  // Acciones
  setLoadingState: (state: LoadingState, error?: VellumError | null) => void;
  setCityData: (data: CityData) => void;
  toggleLayer: (layer: LayerName) => void;
  setActiveTheme: (theme: string) => void;
  setLanguage: (lang: 'en' | 'es') => void;
}

const DEFAULT_ACTIVE_LAYERS = Object.fromEntries(
  LAYER_NAMES.map((name: LayerName) => [name, true] as const)
) as LayerVisibility;

/**
 * Store global de la aplicación. Acceder siempre mediante este hook desde componentes React.
 *
 * Estado de UI (capas activas, tema, idioma) persiste en `tauri-plugin-store`.
 * `CityData` es inmutable una vez cargado — usar `setCityData` para reemplazarlo por completo.
 */
export const useVellumStore = create<VellumStore>((set) => ({
  cityData: null,
  loadingState: 'idle',
  loadingError: null,
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
      activeLayers: { ...state.activeLayers, [layer]: !state.activeLayers[layer] },
    })),

  setActiveTheme: (theme) => set({ activeTheme: theme }),

  setLanguage: (lang) => {
    i18n.changeLanguage(lang); // hot-swap inmediato de todos los strings (NFR16)
    localStorage.setItem('preferredLanguage', lang); // persistencia temporal (Story 7.2 usará tauri-plugin-store)
    set({ activeLanguage: lang });
  },
}));
