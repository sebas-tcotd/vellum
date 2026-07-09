/**
 * Flattens the grouped `RenderStyleParams` contract into the simple per-layer
 * color lookup that `renderer-webgl`'s layer registration functions consume.
 *
 * @remarks
 * Replaces the old `RendererTokens`/`readTokensFromDOM` module (Story 5.x).
 * `resolveColors()` is called once at construction and again on every
 * `applyTheme()` call — it must stay a cheap, allocation-light pure function
 * to keep the <16ms theme-switch budget.
 *
 * Known simplifications (documented, not bugs):
 * - `roads.*.industrial` variants and `roads.rail.{tram,monorail,metro}` are
 *   accepted by the contract but not yet wired to a distinct rendering path —
 *   `geojson-builder`'s `RoadTier` union has no industrial/per-rail-mode
 *   classification yet. The `railway` tier (used for both Train Track and
 *   Metro Track today) resolves to `roads.rail.train`.
 * - Buildings are rendered as a single flat fill/stroke (no per-`serviceType`
 *   data-driven expression yet) — resolves to `buildings.none`, the most
 *   frequent case (`subsrv="None"`). Wiring `Building.serviceType` into the
 *   buildings GeoJSON and a data-driven color expression is Story 5.1+ scope.
 * - `transitBackground` has no consumer today — no MapLibre layer paints with
 *   it (transit dimming, if any, lives in UI-layer CSS). Kept in the contract
 *   for the Story 5.3 dimming feature.
 * - `terrain.{low,mid,high}` have no consumer — the elevation gradient is
 *   baked server-side into the terrain PNG texture (see
 *   `packages/parser-cslmap/src/parser/terrain/texture.rs`), not themed at
 *   runtime. Only `terrain.base` is used, as the flat land fill color.
 */

import type { RenderStyleParams } from '@vellum/core';
import type { RoadTier } from './geojson-builder';

/** Per-layer flat colors derived from `RenderStyleParams`, consumed by `layers/*.ts`. */
export interface ResolvedColors {
  /** Map background color, visible outside the city bounds. */
  background: string;
  /** Water fill color. */
  water: string;
  /** Land fill color (flat — see module remarks re: terrain gradient). */
  land: string;
  /** Coastline outline color. */
  coastlineStroke: string;
  /** Forest density marker color. */
  forests: string;
  /** Building fill color (flat — see module remarks re: per-category coloring). */
  buildingFill: string;
  /** Building outline color. */
  buildingStroke: string;
  /** District marker fill color. */
  districtFill: string;
  /** District label/stroke color. */
  districtLabel: string;
  /** Road fill color per tier, keyed by `RoadTier`. */
  roadFill: Record<RoadTier, string>;
  /** Road casing (outline) color per tier, keyed by `RoadTier`. */
  roadCasing: Record<RoadTier, string>;
}

/** Derives the flat `ResolvedColors` lookup from a `RenderStyleParams` theme. */
export function resolveColors(style: RenderStyleParams): ResolvedColors {
  const { roads, buildings } = style;

  return {
    background: style.mapBackground,
    water: style.water,
    land: style.terrain.base,
    coastlineStroke: style.water,
    forests: style.forests,
    buildingFill: buildings.none.fill,
    buildingStroke: buildings.none.stroke,
    districtFill: style.districts.fill,
    districtLabel: style.districts.label,
    roadFill: {
      highway: roads.highway.generic.fill,
      largeArterial: roads.largeArterial.generic.fill,
      mediumArterial: roads.mediumArterial.generic.fill,
      local: roads.local.generic.fill,
      gravel: roads.local.gravel.fill,
      pedestrian: roads.pedestrian.path.fill,
      pedestrianWay: roads.pedestrian.way.fill,
      railway: roads.rail.train.fill,
    },
    roadCasing: {
      highway: roads.highway.generic.casing,
      largeArterial: roads.largeArterial.generic.casing,
      mediumArterial: roads.mediumArterial.generic.casing,
      local: roads.local.generic.casing,
      gravel: roads.local.gravel.casing,
      pedestrian: roads.pedestrian.path.casing,
      pedestrianWay: roads.pedestrian.way.casing,
      railway: roads.rail.train.casing,
    },
  };
}
