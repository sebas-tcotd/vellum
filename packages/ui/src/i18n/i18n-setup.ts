import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import estático — Vite bundlea en el bundle, sin fetch en runtime (NFR14)
import en from './locales/en.json';
import es from './locales/es.json';

/**
 * Inicializa i18next con react-i18next.
 * Debe llamarse ANTES del primer render en App.tsx.
 *
 * Los JSONs de traducción son imports estáticos — Vite los bundlea offline.
 * No se realizan fetches en runtime (NFR14).
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
      escapeValue: false, // React ya escapa por defecto
    },
  });

  return initialLanguage;
}

/**
 * Detecta el idioma inicial según prioridad:
 * 1. `localStorage.preferredLanguage` — selección manual previa del usuario
 * 2. `navigator.language` — locale del OS (es-* → 'es')
 * 3. Default: 'en'
 *
 * Story 7.2 reemplazará localStorage por tauri-plugin-store.
 */
export async function detectInitialLanguage(): Promise<'en' | 'es'> {
  // Prioridad 1: preferencia guardada por el usuario
  try {
    const stored = localStorage.getItem('preferredLanguage');
    if (stored === 'en' || stored === 'es') return stored;
  } catch {
    // localStorage puede fallar en contextos restrictivos — continuar
  }

  // Prioridad 2: locale del OS via navigator.language (FR40)
  if (navigator.language.startsWith('es')) return 'es';

  // Prioridad 3: default
  return 'en';
}

// Re-exportar i18n para uso directo (ej: setLanguage en Zustand store)
export { i18next as i18n };
