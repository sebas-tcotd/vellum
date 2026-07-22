import type { VellumStyle } from '@vellum/core';
import { DEFAULT_RENDER_STYLE_PARAMS } from '../default-style';
import { isColorToken } from './color';

/**
 * Result of validating a raw `.vellumstyle` object.
 * @remarks
 * On failure, `error` names the exact field path that failed (e.g.
 * `"roads.highway.generic.fill"`) so the UI can build the AC #5 warning message.
 */
export type ValidateThemeResult =
  | { valid: true; theme: VellumStyle }
  | { valid: false; error: string };

/**
 * Walks the `template` (the canonical shape) against `value`, returning the first
 * field path whose expected color leaf is missing or not a valid `ColorToken`.
 * @internal
 */
function firstInvalidColorPath(
  template: unknown,
  value: unknown,
  path: string,
): string | null {
  if (typeof template === 'string') {
    // A string leaf in the template marks an expected ColorToken.
    return isColorToken(value) ? null : path;
  }
  if (typeof template === 'object' && template !== null) {
    if (typeof value !== 'object' || value === null) return path;
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(template)) {
      const childPath = path ? `${path}.${key}` : key;
      const result = firstInvalidColorPath(
        (template as Record<string, unknown>)[key],
        record[key],
        childPath,
      );
      if (result) return result;
    }
  }
  return null;
}

/**
 * Validates a migrated `.vellumstyle` object against the canonical `RenderStyleParams`
 * shape, checking that every color leaf is a well-formed `ColorToken`.
 * @remarks
 * Uses `DEFAULT_RENDER_STYLE_PARAMS` as the schema template, so both missing fields and
 * malformed colors are caught, and the error names the exact offending path.
 *
 * @param raw - A migrated value from `migrateTheme()`.
 * @returns `{ valid: true, theme }` or `{ valid: false, error }` where `error` is the field path.
 */
export function validateVellumStyle(raw: unknown): ValidateThemeResult {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, error: 'root' };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    return { valid: false, error: 'name' };
  }
  if (typeof obj.schemaVersion !== 'number') {
    return { valid: false, error: 'schemaVersion' };
  }
  const invalid = firstInvalidColorPath(DEFAULT_RENDER_STYLE_PARAMS, raw, '');
  if (invalid) return { valid: false, error: invalid };
  return { valid: true, theme: raw as VellumStyle };
}
