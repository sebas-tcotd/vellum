/** Shared cartographic treatment for maritime (ferry and ship) route ways. */
export const FERRY_LINE_DASHARRAY = [3, 1] as const;
export const FERRY_LINE_OPACITY = 0.65;

/** Shared cartographic treatment for airship (Dirigible) route ways. */
export const AIRSHIP_LINE_DASHARRAY = [3, 2] as const;
export const AIRSHIP_LINE_OPACITY = 0.48;

/**
 * Shared cartographic treatment for cable-car ways.
 *
 * Long dashes, dark and near-opaque: the opposite end of the same idiom as the
 * airship's short, pale, translucent dashes. A cable car is a taut line strung
 * over terrain, so it should read as deliberate rather than atmospheric.
 */
export const CABLECAR_LINE_DASHARRAY = [6, 3] as const;
export const CABLECAR_LINE_OPACITY = 0.85;

/**
 * Shared cartographic treatment for aircraft flight paths (native documents).
 *
 * Long, sparse dashes in the theme's label ink, thin and translucent: the
 * aeronautical-chart idiom. Ink rather than a transit colour because a flight
 * path crosses land and sea alike and must read on both.
 */
export const FLIGHT_LINE_DASHARRAY = [8, 5] as const;
export const FLIGHT_LINE_OPACITY = 0.6;

/**
 * Shared cartographic treatment for transport connections (native documents):
 * the short stop↔platform links inside a station. Faint dots, and only from
 * {@link CONNECTION_MIN_ZOOM}: at city scale they are clutter.
 */
export const CONNECTION_LINE_DASHARRAY = [1, 1.5] as const;
export const CONNECTION_LINE_OPACITY = 0.7;
export const CONNECTION_MIN_ZOOM = 15;

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

/**
 * Darkens a theme colour for the cable-car way.
 *
 * The mirror of {@link resolveAirshipColor}: same two supported colour forms,
 * same fallback, opposite direction.
 */
export function resolveCableCarColor(themeTransitColor: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(themeTransitColor);
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    const mix = (channel: number) => Math.round(channel * 0.45);
    const r = mix((value >> 16) & 0xff);
    const g = mix((value >> 8) & 0xff);
    const b = mix(value & 0xff);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  const hsl = /^hsl\(\s*([\d.]+)\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%\s*\)$/i.exec(
    themeTransitColor,
  );
  if (hsl) {
    return `hsl(${hsl[1]}, ${hsl[2]}%, ${Number(hsl[3]) * 0.45}%)`;
  }

  return themeTransitColor;
}
