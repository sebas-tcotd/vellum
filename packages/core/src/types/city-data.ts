/**
 * Represents a point in the 3D game space.
 * @remarks
 * The game's native Z-axis (north-south) maps directly to the Y-axis in 2D canvas rendering.
 */
export interface Vec3 {
  /** East-west coordinate. */
  x: number;
  /** Vertical elevation. */
  y: number;
  /** North-south coordinate. Maps to the Y-axis on the 2D canvas. */
  z: number;
}

/**
 * A ring of WGS-84 `[longitude, latitude]` coordinate pairs forming a polygon boundary.
 * Uses south-up convention: positive CS1 Z maps to positive latitude.
 */
export type TerrainRing = [number, number][];

/**
 * A single terrain polygon with an exterior boundary and optional interior holes.
 * @remarks
 * Holes represent inland water bodies (rivers, lakes) cut out of the landmass.
 * Coordinates are in WGS-84 `[lng, lat]` order, ready for direct use in GeoJSON.
 */
export interface TerrainPolygon {
  /** Outer boundary ring in WGS-84 `[lng, lat]`. */
  exterior: TerrainRing;
  /** Interior rings (holes) for inland water bodies. */
  holes: TerrainRing[];
}

/**
 * An elevation isoline grouping all polylines at a single elevation.
 * @remarks
 * Mirrors the Rust `TerrainIsoline` struct. Each entry in `lines` is one
 * disconnected polyline segment expressed as an array of WGS-84 `[lng, lat]` pairs.
 */
export interface TerrainIsoline {
  /** Elevation value in raw game units. */
  elevation: number;
  /** Array of polylines at this elevation; each polyline is an array of `[lng, lat]` pairs. */
  lines: [number, number][][];
}

/**
 * A digital elevation model baked as a PNG, ready for a MapLibre `raster-dem` source.
 * @remarks
 * Mirrors the Rust `TerrainDem` struct. Elevations are packed losslessly as
 * `R·256 + G` and stay in raw game units end to end — the same unit
 * `TerrainIsoline.elevation` uses (metres are `raw / 64`).
 *
 * Water cells are clamped to `elevMin` rather than made transparent — land and water
 * elevation ranges overlap in real maps, so no threshold separates them. The sea is
 * masked at render time by a vector fill layer instead.
 */
export interface TerrainDem {
  /** `data:image/png;base64,…` — 1081×1081 RGBA, image row 0 is north. */
  dataUri: string;
  /** Lowest dry-land elevation, in raw game units — lower bound of the hypsometric ramp. */
  elevMin: number;
  /** Highest dry-land elevation, in raw game units — upper bound of the hypsometric ramp. */
  elevMax: number;
}

/**
 * Defines the classification of a road or path segment.
 * Designed to be used as combinable flags for mixed-use ways.
 */
export type WayType =
  | 'Road'
  | 'Highway'
  | 'Elevated'
  | 'Underground'
  | 'Bridge'
  | 'Tunnel'
  | 'Pedestrian'
  | 'Bicycle'
  | 'None';

/**
 * Represents an intersection or a terminal end of a road segment.
 */
export interface RoadNode {
  /** Unique identifier assigned by the game engine. */
  id: string;
  /** Spatial location of the node. */
  position: Vec3;
}

/**
 * Represents a physical road or path segment connecting two nodes.
 * @remarks
 * Virtual connector segments (e.g., `icls="Bus Line"`) are strictly filtered out
 * by the parser and will never appear in this dataset.
 */
export interface RoadSegment {
  /** Unique identifier for the segment. */
  id: string;
  /** ID of the origin `RoadNode`. */
  startNodeId: string;
  /** ID of the destination `RoadNode`. */
  endNodeId: string;
  /** Intermediate geometry points of the segment curve, in world space. Empty for straight segments. */
  points: Vec3[];
  /** Collection of active classifications for this segment. */
  wayType: WayType[];
  /** The original asset class from the game, used by the theme engine for granular filtering. */
  itemClass: string;
  /** Physical base width in game units (does not include UI scaling factors). */
  width: number;
}

/**
 * Represents the mode of transportation for a line or stop.
 * Contains an `Unknown` fallback variant for graceful handling of unrecognized DLC content.
 */
export type TransitMode =
  | 'Bus'
  | 'Tram'
  | 'Train'
  | 'Metro'
  | 'CableCar'
  | 'Monorail'
  | 'Ferry'
  | 'Blimp'
  | 'Trolleybus'
  | 'Unknown';

/**
 * Represents a public transportation stop or station.
 */
export interface TransitStop {
  /** Unique identifier for the stop. */
  id: string;
  /** The type of vehicle that services this stop. */
  mode: TransitMode;
  /** Spatial location of the stop. */
  position: Vec3;
  /** Custom or default name assigned in-game. */
  name: string;
}

/**
 * Represents a segment of a pre-calculated transit route.
 * @remarks
 * The game engine pre-calculates all transit paths. No pathfinding logic should be
 * implemented in Vellum; simply traverse the `segmentIds` in order.
 */
export interface PathSegment {
  /** Ordered list of `RoadSegment` IDs that make up this portion of the route. */
  segmentIds: string[];
}

/**
 * Represents a complete public transportation line, including its predefined route and stops.
 */
export interface TransitLine {
  /** Unique identifier for the transit line. */
  id: string;
  /** User-defined or auto-generated name. */
  name: string;
  /** The transportation mode for this entire line. */
  mode: TransitMode;
  /** Hexadecimal color string defined in-game (e.g., '#FF6600'). */
  color: string;
  /** Collection of stops serviced by this line. */
  stops: TransitStop[];
  /** The complete, pre-calculated route geometry. */
  route: PathSegment[];
}

/**
 * The building's service/zoning sub-type, mapped verbatim from the `.cslmap` `subsrv`
 * attribute.
 * @remarks
 * Covers every `subsrv` value observed across real `.cslmap` exports (including
 * DLC-specific variants), plus `'unknown'` as a graceful fallback for values not
 * yet catalogued. The parser never normalizes this value — it copies `subsrv` as-is.
 * Category grouping for rendering (e.g. `residential.low`) is resolved separately by
 * `BUILDING_SERVICE_TYPE_CATEGORY` in `theme.ts`.
 */
export type BuildingServiceType =
  | 'ResidentialLow'
  | 'ResidentialHigh'
  | 'ResidentialLowEco'
  | 'ResidentialHighEco'
  | 'CommercialLow'
  | 'CommercialHigh'
  | 'CommercialLeisure'
  | 'CommercialTourist'
  | 'CommercialEco'
  | 'IndustrialGeneric'
  | 'IndustrialForestry'
  | 'IndustrialOre'
  | 'IndustrialOil'
  | 'IndustrialFarming'
  | 'PlayerIndustryForestry'
  | 'OfficeGeneric'
  | 'OfficeHightech'
  | 'OfficeFinancial'
  | 'PublicTransportBus'
  | 'PublicTransportTrain'
  | 'PublicTransportTram'
  | 'PublicTransportMetro'
  | 'PublicTransportShip'
  | 'PublicTransportPlane'
  | 'PublicTransportCableCar'
  | 'PublicTransportTaxi'
  | 'PublicTransportTours'
  | 'PublicTransportPost'
  | 'PlayerEducationTradeSchool'
  | 'PlayerEducationUniversity'
  | 'BeautificationParks'
  | 'None'
  | 'unknown';

/**
 * Represents a building asset with its physical footprint.
 */
export interface Building {
  /** Unique identifier for the building. */
  id: string;
  /** Asset name as exported from the game. */
  name: string;
  /** Anchor position of the building in the 3D space. */
  position: Vec3;
  /** The original asset class, used to filter out entities like 'Beautification Item'. */
  itemClass: string;
  /** The building's service/zoning sub-type, mapped from the `.cslmap` `subsrv` attribute. */
  serviceType: BuildingServiceType;
  /** Polygon vertices defining the building's physical boundaries. */
  footprint: Vec3[];
}

/**
 * Represents a cell of vegetation/tree cover.
 */
export interface ForestCell {
  /** X-coordinate in the global grid. */
  x: number;
  /** Z-coordinate in the global grid. */
  z: number;
  /** Normalized density of the forest cover (0.0 to 1.0). */
  density: number;
}

/**
 * Represents a named city district.
 * @remarks
 * The `.cslmap` format only exports a single position per district — no polygon
 * boundaries exist in the data. Render as a text label at `position`.
 */
export interface District {
  /** Unique identifier for the district. */
  id: string;
  /** Name assigned to the district in-game. */
  name: string;
  /** Label anchor in world-space (the single point exported by .cslmap). */
  position: Vec3;
}

/**
 * The core domain model representing a completely parsed `.cslmap` city.
 * @remarks
 * This structure is strictly immutable once constructed. The Rust parser produces it
 * and renderers consume it. Arrays may be empty, but must never be `null`.
 */
export interface CityData {
  /** The name of the city as defined in the save file. */
  cityName: string;
  /** The original filename of the `.cslmap` archive. */
  fileName: string;
  /** ISO 8601 timestamp representing when this data was parsed. */
  generatedAt: string;

  /** Spatial boundaries and global elevation thresholds derived from the XML. */
  bounds: {
    /** Minimum X-coordinate (western boundary). */
    minX: number;
    /** Maximum X-coordinate (eastern boundary). */
    maxX: number;
    /** Minimum Z-coordinate (northern boundary). */
    minZ: number;
    /** Maximum Z-coordinate (southern boundary). */
    maxZ: number;
    /** Base water level threshold (typically 40). Any Y-value below this is considered water or underground. */
    seaLevel: number;
  };

  /** Vectorized landmass polygon in WGS-84. Holes represent inland water bodies. */
  landPolygon: TerrainPolygon[];
  /** Coastline isoline extracted from `landPolygon` rings. Elevation equals `seaLevel`. */
  coastline: TerrainIsoline;
  /** Vectorized inland water bodies (rivers and lakes) in WGS-84. Rendered above `landPolygon`. */
  inlandWaterPolygons: TerrainPolygon[];
  /** Elevation isolines for the optional contour-line layer, in WGS-84. */
  contourLines: TerrainIsoline[];
  /** Digital elevation model for the MapLibre color-relief and hillshade layers. */
  terrainDem: TerrainDem;
  /** Intersections and terminuses for the road network. */
  roadNodes: RoadNode[];
  /** Valid physical road segments (virtual connectors like 'Bus Line' are pre-filtered). */
  roadSegments: RoadSegment[];
  /** Public transportation lines with pre-calculated paths. */
  transitLines: TransitLine[];
  /** Static building geometry. */
  buildings: Building[];
  /** Vegetation density map. */
  forestCells: ForestCell[];
  /** User-defined city districts. */
  districts: District[];
}
