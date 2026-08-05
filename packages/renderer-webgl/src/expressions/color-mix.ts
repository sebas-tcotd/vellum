/**
 * Minimal colour parsing and mixing for values that must be resolved to a
 * literal, without a browser.
 *
 * @remarks
 * MapLibre interpolates colours on the GPU, so the interactive map never needs
 * this. A static exporter does: it has to bake the ramp into one concrete
 * string per feature, and it runs where there is no `document` to hand a CSS
 * colour to.
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

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const HSL_PATTERN =
  /^hsl\(\s*(-?[\d.]+)\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*\)$/i;

/**
 * Parses a `ColorToken` into RGB components.
 *
 * @param token - A `#rgb`, `#rrggbb`, or `hsl(h, s%, l%)` string.
 * @returns The parsed components, or `null` when the form is unrecognised.
 */
function parseColorToken(token: string): Rgb | null {
  const hex = HEX_PATTERN.exec(token.trim());
  if (hex) {
    const digits = hex[1]!;
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : digits;
    return {
      r: Number.parseInt(full.slice(0, 2), 16),
      g: Number.parseInt(full.slice(2, 4), 16),
      b: Number.parseInt(full.slice(4, 6), 16),
    };
  }

  const hsl = HSL_PATTERN.exec(token.trim());
  if (hsl) {
    return hslToRgb(
      Number.parseFloat(hsl[1]!),
      Number.parseFloat(hsl[2]!) / 100,
      Number.parseFloat(hsl[3]!) / 100,
    );
  }
  return null;
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
