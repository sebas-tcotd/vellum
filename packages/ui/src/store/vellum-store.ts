import { create } from 'zustand';

// Importar tipos desde @vellum/core cuando estén disponibles (Story 1.3)
// Por ahora: tipos placeholder para establecer el contrato de la interfaz

type LoadingState = 'idle' | 'loading' | 'error';
type LayerName = 'terrain' | 'water' | 'roads' | 'transit' | 'buildings' | 'forests' | 'districts';

interface VellumStore {
  // Ciudad cargada
  cityData: unknown | null;       // será CityData de @vellum/core (Story 1.3)
  loadingState: LoadingState;     // NUNCA isLoading: boolean
  loadingError: unknown | null;   // será VellumError (Story 1.3)

  // Capas
  activeLayers: Record<LayerName, boolean>;

  // Tema
  activeTheme: string;
  availableThemes: unknown[];     // será ThemeMetadata[] (Story 5.x)

  // Preferencias
  autoUpdateEnabled: boolean;
  activeLanguage: 'en' | 'es';

  // Acciones
  setLoadingState: (state: LoadingState, error?: unknown) => void;
  setCityData: (data: unknown) => void;
  toggleLayer: (layer: LayerName) => void;
  setActiveTheme: (theme: string) => void;
  setLanguage: (lang: 'en' | 'es') => void;
}

const DEFAULT_ACTIVE_LAYERS: Record<LayerName, boolean> = {
  terrain: true,
  water: true,
  roads: true,
  transit: true,
  buildings: true,
  forests: true,
  districts: true,
};

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

  setLanguage: (lang) => set({ activeLanguage: lang }),
  // Story 7.x: añadirá i18n.changeLanguage(lang) y tauriStore.set('preferredLanguage', lang)
}));
