/**
 * Fixed RICO zoning colors shared by the map and the place card.
 *
 * @remarks
 * Theme-independent on purpose — mirrors Cities: Skylines' own zoning-tool
 * convention (green residential, blue commercial, yellow industrial, cyan
 * office), so the "color by category" overlay and the land-use bar in the
 * place card stay recognizable across every Vellum theme. Single source: the
 * renderer and the UI both read from here.
 */

/** The four zoned sectors of a city. */
export type RicoZone = 'residential' | 'commercial' | 'industry' | 'office';

/** Fill and stroke color of one RICO zone. */
export interface RicoColor {
  /** Fill color, as a CSS hex string. */
  fill: string;
  /** Stroke color, as a CSS hex string. */
  stroke: string;
}

/** Fixed fill/stroke colors per RICO zone. */
export const RICO_COLORS: Readonly<Record<RicoZone, RicoColor>> = {
  residential: { fill: '#66bb6a', stroke: '#2e7d32' },
  commercial: { fill: '#42a5f5', stroke: '#1565c0' },
  industry: { fill: '#ffca28', stroke: '#f57f17' },
  office: { fill: '#4dd0e1', stroke: '#00838f' },
};
