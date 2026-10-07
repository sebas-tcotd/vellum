/** Languages of the landing: English at the root, Spanish under `/es/`. */
export type Lang = 'en' | 'es';

export const LANGS: readonly Lang[] = ['en', 'es'];

/** Every page of the v1.0 site map (EXPERIENCE.md · Information Architecture). */
export type PageId =
  | 'home'
  | 'download'
  | 'guide'
  | 'changelog'
  | 'manifesto'
  | 'privacy';

/** Path of each page in each language, relative to the site base. */
export const PAGE_PATHS: Record<PageId, Record<Lang, string>> = {
  home: { en: '', es: 'es/' },
  download: { en: 'download/', es: 'es/descargar/' },
  guide: { en: 'guide/', es: 'es/guia/' },
  changelog: { en: 'changelog/', es: 'es/novedades/' },
  manifesto: { en: 'manifesto/', es: 'es/manifiesto/' },
  privacy: { en: 'privacy/', es: 'es/privacidad/' },
};

/**
 * Pages built with the v1.0 design in both languages. The nav and the footer
 * only link to these; the rest arrive in later steps (deferred-work.md).
 */
export const PUBLISHED_PAGES: ReadonlySet<PageId> = new Set<PageId>([
  'home',
  'download',
  'guide',
]);

/** Pages linked from the nav bar, in order, when they are published. */
export const NAV_PAGES: readonly PageId[] = ['guide', 'changelog', 'manifesto'];

const base = import.meta.env.BASE_URL;

/** Absolute path (under the base) of a page in one language. */
export function pageHref(page: PageId, lang: Lang): string {
  return `${base}${PAGE_PATHS[page][lang]}`;
}

/**
 * Where "Download" points: the download page once it exists, the home band
 * `#download` until then.
 */
export function downloadHref(lang: Lang): string {
  return PUBLISHED_PAGES.has('download')
    ? pageHref('download', lang)
    : `${pageHref('home', lang)}#download`;
}

/**
 * The privacy page of a language. Until `/es/privacidad/` exists, Spanish
 * points at the static English URL in Spanish (`?lang=es`), as today.
 */
export function privacyHref(lang: Lang): string {
  if (lang === 'en' || PUBLISHED_PAGES.has('privacy'))
    return pageHref('privacy', lang);
  return `${pageHref('privacy', 'en')}?lang=es`;
}

/**
 * English path → Spanish path of every page that exists in both languages,
 * for the language redirect and the switcher. Relative to the base.
 */
export function publishedPairs(): [en: string, es: string][] {
  return [...PUBLISHED_PAGES].map((page) => [
    PAGE_PATHS[page].en,
    PAGE_PATHS[page].es,
  ]);
}
