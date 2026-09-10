import type { VellumStyle } from '@vellum/core';
import { DEFAULT_RENDER_STYLE_PARAMS } from '../default-style';
import { isColorToken } from './color';

/**
 * Which contract rule a failed `.vellumstyle` field broke.
 * @remarks
 * Machine-readable companion to `error` (the field path), for tooling that wants to react
 * to the *kind* of failure without parsing prose:
 * - `'required'` — the field is absent (or, for `name`, present but an empty string: un
 *   nombre vacío no identifica al tema, así que cuenta como ausente).
 * - `'type'` — the field is present but of the wrong shape (non-object where a group is
 *   expected, an array where a group is expected, non-string `name`, non-number
 *   `schemaVersion`, non-object root).
 * - `'color-token'` — the field is present but is not a well-formed `ColorToken`.
 */
export type ThemeValidationRule = 'type' | 'required' | 'color-token';

/**
 * Result of validating a raw `.vellumstyle` object.
 * @remarks
 * On failure, `error` names the exact field path that failed (e.g.
 * `"roads.highway.generic.fill"`) so the UI can build the AC #5 warning message, and
 * `rule` names the contract rule it broke. `error` keeps its historical format and
 * semantics — `rule` is purely additive.
 */
export type ValidateThemeResult =
  | { valid: true; theme: VellumStyle }
  | { valid: false; error: string; rule: ThemeValidationRule };

/** A field path paired with the rule it broke. */
interface InvalidField {
  path: string;
  rule: ThemeValidationRule;
}

/**
 * Walks the `template` (the canonical shape) against `value`, returning the first
 * field path that breaks the contract — un grupo ausente o con la forma equivocada, o una
 * hoja de color malformada.
 * @remarks Module-private helper, not exported — `@internal` doesn't apply since it
 * never crosses a package boundary.
 * @param template - The canonical shape to walk (a `RenderStyleParams`-shaped object
 * whose string leaves mark expected `ColorToken` fields).
 * @param value - The candidate value being validated against `template`.
 * @param path - The dotted field path accumulated so far (start with `''`).
 * @returns The first invalid field (path + broken rule), or `null` if every leaf validates.
 */
function firstInvalidField(
  template: unknown,
  value: unknown,
  path: string,
): InvalidField | null {
  if (typeof template === 'string') {
    // A string leaf in the template marks an expected ColorToken.
    if (isColorToken(value)) return null;
    return { path, rule: value === undefined ? 'required' : 'color-token' };
  }
  if (typeof template === 'object' && template !== null) {
    // `typeof [] === 'object'`: sin este guard un arreglo entraría al walk y el error
    // saldría como la primera hoja ausente del grupo (`terrain.base`, `required`) en vez
    // de nombrar el grupo con el tipo equivocado, que es lo que reporta el JSON Schema.
    // Se exceptúa el caso en que el template mismo es un arreglo (`grid.dasharray`): ahí
    // un arreglo es exactamente la forma esperada.
    const arrayExpected = Array.isArray(template);
    if (
      typeof value !== 'object' ||
      value === null ||
      (Array.isArray(value) && !arrayExpected)
    ) {
      return { path, rule: value === undefined ? 'required' : 'type' };
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(template)) {
      const childPath = path ? `${path}.${key}` : key;
      const result = firstInvalidField(
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
 * @returns `{ valid: true, theme }` or `{ valid: false, error, rule }` where `error` is the
 * field path and `rule` the contract rule it broke.
 */
export function validateVellumStyle(raw: unknown): ValidateThemeResult {
  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, error: 'root', rule: 'type' };
  }
  const obj = raw as Record<string, unknown>;
  // El `rule` distingue ausente de presente-con-tipo-malo; el `error` no cambia de formato
  // ni de valor, porque el loader construye su advertencia a partir de él.
  if (obj.name === undefined) {
    return { valid: false, error: 'name', rule: 'required' };
  }
  if (typeof obj.name !== 'string') {
    return { valid: false, error: 'name', rule: 'type' };
  }
  // Un `name` vacío está presente pero no identifica al tema: cuenta como ausente.
  if (obj.name.length === 0) {
    return { valid: false, error: 'name', rule: 'required' };
  }
  if (obj.schemaVersion === undefined) {
    return { valid: false, error: 'schemaVersion', rule: 'required' };
  }
  if (typeof obj.schemaVersion !== 'number') {
    return { valid: false, error: 'schemaVersion', rule: 'type' };
  }
  const invalid = firstInvalidField(DEFAULT_RENDER_STYLE_PARAMS, raw, '');
  if (invalid) return { valid: false, error: invalid.path, rule: invalid.rule };
  return { valid: true, theme: raw as VellumStyle };
}
