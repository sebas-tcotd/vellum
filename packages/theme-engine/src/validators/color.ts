import type { ColorToken, HexColor, HslColor } from '@vellum/core';

/**
 * Canonical `HexColor` grammar (`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`).
 * @remarks
 * Exported so `buildVellumStyleSchema()` can derive the published JSON Schema's color
 * `pattern` from this very literal — the grammar must have a single origin, never a copy.
 */
export const HEX_COLOR_PATTERN =
  /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
/**
 * Canonical `HslColor` grammar (CSS `hsl(...)` function string).
 * @remarks
 * Exported for the same single-origin reason as {@link HEX_COLOR_PATTERN}. Note the `i`
 * flag: JSON Schema `pattern` has no flags, so the schema builder case-folds the literal
 * letters instead of dropping the case-insensitivity.
 */
export const HSL_COLOR_PATTERN =
  /^hsl\(\s*-?\d+(?:\.\d+)?(?:deg)?\s*[,\s]\s*\d+(?:\.\d+)?%\s*[,\s]\s*\d+(?:\.\d+)?%(?:\s*[,\s/]\s*(?:\d+(?:\.\d+)?%?|\.\d+))?\s*\)$/i;

/** Type predicate validating a value is a well-formed `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` hex color string. */
export function isHexColor(value: unknown): value is HexColor {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

/** Type predicate validating a value is a well-formed CSS `hsl(...)` color function string. */
export function isHslColor(value: unknown): value is HslColor {
  return typeof value === 'string' && HSL_COLOR_PATTERN.test(value);
}

/** Type predicate validating a value is a well-formed `ColorToken` (hex or `hsl()`). */
export function isColorToken(value: unknown): value is ColorToken {
  return isHexColor(value) || isHslColor(value);
}
