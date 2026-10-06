import type { Lang } from './routes';

/** External links of the landing. No `import.meta`: `shots:report` reads it in Node. */
export const REPOSITORY_URL = 'https://github.com/sebas-tcotd/vellum';
export const STORE_URL =
  'https://get.microsoft.com/installer/download/9N65WG3V160T?referrer=appbadge';

/**
 * Steam Workshop item of Vellum Bridge. `null` until Sebas provides it: the
 * links then point at the Cities: Skylines Workshop and carry a visible
 * "pending" marker (EXPERIENCE.md · State Patterns · Workshop de Bridge sin URL).
 */
export const BRIDGE_WORKSHOP_URL: string | null = null;
export const WORKSHOP_FALLBACK_URL =
  'https://steamcommunity.com/app/255710/workshop/';

/** Public theme schema on GitHub, per language (Flow 5). */
export const THEME_SCHEMA_URL: Record<Lang, string> = {
  en: `${REPOSITORY_URL}/blob/main/docs/en/vellumstyle-schema.md`,
  es: `${REPOSITORY_URL}/blob/main/docs/es/vellumstyle-schema.md`,
};
