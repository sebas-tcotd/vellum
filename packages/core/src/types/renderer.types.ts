/**
 * Hover-tooltip, viewport and legend state emitted by the interactive map
 * renderer's subscriptions.
 *
 * @remarks
 * These types live in `@vellum/core` rather than in the adapter because the
 * subscription ports that carry them are declared here (ADR-0001). None of
 * them references MapLibre: they are the neutral vocabulary the UI reads,
 * whatever adapter is assembled behind `MapRendererPort`.
 */

import type { ServiceGroup } from '../service-icons';
import type { TransitMode } from './city-data';

/** A transit line serving a hovered stop, reduced to what the tooltip paints. */
export type TransitLineInfo = {
  /** Line name as authored in the `.cslmap`. */
  name: string;
  /** Line color, already resolved to a CSS color string. */
  color: string;
  /** Transport mode the line runs on. */
  mode: TransitMode;
};

/** Info emitted by the hover subscription when the cursor enters a transit-stop feature. */
export interface TransitTooltipInfo {
  /** Discriminant. */
  kind: 'transit';
  /** Canvas-relative X pixel of the cursor (matches MapLibre event.point.x). */
  screenX: number;
  /** Canvas-relative Y pixel of the cursor (matches MapLibre event.point.y). */
  screenY: number;
  /**
   * All transit lines serving the hovered stop (or cluster of stops).
   * Note: individual stops have no name in the .cslmap — only lines have names.
   */
  lines: TransitLineInfo[];
}

/** Info emitted by the hover subscription when the cursor enters a district marker (points display mode). */
export interface DistrictTooltipInfo {
  /** Discriminant. */
  kind: 'district';
  /** Canvas-relative X pixel of the cursor (matches MapLibre event.point.x). */
  screenX: number;
  /** Canvas-relative Y pixel of the cursor (matches MapLibre event.point.y). */
  screenY: number;
  /** Name of the hovered district. */
  name: string;
}

/** Hover info emitted by `subscribeHover`, discriminated by the feature kind under the cursor. */
export type TooltipInfo = TransitTooltipInfo | DistrictTooltipInfo;

/** Geographic viewport state emitted by the minimap subscription. */
export interface ViewportBounds {
  /** Western edge of the viewport, in degrees of longitude. */
  westLng: number;
  /** Eastern edge of the viewport, in degrees of longitude. */
  eastLng: number;
  /** Northern edge of the viewport, in degrees of latitude. */
  northLat: number;
  /** Southern edge of the viewport, in degrees of latitude. */
  southLat: number;
}

/** Snapshot of the service-icon legend's relevance to the current viewport. */
export interface ServiceIconLegendState {
  /** Whether the current zoom is at or above the threshold where service icons render. */
  visible: boolean;
  /** Distinct `ServiceGroup`s with at least one icon rendered in the current viewport, when `visible`. */
  groups: ServiceGroup[];
}
