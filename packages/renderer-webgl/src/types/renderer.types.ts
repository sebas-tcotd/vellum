/** Hover-tooltip and viewport types shared by `MapLibreRenderer` and its interaction subscriptions. */

import type { TransitMode } from '@vellum/core';

export type TransitLineInfo = {
  name: string;
  color: string;
  mode: TransitMode;
};

/** Info emitted by the hover subscription when the cursor enters a transit-stop feature. */
export interface TooltipInfo {
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

/** Geographic viewport state emitted by the minimap subscription. */
export interface ViewportBounds {
  westLng: number;
  eastLng: number;
  northLat: number;
  southLat: number;
}
