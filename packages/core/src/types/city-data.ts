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
 * Represents a dry terrain cell with a discrete elevation level.
 * @remarks
 * Domain Invariant: Land and water data are strictly kept in separate arrays.
 * They must never be merged into a unified heightmap.
 */
export interface LandTile {
  /** Raw elevation value from the terrain CSV (not in game-unit meters). */
  elevation: number;
  /** Raw water-surface height from the terrain CSV. When this exceeds `SEA_LEVEL_DEFAULT`, the cell has an inland water body (river or lake) sitting above the ground — used to detect non-ocean water. */
  resolution: number;
  /** X-coordinate in the global grid. */
  x: number;
  /** Z-coordinate in the global grid. */
  z: number;
}

/**
 * Represents a water cell containing depth information.
 * @remarks
 * Domain Invariant: This is maintained separately from `LandTile` data.
 */
export interface WaterTile {
  /** Depth of the water in game units. */
  depth: number;
  /** X-coordinate in the global grid. */
  x: number;
  /** Z-coordinate in the global grid. */
  z: number;
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
 * Represents a building asset with its physical footprint.
 */
export interface Building {
  /** Unique identifier for the building. */
  id: string;
  /** Anchor position of the building in the 3D space. */
  position: Vec3;
  /** The original asset class, used to filter out entities like 'Beautification Item'. */
  itemClass: string;
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
 * Represents a zoned district with custom boundaries.
 */
export interface District {
  /** Unique identifier for the district. */
  id: string;
  /** Name assigned to the district in-game. */
  name: string;
  /** Polygon vertices defining the perimeter of the district. */
  boundary: Vec3[];
}

/**
 * The core domain model representing a completely parsed `.cslmap` city.
 * @remarks
 * This structure is strictly immutable once constructed. The Rust parser produces it,
 * and the Canvas renderer consumes it. Arrays may be empty, but must never be `null`.
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

  /** Grid cells representing dry terrain elevation. */
  landTiles: LandTile[];
  /** Grid cells representing water bodies and their depths. */
  waterTiles: WaterTile[];
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
