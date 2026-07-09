import type { ColorToken, HexColor, HslColor } from '@vellum/core';

const HEX_COLOR_PATTERN =
  /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const HSL_COLOR_PATTERN =
  /^hsl\(\s*-?\d+(?:\.\d+)?(?:deg)?\s*,\s*\d+(?:\.\d+)?%\s*,\s*\d+(?:\.\d+)?%\s*(?:,\s*(?:\d+(?:\.\d+)?%?|\.\d+))?\s*\)$/i;

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
