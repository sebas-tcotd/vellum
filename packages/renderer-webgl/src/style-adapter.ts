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
 * - Buildings default to a single flat fill/stroke (`buildings.none`, the
 *   most frequent case, `subsrv="None"`). Civic buildings are the exception —
 *   they always use their theme subcategory color. Full per-`serviceType`
 *   data-driven coloring for every category (not just the RICO/civic split)
 *   is still Story 5.1+ scope — see `expressions/building-color.ts`.
 * - `transitBackground` has no consumer today — no MapLibre layer paints with
 *   it (transit dimming, if any, lives in UI-layer CSS). Kept in the contract
 *   for the Story 5.3 dimming feature.
 * - `terrain.base` remains the flat `base-land` fill, used as the fallback when the
 *   terrain layer is toggled off. `terrain.{low,mid,high}` now feed the `color-relief`
 *   hypsometric ramp (`expressions/terrain-relief.ts`) — they used to be dead because
 *   the gradient was baked into a PNG by the Rust parser.
 */

import type { RenderStyleParams } from '@vellum/core';
import type { RoadTier } from './geojson';

/** Grid visual properties resolved from `RenderStyleParams.grid`. */
export interface GridResolved {
  /** Line color of the grid lines. */
  line: string;
  /** Opacity of the grid lines. */
  opacity: number;
  /** Width of the grid lines in pixels. */
  width: number;
  /** Dash pattern for the grid lines. */
  dasharray: number[];
}

/** Per-layer flat colors derived from `RenderStyleParams`, consumed by `layers/*.ts`. */
export interface ResolvedColors {
  /** Map background color, visible outside the city bounds. */
  background: string;
  /** Color of the decorative map frame. */
  mapFrame: string;
  /** Water fill color. */
  water: string;
  /** Land fill color (flat) — the `base-land` fallback shown when the terrain layer is off. */
  land: string;
  /** Elevation-gradient colors driving the `color-relief` hypsometric ramp. */
  terrain: {
    /** Colour at the lowest dry-land elevation. */
    low: string;
    /** Colour at the midpoint of the elevation range. */
    mid: string;
    /** Colour at the highest dry-land elevation. */
    high: string;
  };
  /** Isolines color. */
  contourLine: string;
  /** Coastline outline color. */
  coastlineStroke: string;
  /** Forest density marker color. */
  forests: string;
  /** Default building fill color (flat — see module remarks re: per-category coloring). */
  buildingFill: string;
  /** Default building outline color. */
  buildingStroke: string;
  /** Civic building colors by subcategory — always applied, regardless of the RICO "color by category" toggle. */
  buildingCivic: {
    publicTransport: { fill: string; stroke: string };
    education: { fill: string; stroke: string };
    services: { fill: string; stroke: string };
  };
  /** District marker fill color. */
  districtFill: string;
  /** District label/stroke color. */
  districtLabel: string;
  /** Road fill color per tier, keyed by `RoadTier`. */
  roadFill: Record<RoadTier, string>;
  /** Road casing (outline) color per tier, keyed by `RoadTier`. */
  roadCasing: Record<RoadTier, string>;
  /** Ferry / ship path line color. */
  ferry: string;
  /** Grid visual properties for the projection grid overlay. */
  grid: GridResolved;
  /** Park area marker colors by type — drives the `match` expression in `layer-parks.ts`. */
  parkAreas: {
    /** Generic parks, NatureReserve, and unknown types. */
    generic: string;
    /** University campus (Parklife / Campus DLC). */
    university: string;
    /** Trade school (Campus DLC). */
    tradeSchool: string;
    /** Industrial area (Industries DLC). */
    industry: string;
    /** Forestry area (Industries DLC). */
    forestry: string;
  };
}

/** Derives the flat `ResolvedColors` lookup from a `RenderStyleParams` theme. */
export function resolveColors(style: RenderStyleParams): ResolvedColors {
  const { roads, buildings } = style;

  const { grid } = style;

  return {
    background: style.mapBackground,
    mapFrame: style.mapFrame,
    water: style.water,
    land: style.terrain.base,
    terrain: {
      low: style.terrain.low,
      mid: style.terrain.mid,
      high: style.terrain.high,
    },
    contourLine: style.contourLine,
    coastlineStroke: style.water,
    forests: style.forests,
    buildingFill: buildings.none.fill,
    buildingStroke: buildings.none.stroke,
    buildingCivic: {
      publicTransport: buildings.civic.publicTransport,
      education: buildings.civic.education,
      services: buildings.civic.services,
    },
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
      train: roads.rail.train.fill,
      metro: roads.rail.metro.fill,
      // NOTE: `pedestrian.street` exists in `RoadColorParams` but has no
      // distinct `RoadTier` — it's accepted by the contract for future use
      // (Story 5.1+) but not wired to any layer today.
    },
    roadCasing: {
      highway: roads.highway.generic.casing,
      largeArterial: roads.largeArterial.generic.casing,
      mediumArterial: roads.mediumArterial.generic.casing,
      local: roads.local.generic.casing,
      gravel: roads.local.gravel.casing,
      pedestrian: roads.pedestrian.path.casing,
      pedestrianWay: roads.pedestrian.way.casing,
      train: roads.rail.train.casing,
      metro: roads.rail.metro.casing,
      // NOTE: `pedestrian.street` exists in `RoadColorParams` but has no
      // distinct `RoadTier` — accepted by contract, not wired today.
    },
    ferry: roads.ferry.fill,
    grid: {
      line: grid.color,
      opacity: grid.opacity,
      width: grid.width,
      dasharray: grid.dasharray,
    },
    parkAreas: {
      generic: style.parkAreas?.generic ?? '#95ae79',
      university: style.parkAreas?.university ?? '#c4a06a',
      tradeSchool: style.parkAreas?.tradeSchool ?? '#d2938e',
      industry: style.parkAreas?.industry ?? '#a098b0',
      forestry: style.parkAreas?.forestry ?? '#14592a',
    },
  };
}
