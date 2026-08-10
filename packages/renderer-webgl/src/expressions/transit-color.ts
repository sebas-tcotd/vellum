/** Shared cartographic treatment for airship (Dirigible) route ways. */
export const AIRSHIP_LINE_DASHARRAY = [3, 2] as const;
export const AIRSHIP_LINE_OPACITY = 0.48;

/**
 * Lightens a theme colour toward white for the airship's cloud-like route tint.
 *
 * Built-in themes use hexadecimal colours. HSL is kept as a supported fallback
 * because ColorToken also permits user themes expressed in HSL.
 */
export function resolveAirshipColor(themeTransitColor: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(themeTransitColor);
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    const mix = (channel: number) =>
      Math.round(channel + (255 - channel) * 0.6);
    const r = mix((value >> 16) & 0xff);
    const g = mix((value >> 8) & 0xff);
    const b = mix(value & 0xff);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  const hsl = /^hsl\(\s*([\d.]+)\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%\s*\)$/i.exec(
    themeTransitColor,
  );
  if (hsl) {
    const saturation = Number(hsl[2]) * 0.45;
    const lightness = Number(hsl[3]) + (100 - Number(hsl[3])) * 0.6;
    return `hsl(${hsl[1]}, ${saturation}%, ${lightness}%)`;
  }

  return themeTransitColor;
}
