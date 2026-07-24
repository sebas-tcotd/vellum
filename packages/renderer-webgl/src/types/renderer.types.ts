/** Hover-tooltip and viewport types shared by `MapLibreRenderer` and its interaction subscriptions. */

import type { TransitMode } from '@vellum/core';
import type { ServiceGroup } from '../service-icons';

export type TransitLineInfo = {
  name: string;
  color: string;
  mode: TransitMode;
};

/** Info emitted by the hover subscription when the cursor enters a transit-stop feature. */
export interface TransitTooltipInfo {
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
  westLng: number;
  eastLng: number;
  northLat: number;
  southLat: number;
}

/** Snapshot of the service-icon legend's relevance to the current viewport. */
export interface ServiceIconLegendState {
  /** Whether the current zoom is at or above the threshold where service icons render. */
  visible: boolean;
  /** Distinct `ServiceGroup`s with at least one icon rendered in the current viewport, when `visible`. */
  groups: ServiceGroup[];
}
