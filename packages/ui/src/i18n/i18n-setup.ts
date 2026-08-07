import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { loadPersistedPreferences } from '../store/preferences-store';

// Import estático — Vite bundlea en el bundle, sin fetch en runtime (NFR14)
import en from './locales/en.json';
import es from './locales/es.json';

/**
 * Initializes the `i18next` instance with `react-i18next` bindings.
 * @remarks
 * **CRITICAL ARCHITECTURAL RULE (NFR14):** Translation JSONs are statically imported.
 * Vite bundles them directly into the application payload. No runtime network fetches
 * are permitted, ensuring the application remains fully functional offline within the Tauri shell.
 * **CRITICAL INVARIANT:** This initialization function MUST be invoked and awaited
 * BEFORE the initial React render phase (e.g., using a Suspense boundary or awaiting
 * it prior to mounting the main component tree in `App.tsx`).
 *
 * @returns A promise resolving to the language code that was successfully initialized.
 */
export async function initI18n(): Promise<'en' | 'es'> {
  const initialLanguage = await detectInitialLanguage();

  await i18next.use(initReactI18next).init({
    lng: initialLanguage,
    fallbackLng: 'en',
    defaultNS: 'translation',
    ns: ['translation'],
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    interpolation: {
      escapeValue: false, // React already inherently escapes XSS out of the box
    },
  });

  return initialLanguage;
}

/**
 * Determines the initial application language based on a strict priority hierarchy.
 *
 * @remarks
 * **Resolution Priority:**
 * 1. Previously stored user preference.
 * 2. Operating system locale fallback (`navigator.language`) to satisfy FR40.
 * 3. Default fallback to English (`'en'`).
 *
 * @returns A promise resolving to the optimally detected language code (`'en'` or `'es'`).
 */
export async function detectInitialLanguage(): Promise<'en' | 'es'> {
  // Prioridad 1: preferencia guardada por el usuario
  const { preferredLanguage } = await loadPersistedPreferences();
  if (preferredLanguage) return preferredLanguage;

  // Prioridad 2: locale del OS via navigator.language (FR40)
  if (navigator.language.startsWith('es')) return 'es';

  // Prioridad 3: default
  return 'en';
}

/**
 * The configured `i18next` singleton instance.
 * @remarks
 * **Usage Rule:** Exported explicitly for imperative usage OUTSIDE of React components
 * (e.g., within the global Zustand store to trigger state updates alongside language changes).
 * Inside React components, ALWAYS use the `useTranslation()` hook instead.
 */
export { i18next as i18n };
