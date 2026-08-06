/**
 * Minimal colour parsing and mixing for values that must be resolved to a
 * literal, without a browser.
 *
 * @remarks
 * MapLibre interpolates ramp stops on the GPU, while callers use these helpers
 * for colours that must be resolved to literals first: the static exporter and
 * contrast-adjusted interactive isolines. Both run without handing arbitrary
 * CSS strings to a browser parser.
 *
 * Only the two forms `ColorToken` admits are parsed — hex and `hsl()`. Anything
 * else is deliberately *not* guessed at; the caller falls back instead of
 * emitting a colour the theme never specified.
 */

/** Straight RGB components in `[0, 255]`. */
interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Parsed colour components plus source alpha metadata. */
interface ParsedColor extends Rgb {
  readonly alpha: number;
  readonly hasAlpha: boolean;
}

// Must accept everything `theme-engine`'s `isColorToken` accepts, or a theme
// that validates cleanly still fails to mix and silently freezes on its start
// colour: `#rgba`/`#rrggbbaa` hex, and `hsl()` with an optional `deg` suffix,
// space or comma separators, and an optional alpha after `,` or `/`.
const HEX_PATTERN = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA_PATTERN =
  /^rgba\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?|\.\d+)\s*\)$/i;
const HSL_PATTERN =
  /^hsl\(\s*(-?\d+(?:\.\d+)?)(?:deg)?\s*[,\s]\s*(\d+(?:\.\d+)?)%\s*[,\s]\s*(\d+(?:\.\d+)?)%(?:\s*[,\s/]\s*(\d+(?:\.\d+)?%?|\.\d+))?\s*\)$/i;

/**
 * Parses a `ColorToken` into RGB components.
 *
 * @param token - A `#rgb`, `#rrggbb`, or `hsl(h, s%, l%)` string.
 * @returns The parsed components, or `null` when the form is unrecognised.
 */
function parseColorToken(token: string): ParsedColor | null {
  const hex = HEX_PATTERN.exec(token.trim());
  if (hex) {
    const digits = hex[1]!;
    const expanded =
      digits.length <= 4
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits;
    const full = expanded.slice(0, 6);
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
      alpha:
        expanded.length === 8
          ? Number.parseInt(expanded.slice(6, 8), 16) / 255
          : 1,
      hasAlpha: expanded.length === 8,
    };
  }

  const rgba = RGBA_PATTERN.exec(token.trim());
  if (rgba) {
    return {
      r: clampChannel(Number.parseFloat(rgba[1]!)),
      g: clampChannel(Number.parseFloat(rgba[2]!)),
      b: clampChannel(Number.parseFloat(rgba[3]!)),
      alpha: parseAlpha(rgba[4]),
      hasAlpha: true,
    };
  }

  const hsl = HSL_PATTERN.exec(token.trim());
  if (hsl) {
    const rgb = hslToRgb(
      Number.parseFloat(hsl[1]!),
      clampUnit(Number.parseFloat(hsl[2]!) / 100),
      clampUnit(Number.parseFloat(hsl[3]!) / 100),
    );
    return {
      ...rgb,
      alpha: parseAlpha(hsl[4]),
      hasAlpha: hsl[4] !== undefined,
    };
  }
  return null;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function parseAlpha(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number.parseFloat(value);
  const normalized = value.endsWith('%') ? parsed / 100 : parsed;
  return Math.min(1, Math.max(0, normalized));
}

/** CSS Color 4 §7.1 `hsl()` → sRGB. */
function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const h = ((hue % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  const [r, g, b] = rgbSector(h, chroma, secondary);
  return {
    r: Math.round((r + match) * 255),
    g: Math.round((g + match) * 255),
    b: Math.round((b + match) * 255),
  };
}

function rgbSector(
  hue: number,
  chroma: number,
  secondary: number,
): [number, number, number] {
  if (hue < 60) return [chroma, secondary, 0];
  if (hue < 120) return [secondary, chroma, 0];
  if (hue < 180) return [0, chroma, secondary];
  if (hue < 240) return [0, secondary, chroma];
  if (hue < 300) return [secondary, 0, chroma];
  return [chroma, 0, secondary];
}

function toHex(value: number): string {
  return Math.min(255, Math.max(0, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
}

function mixRgb(from: Rgb, to: Rgb, ratio: number): Rgb {
  return {
    r: Math.round(from.r + (to.r - from.r) * ratio),
    g: Math.round(from.g + (to.g - from.g) * ratio),
    b: Math.round(from.b + (to.b - from.b) * ratio),
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = [r, g, b].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function serializeAdjustedColor(color: Rgb, source: ParsedColor): string {
  if (source.hasAlpha) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${source.alpha})`;
  }
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function contrastTarget(
  source: Rgb,
  directionHint: Rgb,
  minimumRatio: number,
): Rgb {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  const preferred =
    relativeLuminance(directionHint) < relativeLuminance(source)
      ? black
      : white;
  if (contrastRatio(source, preferred) >= minimumRatio) return preferred;
  return preferred === black ? white : black;
}

/**
 * Adjusts a colour by the smallest discrete sRGB step that reaches a contrast ratio.
 *
 * @remarks
 * `directionHint` selects darkening or lightening without coupling the renderer to a
 * theme name. If that direction cannot reach the requested ratio, the opposite endpoint
 * is used. Requests are bounded to the valid contrast range `[1, 21]`; an unattainable
 * ratio returns the strongest endpoint. Alpha from `color` is preserved but excluded
 * from the contrast calculation.
 *
 * @param color - Colour to adjust and use as the contrast background.
 * @param directionHint - Theme token indicating whether the result should be darker or lighter.
 * @param minimumRatio - Required WCAG relative-luminance ratio.
 * @returns An adjusted colour literal, or `color` when either token is unparseable.
 */
export function adjustColorForContrast(
  color: string,
  directionHint: string,
  minimumRatio: number,
): string {
  if (!Number.isFinite(minimumRatio)) return color;
  const requiredRatio = Math.min(21, Math.max(1, minimumRatio));
  if (requiredRatio === 1) return color;
  const source = parseColorToken(color);
  const hint = parseColorToken(directionHint);
  if (!source || !hint) return color;
  const target = contrastTarget(source, hint, requiredRatio);
  for (let step = 1; step <= 255; step += 1) {
    const candidate = mixRgb(source, target, step / 255);
    if (contrastRatio(source, candidate) >= requiredRatio) {
      return serializeAdjustedColor(candidate, source);
    }
  }
  return serializeAdjustedColor(target, source);
}

/**
 * Mixes two colour tokens in sRGB while preserving or interpolating their alpha.
 *
 * @param from - Colour at `t = 0`.
 * @param to - Colour at `t = 1`.
 * @param t - Position in `[0, 1]`; values outside are clamped.
 * @returns A colour literal, or `from` when either token is unparseable.
 */
export function mixColorTokensPreservingAlpha(
  from: string,
  to: string,
  t: number,
): string {
  const start = parseColorToken(from);
  const end = parseColorToken(to);
  if (!start || !end) return from;
  const ratio = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const mixed = mixRgb(start, end, ratio);
  return serializeAdjustedColor(mixed, {
    ...mixed,
    alpha: start.alpha + (end.alpha - start.alpha) * ratio,
    hasAlpha: start.hasAlpha || end.hasAlpha,
  });
}

/**
 * Mixes two colour tokens in sRGB and returns a `#rrggbb` string.
 *
 * @remarks
 * sRGB, not a perceptual space, because that is exactly what MapLibre's
 * `interpolate` does — matching it is the point. A prettier gradient here
 * would mean the export and the map disagree.
 *
 * @param from - Colour at `t = 0`.
 * @param to - Colour at `t = 1`.
 * @param t - Position in `[0, 1]`; values outside are clamped.
 * @returns The mixed colour, or `from` when either token is unparseable.
 */
export function mixColorTokens(from: string, to: string, t: number): string {
  const start = parseColorToken(from);
  const end = parseColorToken(to);
  if (!start || !end) return from;
  const ratio = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return `#${toHex(start.r + (end.r - start.r) * ratio)}${toHex(
    start.g + (end.g - start.g) * ratio,
  )}${toHex(start.b + (end.b - start.b) * ratio)}`;
}
