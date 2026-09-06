/**
 * Decides whether the app chrome should render dark, from the active map
 * theme's own background color.
 *
 * @remarks
 * The chrome follows the *selected theme*, never the OS appearance: picking
 * Transit darkens the sidebar, dialogs and icons even on a light desktop.
 * Derived from the color instead of a hardcoded theme id list so
 * user-installed `.vellumstyle` themes get the right chrome for free.
 */

/** Relative luminance (0–1) of a `ColorToken`, or `null` if unparseable. */
function luminance(color: string): number | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex?.[1]) {
    const digits = hex[1];
    const [r, g, b] =
      digits.length === 3
        ? [...digits].map((c) => parseInt(c + c, 16))
        : [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
    return (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
  }
  // ponytail: hsl() only needs its lightness component here, no full color parse.
  const hsl = /^hsl\(\s*[\d.]+(?:deg)?[\s,]+[\d.]+%[\s,]+([\d.]+)%/i.exec(
    color.trim(),
  );
  return hsl?.[1] != null ? Number(hsl[1]) / 100 : null;
}

/** Whether a theme's `mapBackground` calls for dark chrome. */
export function isDarkThemeBackground(mapBackground: string | undefined) {
  const l = mapBackground == null ? null : luminance(mapBackground);
  return l !== null && l < 0.4;
}
