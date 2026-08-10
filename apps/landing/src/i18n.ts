import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../i18n/en.json';
import es from '../i18n/es.json';

const landingResources = {
  en: { translation: en },
  es: { translation: es },
} as const satisfies Record<string, { translation: typeof en }>;

export type LandingLanguage = keyof typeof landingResources;

export const landingLanguages = Object.keys(
  landingResources,
) as LandingLanguage[];

const languageStorageKey = 'vellum-landing-language';
export const fallbackLanguage: LandingLanguage = 'en';

export function getSupportedLanguage(
  language: string | null | undefined,
): LandingLanguage | undefined {
  const baseLanguage = language?.toLowerCase().split(/[-_]/)[0];

  if (baseLanguage && baseLanguage in landingResources) {
    return baseLanguage as LandingLanguage;
  }

  return undefined;
}

function getInitialLanguage(): LandingLanguage {
  if (typeof window === 'undefined') return fallbackLanguage;

  const queryLanguage = getSupportedLanguage(
    new URLSearchParams(window.location.search).get('lang'),
  );
  if (queryLanguage) return queryLanguage;

  try {
    const storedLanguage = getSupportedLanguage(
      window.localStorage.getItem(languageStorageKey),
    );
    if (storedLanguage) return storedLanguage;
  } catch {
    // Continue with browser detection when storage is unavailable.
  }

  return getSupportedLanguage(window.navigator.language) ?? fallbackLanguage;
}

export const i18n = i18next.createInstance();

export const i18nReady = i18n.use(initReactI18next).init({
  lng: getInitialLanguage(),
  fallbackLng: fallbackLanguage,
  defaultNS: 'translation',
  ns: ['translation'],
  resources: landingResources,
  interpolation: {
    escapeValue: false,
  },
});

export function persistLanguage(language: LandingLanguage) {
  try {
    window.localStorage.setItem(languageStorageKey, language);
  } catch {
    // Continue without persistence when storage is unavailable.
  }
}
