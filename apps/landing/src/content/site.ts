import type { Lang, PageId } from './routes';

/** Text of the shared page chrome: skip link, nav, footer and consent. */
export interface SiteStrings {
  skipLink: string;
  homeLabel: string;
  navLabel: string;
  download: string;
  menu: string;
  pages: Record<PageId, string>;
  footer: {
    label: string;
    privacy: string;
    analytics: string;
    github: string;
    disclaimer: string;
    languageLabel: string;
    themeLegend: string;
    themes: { light: string; dark: string; auto: string };
  };
  /** Names of the languages, each written in its own language. */
  languageNames: Record<Lang, string>;
  newTab: string;
  consent: {
    region: string;
    body: string;
    policy: string;
    accept: string;
    reject: string;
    close: string;
  };
}

export const SITE: Record<Lang, SiteStrings> = {
  en: {
    skipLink: 'Skip to content',
    homeLabel: 'Vellum home',
    navLabel: 'Main',
    download: 'Download',
    menu: 'Menu',
    pages: {
      home: 'Home',
      download: 'Download',
      guide: 'Guide',
      changelog: "What's new",
      manifesto: 'Manifesto',
      privacy: 'Privacy',
    },
    footer: {
      label: 'Footer',
      privacy: 'Privacy',
      analytics: 'Analytics preferences',
      github: 'GitHub',
      disclaimer:
        'An independent project, not affiliated with Colossal Order or Paradox Interactive.',
      languageLabel: 'Language',
      themeLegend: 'Theme',
      themes: { light: 'Light', dark: 'Dark', auto: 'Auto' },
    },
    languageNames: { en: 'English', es: 'Español' },
    newTab: '(opens in a new tab)',
    consent: {
      region: 'Analytics preferences',
      body: 'May I use Google Analytics to understand visits to this site? It stays off until you accept, and rejecting does not limit anything.',
      policy: 'Read the privacy policy',
      accept: 'Accept analytics',
      reject: 'Reject analytics',
      close: 'Keep current choice',
    },
  },
  es: {
    skipLink: 'Saltar al contenido',
    homeLabel: 'Inicio de Vellum',
    navLabel: 'Principal',
    download: 'Descargar',
    menu: 'Menú',
    pages: {
      home: 'Inicio',
      download: 'Descargar',
      guide: 'Guía',
      changelog: 'Novedades',
      manifesto: 'Manifiesto',
      privacy: 'Privacidad',
    },
    footer: {
      label: 'Pie de página',
      privacy: 'Privacidad',
      analytics: 'Preferencias de analítica',
      github: 'GitHub',
      disclaimer:
        'Proyecto independiente, sin afiliación con Colossal Order ni Paradox Interactive.',
      languageLabel: 'Idioma',
      themeLegend: 'Tema',
      themes: { light: 'Claro', dark: 'Oscuro', auto: 'Auto' },
    },
    languageNames: { en: 'English', es: 'Español' },
    newTab: '(se abre en una pestaña nueva)',
    consent: {
      region: 'Preferencias de analítica',
      body: '¿Puedo usar Google Analytics para entender las visitas a este sitio? Queda desactivada hasta que aceptes, y rechazar no limita nada.',
      policy: 'Leer la política de privacidad',
      accept: 'Aceptar analítica',
      reject: 'Rechazar analítica',
      close: 'Mantener elección actual',
    },
  },
};
