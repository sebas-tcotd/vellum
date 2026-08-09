import type { BuildingServiceType } from './city-data';
import type { ColorToken } from './color-tokens';

/**
 * Origin of a theme — bundled with the app or supplied by the user.
 */
export type ThemeSource = 'built-in' | 'user';

/**
 * Identification metadata for a loaded theme, consumed by the theme selector pills
 * and the `availableThemes` list in the store.
 */
export interface ThemeMetadata {
  /** Stable identifier (the `.vellumstyle` filename without extension). */
  id: string;
  /** Human-readable display name shown on the pill. */
  name: string;
  /** Whether the theme ships with the app or was installed by the user. */
  source: ThemeSource;
}

/**
 * The structural definition of a `.vellumstyle` file.
 * @remarks
 * A `.vellumstyle` is simply a complete `RenderStyleParams` plus identifying metadata
 * (`schemaVersion` + `name`). The theme-engine validates and migrates the raw file,
 * then the UI passes the `RenderStyleParams` fields straight to `IRenderer.applyTheme()` —
 * there is no separate "resolution" step because the shapes are identical.
 */
export interface VellumStyle extends RenderStyleParams {
  /** Schema version for backward compatibility and validation.
   * Guaranteed to be present starting from v1. */
  schemaVersion: number;
  /** The human-readable display name of the theme. */
  name: string;
}

/** Fill and casing (outline) colors shared by every road tier leaf. */
export interface RoadCategoryColors {
  /** Color of the road surface itself. */
  fill: ColorToken;
  /** Color of the outline drawn around the fill — creates figure-ground contrast on neutral terrain. */
  casing: ColorToken;
}

/**
 * Road colors grouped by semantic tier, mirroring the `ITEM_CLASS_TIER` classification
 * used by `classifyRoadSegment`/`classifyRoadTier` in the renderer.
 * @remarks
 * Widths are NOT part of this contract — they are renderer constants following the
 * `fixed + scaled` model (see `road-width.ts`). Never add a `width` field here.
 */
export interface RoadColorParams {
  /** Mainline highways and their connector ramps. */
  highway: { generic: RoadCategoryColors };
  /** 6-lane-equivalent arterials. */
  largeArterial: { generic: RoadCategoryColors };
  /** 4-lane-equivalent arterials (same physical width as `largeArterial` in-game — distinguished by color, not width). */
  mediumArterial: { generic: RoadCategoryColors };
  /** 2-lane local streets. */
  local: { generic: RoadCategoryColors; gravel: RoadCategoryColors };
  /** Pedestrian-only ways. */
  pedestrian: {
    path: RoadCategoryColors;
    way: RoadCategoryColors;
    street: RoadCategoryColors;
  };
  /** Rail-based transit infrastructure. */
  rail: {
    /** `icls="Train Track"` (incl. tunnel variant). */
    train: RoadCategoryColors;
    /** `icls="Metro Track"` (incl. tunnel variant). */
    metro: RoadCategoryColors;
  };
  /** Ferry / ship path water transit routes. */
  ferry: RoadCategoryColors;
}

/** Fill and stroke colors shared by every building category leaf. */
export interface BuildingCategoryColors {
  /** Fill color of the building footprint. */
  fill: ColorToken;
  /** Stroke color of the building outline. */
  stroke: ColorToken;
}

/**
 * Building colors grouped by zoning category, keyed off `Building.serviceType`
 * (mapped from the `.cslmap` `subsrv` attribute). See `BUILDING_SERVICE_TYPE_CATEGORY`
 * for the `serviceType` → category lookup used when resolving a `Building` to its colors.
 */
export interface BuildingColorParams {
  /** Residential zoning density variants. */
  residential: {
    low: BuildingCategoryColors;
    high: BuildingCategoryColors;
    selfSufficient: BuildingCategoryColors;
  };
  /** Commercial zoning variants. */
  commercial: {
    low: BuildingCategoryColors;
    high: BuildingCategoryColors;
    leisure: BuildingCategoryColors;
    tourism: BuildingCategoryColors;
    organic: BuildingCategoryColors;
  };
  /** Office zoning variants. */
  office: {
    generic: BuildingCategoryColors;
    tech: BuildingCategoryColors;
    financial: BuildingCategoryColors;
  };
  /** Industrial zoning variants (yellow-hued palette shades). */
  industry: {
    generic: BuildingCategoryColors;
    forestry: BuildingCategoryColors;
    ore: BuildingCategoryColors;
    oil: BuildingCategoryColors;
    farming: BuildingCategoryColors;
  };
  /** Civic and service buildings. */
  civic: {
    publicTransport: BuildingCategoryColors;
    education: BuildingCategoryColors;
    services: BuildingCategoryColors;
  };
  /** Landmarks and unzoned buildings (`subsrv="None"` — the most frequent case). */
  none: BuildingCategoryColors;
}

/** Visual styling for the 9×9 projection grid overlay on the basemap. */
export interface GridStyle {
  /** Line color of the grid. */
  color: ColorToken;
  /** Opacity of the grid lines. */
  opacity: number;
  /** Width of the grid lines in pixels. */
  width: number;
  /** Dash pattern for the grid lines (MapLibre line-dasharray format). */
  dasharray: number[];
}

/**
 * The comprehensive styling configuration produced by the `@vellum/theme-engine`.
 * @remarks
 * Passed directly to `IRenderer.applyTheme()` to dictate visual output independently
 * of the immutable `CityData`. Renderer-agnostic by design: applies equally to
 * `map.setPaintProperty()` calls (MapLibre) or any other rendering backend.
 */
export interface RenderStyleParams {
  /** Background color behind the terrain (visible outside the map bounds). */
  mapBackground: ColorToken;
  /** Color of the decorative map frame that borders the world extent. */
  mapFrame: ColorToken;
  /** Elevation-gradient colors for the terrain texture. */
  terrain: {
    /** Base/flat elevation color. */
    base: ColorToken;
    /** Low elevation color. */
    low: ColorToken;
    /** Mid elevation color. */
    mid: ColorToken;
    /** High elevation color. */
    high: ColorToken;
  };
  /** Color of isolines */
  contourLine: ColorToken;
  /** Color of water bodies (sea and inland water). */
  water: ColorToken;
  /** Color of forest/vegetation density markers. */
  forests: ColorToken;
  /** Background color for the transit layer's dimming overlay. */
  transitBackground: ColorToken;
  /** Road network colors, grouped by tier. */
  roads: RoadColorParams;
  /** Building colors, grouped by zoning category. */
  buildings: BuildingColorParams;
  /** District overlay colors. */
  districts: {
    /** Fill color of the district marker. */
    fill: ColorToken;
    /** Text color of the district label. */
    label: ColorToken;
  };
  /** Projection grid overlay for the basemap layer. */
  grid: GridStyle;
  /** Park area marker colors by type. Falls back to built-in defaults if not specified. */
  parkAreas?: {
    /** Generic park / NatureReserve / unknown type. */
    generic: ColorToken;
    /** University campus (Parklife / Campus DLC). */
    university: ColorToken;
    /** Trade school (Campus DLC). */
    tradeSchool: ColorToken;
    /** Industrial area (Industries DLC). */
    industry: ColorToken;
    /** Forestry area (Industries DLC). */
    forestry: ColorToken;
  };
}

/**
 * Lookup from `Building.serviceType` (raw `.cslmap` `subsrv` value) to the
 * `BuildingColorParams` path that should color it.
 * @remarks
 * This is consumption logic for the renderer/theme-engine — the parser never
 * normalizes `subsrv`, it copies the raw string into `serviceType` as-is.
 * Unrecognized values (including the `'unknown'` fallback) resolve to `civic.services`.
 */
export const BUILDING_SERVICE_TYPE_CATEGORY: Record<
  Exclude<BuildingServiceType, 'unknown'>,
  string
> = {
  ResidentialLow: 'residential.low',
  ResidentialHigh: 'residential.high',
  ResidentialLowEco: 'residential.selfSufficient',
  ResidentialHighEco: 'residential.selfSufficient',
  // Plazas & Promenades wall-to-wall zoning is high-density by construction.
  ResidentialWallToWall: 'residential.high',
  CommercialLow: 'commercial.low',
  CommercialHigh: 'commercial.high',
  CommercialLeisure: 'commercial.leisure',
  CommercialTourist: 'commercial.tourism',
  CommercialEco: 'commercial.organic',
  CommercialWallToWall: 'commercial.high',
  IndustrialGeneric: 'industry.generic',
  IndustrialForestry: 'industry.forestry',
  IndustrialOre: 'industry.ore',
  IndustrialOil: 'industry.oil',
  IndustrialFarming: 'industry.farming',
  // Industries DLC player-built areas mirror their generic-zoning counterparts.
  PlayerIndustryForestry: 'industry.forestry',
  PlayerIndustryFarming: 'industry.farming',
  PlayerIndustryOre: 'industry.ore',
  PlayerIndustryOil: 'industry.oil',
  OfficeGeneric: 'office.generic',
  OfficeHightech: 'office.tech',
  OfficeFinancial: 'office.financial',
  OfficeWallToWall: 'office.generic',
  PublicTransportBus: 'civic.publicTransport',
  PublicTransportTrain: 'civic.publicTransport',
  PublicTransportTram: 'civic.publicTransport',
  PublicTransportMetro: 'civic.publicTransport',
  PublicTransportMonorail: 'civic.publicTransport',
  PublicTransportShip: 'civic.publicTransport',
  PublicTransportPlane: 'civic.publicTransport',
  PublicTransportCableCar: 'civic.publicTransport',
  PublicTransportTaxi: 'civic.publicTransport',
  PublicTransportTours: 'civic.publicTransport',
  PublicTransportPost: 'civic.publicTransport',
  PlayerEducationTradeSchool: 'civic.education',
  PlayerEducationUniversity: 'civic.education',
  PlayerEducationLiberalArts: 'civic.education',
  BeautificationParks: 'civic.services',
  None: 'none',
};
