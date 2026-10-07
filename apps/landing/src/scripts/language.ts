/**
 * Language rules of the landing (EXPERIENCE.md · Information Architecture ·
 * Idioma). `decideLanguage` is pure so it can be unit-tested; the page runs it
 * inline in `<head>`, before any CSS, through {@link languageBootScript}.
 */

export type LandingLang = 'en' | 'es';

export interface LanguageInput {
  /** `location.pathname`, e.g. `/vellum/es/`. */
  pathname: string;
  search: string;
  hash: string;
  /** Site base, e.g. `/vellum/`. */
  base: string;
  origin: string;
  referrer: string;
  /** English → Spanish paths (relative to the base) of the bilingual pages. */
  pairs: [en: string, es: string][];
  /** Saved choice, or `null` when there is none. */
  stored: string | null;
  /** `false` when localStorage or sessionStorage throw. */
  storageOk: boolean;
  /** First page of this browser session. */
  firstNavigation: boolean;
  /** `navigator.language`. */
  browserLanguage: string;
}

export interface LanguageDecision {
  /** Where to `location.replace()`, or `null` to stay. */
  url: string | null;
  /** Choice to save, or `null` to leave storage alone. */
  save: LandingLang | null;
}

/**
 * Decides whether to redirect to the other language and what to save.
 *
 * @remarks
 * Self-contained on purpose (no outer references): its source is inlined in
 * the page with `Function.prototype.toString`.
 */
export function decideLanguage(input: LanguageInput): LanguageDecision {
  const stay = { url: null, save: null };
  if (input.pathname.indexOf(input.base) !== 0) return stay;
  const path = input.pathname.slice(input.base.length);
  let pair: [string, string] | null = null;
  let current: LandingLang = 'en';
  for (const candidate of input.pairs) {
    if (candidate[0] === path) {
      pair = candidate;
      current = 'en';
      break;
    }
    if (candidate[1] === path) {
      pair = candidate;
      current = 'es';
      break;
    }
  }
  if (!pair) return stay;
  // Privacy is the URL given to Partner Center: it is never redirected, not
  // even by `?lang=` (its switcher already links to the other page). A
  // manual choice is still saved.
  const fixed = pair[0] === 'privacy/';
  const target = (lang: LandingLang) =>
    input.base +
    (lang === 'es' ? pair[1] : pair[0]) +
    input.search +
    input.hash;

  // A manual choice (`?lang=`, also the legacy links) always wins and turns
  // the automatic redirect off for this load.
  const param = /(?:^\?|&)lang=([^&#]*)/.exec(input.search);
  if (param) {
    const asked = param[1].toLowerCase().split(/[-_]/)[0];
    if (asked !== 'en' && asked !== 'es') return stay;
    return {
      url: asked === current || fixed ? null : target(asked),
      save: asked,
    };
  }

  // A Spanish URL is never redirected; nor is anything without storage, after
  // the first page of the session, or arriving from this same site.
  if (fixed || current === 'es' || !input.storageOk || !input.firstNavigation)
    return stay;
  // Same site means this project, not other Pages projects of the origin.
  if (input.referrer.indexOf(input.origin + input.base) === 0) return stay;
  const preferred =
    input.stored === 'en' || input.stored === 'es'
      ? input.stored
      : input.browserLanguage.toLowerCase().indexOf('es') === 0
        ? 'es'
        : 'en';
  return preferred === 'es' ? { url: target('es'), save: null } : stay;
}

export const LANGUAGE_KEY = 'vellum-landing-language';
export const SESSION_KEY = 'vellum-landing-session';
export const THEME_KEY = 'vellum-page-theme';

/**
 * Inline `<head>` script: applies the saved page theme before the first
 * paint, marks the document as scripted, and applies the language rules.
 */
export function bootScript(base: string, pairs: [string, string][]): string {
  return `(function () {
  var root = document.documentElement;
  root.classList.add('js');
  try {
    var theme = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  } catch (error) {}
  var stored = null;
  var storageOk = true;
  var firstNavigation = false;
  try {
    firstNavigation = !sessionStorage.getItem(${JSON.stringify(SESSION_KEY)});
    sessionStorage.setItem(${JSON.stringify(SESSION_KEY)}, '1');
    stored = localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)});
  } catch (error) {
    storageOk = false;
  }
  // The bundler may wrap inner functions in __name() to keep their names.
  var __name = function (fn) { return fn; };
  var decide = ${decideLanguage.toString()};
  var decision = decide({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    base: ${JSON.stringify(base)},
    origin: location.origin,
    referrer: document.referrer,
    pairs: ${JSON.stringify(pairs)},
    stored: stored,
    storageOk: storageOk,
    firstNavigation: firstNavigation,
    browserLanguage: navigator.language || ''
  });
  if (decision.save) {
    try {
      localStorage.setItem(${JSON.stringify(LANGUAGE_KEY)}, decision.save);
    } catch (error) {}
  }
  if (decision.url) location.replace(decision.url);
})();`;
}
