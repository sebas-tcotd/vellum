import type { Lang } from './routes';

/** External links of the landing. No `import.meta`: `shots:report` reads it in Node. */
export const REPOSITORY_URL = 'https://github.com/sebas-tcotd/vellum';
export const STORE_URL =
  'https://get.microsoft.com/installer/download/9N65WG3V160T?referrer=appbadge';

/**
 * Steam Workshop item of Vellum Bridge. With `null` the links point at the
 * Cities: Skylines Workshop and carry a visible "pending" marker
 * (EXPERIENCE.md · State Patterns · Workshop de Bridge sin URL). The item stays
 * hidden until launch day, so this page must not ship before it goes public.
 */
export const BRIDGE_WORKSHOP_URL: string | null =
  'https://steamcommunity.com/sharedfiles/filedetails/?id=3815903587';
export const WORKSHOP_FALLBACK_URL =
  'https://steamcommunity.com/app/255710/workshop/';

/** Public theme schema on GitHub, per language (Flow 5). */
export const THEME_SCHEMA_URL: Record<Lang, string> = {
  en: `${REPOSITORY_URL}/blob/main/docs/en/vellumstyle-schema.md`,
  es: `${REPOSITORY_URL}/blob/main/docs/es/vellumstyle-schema.md`,
};
