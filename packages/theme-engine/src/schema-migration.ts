import type { VellumStyle } from '@vellum/core';
import { DEFAULT_RENDER_STYLE_PARAMS } from './default-style';

/**
 * The `.vellumstyle` schema version this build of Vellum writes and understands natively.
 * @remarks
 * Bumping it is a contract change: the docs title (`vellumstyle-schema.md`, "(vN)") and the
 * versioned fixtures in `packages/theme-engine/fixtures` are checked against this constant.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Normalizes a raw parsed `.vellumstyle` object to the current `VellumStyle` schema.
 * @remarks
 * **CRITICAL RULE:** This is the ONLY place a raw `.vellumstyle` value may be cast to
 * `VellumStyle` — never cast elsewhere. It does not validate field *contents* (that is
 * `validateVellumStyle`'s job). The input is never mutated.
 *
 * Version policy (explicit branches):
 * - **Legacy** — `schemaVersion` absent or not a finite number: treated as v1 (the only
 *   shape that ever shipped without the field) and stamped `schemaVersion: 1`.
 * - **`<= CURRENT_SCHEMA_VERSION`** (including `0` or non-integers like `1.5`, which
 *   loaded before this policy was written down): every top-level group the file omits is
 *   filled with its default. Since v1 fields have only ever been *added* as optional
 *   top-level groups, a shallow merge is enough; unknown fields (extension points and
 *   removed fields such as `roads.*.industrial`) are preserved as-is.
 * - **`> CURRENT_SCHEMA_VERSION`** — a file from a newer Vellum: loaded best-effort with
 *   the same fill-in. Any real gap is still caught by leaf validation.
 *
 * @param raw - The result of `JSON.parse()` on a `.vellumstyle` file.
 * @returns The migrated value, shaped as `VellumStyle` (contents still unvalidated).
 * @example
 * ```ts
 * migrateTheme({ name: 'Day', water: '#6db8b7' });
 * // → { schemaVersion: 1, name: 'Day', water: '#6db8b7', ...other default groups }
 * ```
 */
export function migrateTheme(raw: unknown): VellumStyle {
  // Arrays are `typeof 'object'` too — excluded explicitly so a malformed array
  // `.vellumstyle` is treated as empty (like `null`), not spread as numeric-keyed props.
  const obj: Record<string, unknown> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const declared =
    typeof obj.schemaVersion === 'number' && Number.isFinite(obj.schemaVersion)
      ? obj.schemaVersion
      : null;

  if (declared === null) {
    // Legacy: pre-`schemaVersion` files are v1.
    return fillOmittedGroups({ ...obj, schemaVersion: 1 });
  }
  if (declared <= CURRENT_SCHEMA_VERSION) {
    // Current (or older-but-still-v1-shaped) file: fill in omitted groups.
    return fillOmittedGroups({ ...obj, schemaVersion: declared });
  }
  // Future version: best-effort, same fill-in; leaf validation catches real gaps.
  return fillOmittedGroups({ ...obj, schemaVersion: declared });
}

/**
 * Shallow-merges the default groups under `obj` into a new top-level object.
 * @remarks The copy is shallow: nested groups are shared references with the caller's
 * input and with `DEFAULT_RENDER_STYLE_PARAMS`, so callers must not mutate the result.
 */
function fillOmittedGroups(obj: Record<string, unknown>): VellumStyle {
  return { ...DEFAULT_RENDER_STYLE_PARAMS, ...obj } as VellumStyle;
}
