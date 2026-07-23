import type { VellumStyle } from '@vellum/core';

/**
 * Normalizes a raw parsed `.vellumstyle` object to the current `VellumStyle` schema.
 * @remarks
 * **CRITICAL RULE:** This is the ONLY place a raw `.vellumstyle` value may be cast to
 * `VellumStyle` — never cast elsewhere. It does not validate field *contents* (that is
 * `validateVellumStyle`'s job); it only guarantees `schemaVersion` is present and applies
 * any version-to-version transforms. Only v1 exists today, so v1 is a pass-through; future
 * versions add a `case N` branch here.
 *
 * @param raw - The result of `JSON.parse()` on a `.vellumstyle` file.
 * @returns The migrated value, shaped as `VellumStyle` (contents still unvalidated).
 * @example
 * ```ts
 * migrateTheme({ name: 'Day', water: '#6db8b7' });
 * // → { schemaVersion: 1, name: 'Day', water: '#6db8b7' }
 * ```
 */
export function migrateTheme(raw: unknown): VellumStyle {
  // Arrays are `typeof 'object'` too — excluded explicitly so a malformed array
  // `.vellumstyle` is treated as empty (like `null`), not spread as numeric-keyed props.
  const obj: Record<string, unknown> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const schemaVersion =
    typeof obj.schemaVersion === 'number' && Number.isFinite(obj.schemaVersion)
      ? obj.schemaVersion
      : 1;
  const withVersion = { ...obj, schemaVersion };
  switch (schemaVersion) {
    case 1:
    default:
      return withVersion as VellumStyle;
  }
}
