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
import type { LineInfo } from './transit-network';

/**
 * A transit line serving a hovered stop, reduced to what the tooltip paints.
 *
 * @remarks
 * Derived from the canonical {@link LineInfo} of the transit network instead
 * of redeclaring name/color/mode: the tooltip is a projection of the same
 * vocabulary, minus identity and extension payload.
 */
export type TransitLineInfo = Omit<LineInfo, 'id' | 'attributes'>;

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
   */
  lines: TransitLineInfo[];
  /**
   * Name of the hovered stop, when the document names it (native
   * `.vellummap` only — `.cslmap` stops have no names).
   */
  stopName?: string;
  /** `true` when {@link stopName} was derived from the street, not set in game. */
  stopNameDerived?: boolean;
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

/**
 * What a click on the map landed on, emitted by `subscribeSelect`.
 *
 * @remarks
 * The renderer reports every candidate under the pointer and lets the UI
 * arbitrate: only `CityData` knows whether a building is notable (renamed,
 * historical or unique). A hit with neither id is a click on empty map.
 * Clicks on transit stops are not emitted at all — the stop tooltip owns them.
 */
export interface MapSelectHit {
  /** Canvas-relative X pixel of the click (matches MapLibre event.point.x). */
  screenX: number;
  /** Canvas-relative Y pixel of the click (matches MapLibre event.point.y). */
  screenY: number;
  /**
   * Ids of every building within the hit box, nearest to the click first
   * (those right under the pointer, then the rest in render order). The UI
   * picks the first notable one, so a landmark beside a RICO lot still opens.
   */
  buildingIds?: string[];
  /** Id of the park area (label or marker) under the click, if any. */
  parkId?: string;
  /** Id of the district (label, marker or area) under the click, if any. */
  districtId?: string;
}

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
