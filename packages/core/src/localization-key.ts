/**
 * A name CS1 never resolved: the localization key it leaves behind when the
 * player did not name something — `TRANSPORT_LINE_PATTERN[Evacuation Bus]:0`,
 * `BUILDING_TITLE[Soccer Large Stadium 02 Sub Building 6]:0`. The bracketed
 * part is the asset it came from; the trailing `:n` is a pattern variant.
 */
export const LOCALIZATION_KEY = /^[A-Z][A-Z0-9_]*\[(.+)\](?::\d+)?$/;

/** Whether a name is an unresolved CS1 localization key rather than a real name. */
export function isLocalizationKey(name: string): boolean {
  return LOCALIZATION_KEY.test(name.trim());
}
