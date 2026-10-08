import type { Lang } from '../content/routes';
import type { PlatformId } from '../data/release';

/** Display names of the platforms (not translated). */
export const PLATFORM_NAMES: Record<PlatformId, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

const locales: Record<Lang, string> = { en: 'en-GB', es: 'es' };

/** File size as GitHub shows it (MiB), with one decimal: "4.5 MB" / "4,5 MB". */
export function formatSize(bytes: number, lang: Lang): string {
  const megabytes = new Intl.NumberFormat(locales[lang], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(bytes / 1024 / 1024);
  return `${megabytes} MB`;
}

/** Release date in the page language, in UTC: "4 October 2026". */
export function formatDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locales[lang], {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** Extension shown in "Download .exe", from the asset format. */
export function formatExtension(format: string): string {
  return format.startsWith('msi-') ? '.msi' : `.${format}`;
}
