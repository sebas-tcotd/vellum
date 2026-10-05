/**
 * Entry point for rendering real app components outside the app: the landing
 * renders them at build time (SSR without hydration) inside a Declarative
 * Shadow DOM styled by `embed.css`.
 *
 * @remarks
 * Kept apart from `index.ts` so a consumer does not pull in `App`, MapLibre or
 * the store. Only components that depend on props and `react-i18next` alone
 * belong here.
 */
import { createElement, type ReactNode } from 'react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from './i18n/locales/en.json';
import es from './i18n/locales/es.json';

export { AdvancedOptionsPanel } from './components/panels/AdvancedOptionsPanel';
export type { AdvancedOptionsPanelProps } from './components/panels/AdvancedOptionsPanel';
export { PlaceCard } from './components/place-card/PlaceCard';
export type {
  PlaceCardAction,
  PlaceCardData,
  PlaceCardFact,
  PlaceCardProps,
  PlaceCardRow,
  PlaceCardSection,
  PlaceCardSegment,
} from './components/place-card/PlaceCard';

/** Languages the app ships translations for. */
export type EmbedLanguage = 'en' | 'es';

const instances = new Map<EmbedLanguage, i18n>();

/**
 * Returns the `i18next` instance for one language, created on first use with
 * the app's own locales and initialised synchronously.
 *
 * @remarks
 * One isolated instance per language (`i18next.createInstance()`), never the
 * global one: a build renders several languages in the same process.
 */
export function getEmbedI18n(language: EmbedLanguage): i18n {
  let instance = instances.get(language);
  if (!instance) {
    instance = i18next.createInstance();
    void instance.init({
      lng: language,
      fallbackLng: 'en',
      defaultNS: 'translation',
      ns: ['translation'],
      resources: {
        en: { translation: en },
        es: { translation: es },
      },
      initAsync: false,
      interpolation: { escapeValue: false },
    });
    instances.set(language, instance);
  }
  return instance;
}

/** Props for {@link EmbedLocaleProvider}. */
export interface EmbedLocaleProviderProps {
  /** Language the embedded components render in (the page's language). */
  language: EmbedLanguage;
  children?: ReactNode;
}

/**
 * Gives embedded components the translations `useTranslation()` expects, in
 * the page's language.
 */
export function EmbedLocaleProvider({
  language,
  children,
}: EmbedLocaleProviderProps) {
  return createElement(
    I18nextProvider,
    { i18n: getEmbedI18n(language) },
    children,
  );
}
