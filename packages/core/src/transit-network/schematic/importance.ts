/**
 * Urban importance of a transit mode in the schematic diagram (Story 4.7,
 * ADR-0007).
 *
 * @remarks
 * One table, read by three consumers: the routing order of the grid layout
 * (`./grid-layout.ts`), the visual weight of the drawing (`./render.ts` and
 * the view) and the station label priority (`./labels.ts`). None of them
 * restates a level; a mode moves on the scale by changing its number here.
 *
 * The scale is the city's, not the vehicle's: a metro carries the city, a
 * bus fills it in. It is **not** `MODE_PRIORITY` (`../ordering/constants.ts`),
 * which only breaks lateral ties inside a bundle.
 *
 * `null` means "outside the scale": modes that connect with the outside or
 * are not lines (plane, passenger ship, intercity bus, evacuation bus, taxi).
 * The schematic network drops them before it is derived
 * (`deriveSchematicTransitNetwork`), so they reach neither the layout, the
 * legend nor the mode filter; the geographic map still draws them. Giving one
 * a number is all it takes to put it in the diagram.
 */

import type { TransitMode } from '../../types/city-data';
import { TOUR_TRANSIT_MODES } from '../../types/layer';

/** Urban importance per mode; `null` keeps a mode out of the schematic. */
export const TRANSIT_MODE_IMPORTANCE: Readonly<
  Record<TransitMode, number | null>
> = Object.freeze({
  Metro: 5,
  Train: 4,
  Monorail: 4,
  Tram: 3,
  Bus: 3,
  Trolleybus: 2,
  CableCar: 2,
  Ferry: 2,
  Helicopter: 2,
  Blimp: 1,
  WalkingTour: 1,
  SightseeingBus: 1,
  HotAirBalloon: 1,
  Unknown: 1,
  Airplane: null,
  PassengerShip: null,
  IntercityBus: null,
  EvacuationBus: null,
  Taxi: null,
});

/**
 * Importance of `mode`, or `null` when it is outside the scale. A string the
 * table does not know (a worker message from a newer build) counts as
 * `Unknown`.
 */
export function transitModeImportance(mode: string): number | null {
  const level = (
    TRANSIT_MODE_IMPORTANCE as Readonly<Record<string, number | null>>
  )[mode];
  return level === undefined ? TRANSIT_MODE_IMPORTANCE.Unknown : level;
}

/**
 * The tram/bus tie-break: trams route before buses when
 * `buses <= 2 ** trams`, counting **lines** of the network being laid out.
 *
 * @remarks
 * Tram and bus share a level, so without this they tie and the corridor
 * weight decides, which is today's behaviour. A handful of tram lines in a
 * city of a few buses reads as the backbone; dozens of buses around one tram
 * do not. Integers only, and computed once per layout network so the layout
 * stays deterministic. `2 ** 31` would overflow a 32-bit shift, and no city
 * has that many buses, so 31 trams or more is simply `true`.
 */
export function tramRoutesFirst(
  lines: Iterable<{ readonly mode: TransitMode }>,
): boolean {
  let trams = 0;
  let buses = 0;
  for (const line of lines) {
    if (line.mode === 'Tram') trams++;
    else if (line.mode === 'Bus') buses++;
  }
  if (trams >= 31) return true;
  return buses <= 1 << trams;
}

/**
 * Integer routing rank of a mode: `level * 2`, plus one for a tram when
 * {@link tramRoutesFirst} holds. Metro 10, train 8, tram 7 or 6, bus 6. A mode
 * outside the scale ranks 0 (it should not reach a layout at all).
 */
export function routingRank(mode: TransitMode, tramFirst: boolean): number {
  const level = transitModeImportance(mode) ?? 0;
  return level * 2 + (mode === 'Tram' && tramFirst ? 1 : 0);
}

/**
 * Visual tier of every visible mode: the distinct levels present, highest
 * first, and a mode's tier is the position of its level. With metro and bus
 * the bus is tier 1, not 2 — the hierarchy is relative to what is drawn, so a
 * bus-only city draws its buses at full weight. Tram and bus share a tier.
 * Modes outside the scale get none.
 */
export function visualTiers(
  visibleModes: Iterable<TransitMode>,
): ReadonlyMap<TransitMode, number> {
  const levelOf = new Map<TransitMode, number>();
  for (const mode of visibleModes) {
    const level = transitModeImportance(mode);
    if (level !== null) levelOf.set(mode, level);
  }
  const levels = [...new Set(levelOf.values())].sort((a, b) => b - a);
  return new Map(
    [...levelOf].map(([mode, level]) => [mode, levels.indexOf(level)]),
  );
}

/** Stroke-width factor per visual tier; tier 3 and lower share the last. */
export const SCHEMATIC_TIER_WIDTH: readonly number[] = Object.freeze([
  1, 0.75, 0.55, 0.4,
]);
/** Stroke opacity per visual tier; tier 3 and lower share the last. */
export const SCHEMATIC_TIER_OPACITY: readonly number[] = Object.freeze([
  1, 0.85, 0.7, 0.55,
]);

/**
 * Width factor and opacity of a tier. A layout without tiers (`undefined`,
 * from before Story 4.7) draws at full weight, as it always did.
 */
export function schematicTierStyle(tier: number | undefined): {
  readonly width: number;
  readonly opacity: number;
} {
  if (tier === undefined || !Number.isFinite(tier) || tier <= 0) {
    return {
      width: SCHEMATIC_TIER_WIDTH[0],
      opacity: SCHEMATIC_TIER_OPACITY[0],
    };
  }
  const i = Math.min(Math.floor(tier), SCHEMATIC_TIER_WIDTH.length - 1);
  return { width: SCHEMATIC_TIER_WIDTH[i], opacity: SCHEMATIC_TIER_OPACITY[i] };
}

/** Whether a mode draws dashed: the Parklife tours, which are not transit. */
export function isDashedTransitMode(mode: TransitMode): boolean {
  return TOUR_TRANSIT_MODES.includes(mode);
}

/**
 * Dash and gap of a dashed stroke, as multiples of its drawn width. The view
 * multiplies them by the width it draws, which already follows the camera, so
 * the pattern scales with the zoom.
 */
export const SCHEMATIC_DASH_PATTERN: readonly number[] = Object.freeze([1, 2]);
