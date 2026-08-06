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

// Must accept everything `theme-engine`'s `isColorToken` accepts, or a theme
// that validates cleanly still fails to mix and silently freezes on its start
// colour: `#rgba`/`#rrggbbaa` hex, and `hsl()` with an optional `deg` suffix,
// space or comma separators, and an optional alpha after `,` or `/`.
const HEX_PATTERN = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const HSL_PATTERN =
  /^hsl\(\s*(-?\d+(?:\.\d+)?)(?:deg)?\s*[,\s]\s*(\d+(?:\.\d+)?)%\s*[,\s]\s*(\d+(?:\.\d+)?)%(?:\s*[,\s/]\s*(?:\d+(?:\.\d+)?%?|\.\d+))?\s*\)$/i;

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
    // Alpha is parsed but dropped: the ramp mixes opaque colours and the
    // caller carries opacity as its own attribute, so a colour string never
    // smuggles a second opacity channel into an export.
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

/** Perceived brightness in `[0, 1]`, using ITU-R BT.601 luma weights. */
function luma({ r, g, b }: Rgb): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Darkens or lightens a colour by a fixed amount, mixing it toward black or
 * white — the same mental model as Sass's `color.adjust()` /
 * `darken()`/`lighten()`.
 *
 * @remarks
 * Direction is decided from the colour's *own* brightness rather than a
 * caller-supplied hint: a light colour darkens, a dark one lightens. That is
 * what keeps this theme-agnostic — nothing here has to know whether the
 * active theme "is dark" (a classification that breaks the moment a
 * third-party theme doesn't fit the built-in five); it only has to look at
 * the one colour it was given.
 *
 * Deliberately not a WCAG contrast-ratio solver: this asks "pull away from
 * what this colour already is," not "reach a target ratio against some other
 * colour." The latter needs a real background reference to mean anything —
 * solving it against the colour's own pre-adjustment value doesn't measure
 * contrast against anything on screen, it just relabels a fixed mix by a
 * fancier name.
 *
 * @param color - Colour token to adjust.
 * @param amount - Fraction in `[0, 1]` to mix toward black or white.
 * @returns The adjusted colour, or `color` unchanged when unparseable.
 */
export function adjustLightness(color: string, amount: number): string {
  const parsed = parseColorToken(color);
  if (!parsed) return color;
  const target = luma(parsed) >= 0.5 ? '#000000' : '#ffffff';
  return mixColorTokens(color, target, amount);
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
