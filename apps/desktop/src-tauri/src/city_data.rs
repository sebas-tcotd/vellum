// Mirrors of TypeScript CityData — produced by the parser, serialized by serde for IPC

use serde::{Deserialize, Serialize};

/// Represents a point in the 3D game space.
///
/// **Coordinate Mapping:**
/// - `x`: East-west coordinate.
/// - `y`: Vertical elevation.
/// - `z`: North-south coordinate (maps to the Y-axis in 2D canvas).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Spatial boundaries and global thresholds derived from the XML data.
/// Defines the valid coordinate space for the rendered map.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MapBounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_z: f64,
    pub max_z: f64,
    /// The default base sea level threshold (typically 40.0).
    /// **Domain Invariant:** Any spatial point where `y < sea_level` is strictly
    /// considered submerged or underground.
    pub sea_level: f64,
}

/// The root domain model representing a completely parsed `.cslmap` city.
///
/// **CRITICAL RULE:** This struct is strictly immutable once constructed by the parser.
/// It serializes its fields to `camelCase` when crossing the Tauri IPC boundary to match
/// the TypeScript `@vellum/core` contract. Vectors may be empty but must never serialize as `null`.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CityData {
    pub city_name: String,
    pub file_name: String,
    /// ISO 8601 timestamp representing when this archive was generated.
    pub generated_at: String,
    pub bounds: MapBounds,
    pub land_tiles: Vec<LandTile>,
    pub water_tiles: Vec<WaterTile>,
    pub road_nodes: Vec<RoadNode>,
    /// Valid physical road segments.
    /// **CRITICAL INVARIANT:** Virtual connectors like `Bus Line` must be pre-filtered
    /// and completely excluded from this vector.
    pub road_segments: Vec<RoadSegment>,
    pub transit_lines: Vec<TransitLine>,
    pub buildings: Vec<Building>,
    pub forest_cells: Vec<ForestCell>,
    pub districts: Vec<District>,
}

/// Represents a dry terrain cell with a discrete elevation level.
///
/// **CRITICAL INVARIANT:** Land and water data are strictly kept in separate vectors.
/// They must NEVER be merged into a unified heightmap by the parser.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LandTile {
    /// Discrete elevation level, typically mapped to 24 distinct thresholds (0.0 - 23.0).
    pub elevation: f64,
    pub x: f64,
    pub z: f64,
}

/// Represents a water cell containing depth information.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WaterTile {
    pub depth: f64,
    pub x: f64,
    pub z: f64,
}

/// Represents an intersection or a terminal end of a road segment.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoadNode {
    pub id: String,
    pub position: Vec3,
}

/// Defines the classification of a road or path segment.
///
/// **Serialization Rule:** Deliberately omits `#[serde(rename_all = "...")]` so that
/// variants serialize as `PascalCase` strings by default, perfectly mirroring the
/// TypeScript `WayType` union.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum WayType {
    Road,
    Highway,
    Elevated,
    Underground,
    Bridge,
    Tunnel,
    Pedestrian,
    Bicycle,
    None,
}

/// Represents a physical road or path segment connecting two nodes.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoadSegment {
    pub id: String,
    pub start_node_id: String,
    pub end_node_id: String,
    /// Collection of active classifications for this segment.
    pub way_type: Vec<WayType>,
    /// The original asset class from the game. Used for granular filtering.
    pub item_class: String,
    /// Physical base width in game units.
    pub width: f64,
}

/// Represents the mode of transportation for a line or stop.
///
/// **Serialization Rule:** Serializes as `PascalCase` to match the TS union.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum TransitMode {
    Bus,
    Tram,
    Train,
    Metro,
    CableCar,
    Monorail,
    Ferry,
    Blimp,
    Trolleybus,
    /// Graceful fallback variant for unrecognized transportation types (e.g., from future DLCs).
    /// Ensures the parser never throws a fatal error for unknown transit assets.
    Unknown,
}

/// Represents a complete public transportation line, including its predefined route and stops.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransitLine {
    pub id: String,
    pub name: String,
    pub mode: TransitMode,
    /// Hexadecimal color string defined in-game (e.g., `"#FF6600"`).
    pub color: String,
    pub stops: Vec<TransitStop>,
    /// The complete, pre-calculated route geometry.
    pub route: Vec<PathSegment>,
}

/// Represents a public transportation stop or station.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransitStop {
    pub id: String,
    pub mode: TransitMode,
    pub position: Vec3,
    pub name: String,
}

/// Represents a segment of a pre-calculated transit route.
///
/// **CRITICAL INVARIANT:** The game engine pre-calculates all transit paths.
/// No pathfinding logic should be implemented in Vellum. Simply traverse
/// the `segment_ids` sequentially.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathSegment {
    /// Ordered list of `RoadSegment` IDs that make up this portion of the route.
    pub segment_ids: Vec<String>,
}

/// Represents a building asset with its physical footprint.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Building {
    pub id: String,
    pub position: Vec3,
    /// The original asset class, used to filter out decorative entities like `"Beautification Item"`.
    pub item_class: String,
    /// Polygon vertices defining the building's physical boundaries in game units.
    pub footprint: Vec<Vec3>,
}

/// Represents a cell of vegetation/tree cover.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForestCell {
    pub x: f64,
    pub z: f64,
    /// Normalized density of the forest cover (0.0 to 1.0).
    pub density: f64,
}

/// Represents a zoned district with custom boundaries.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct District {
    pub id: String,
    pub name: String,
    /// Polygon vertices defining the perimeter of the district in game units.
    pub boundary: Vec<Vec3>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn way_type_serializes_pascalcase() {
        // P2 fix: WayType must serialize as PascalCase to match the TypeScript union
        let json = serde_json::to_value(WayType::Road).expect("serialization must not fail");
        assert_eq!(json, "Road");

        let json = serde_json::to_value(WayType::Highway).expect("serialization must not fail");
        assert_eq!(json, "Highway");

        let json = serde_json::to_value(WayType::None).expect("serialization must not fail");
        assert_eq!(json, "None");
    }

    #[test]
    fn transit_mode_serializes_pascalcase() {
        // P2 fix: TransitMode must serialize as PascalCase to match the TypeScript union
        let json = serde_json::to_value(TransitMode::Bus).expect("serialization must not fail");
        assert_eq!(json, "Bus");

        let json =
            serde_json::to_value(TransitMode::CableCar).expect("serialization must not fail");
        assert_eq!(json, "CableCar");

        let json = serde_json::to_value(TransitMode::Unknown).expect("serialization must not fail");
        assert_eq!(json, "Unknown");
    }

    #[test]
    fn road_segment_way_type_is_typed_vec() {
        let segment = RoadSegment {
            id: "s1".to_string(),
            start_node_id: "n1".to_string(),
            end_node_id: "n2".to_string(),
            way_type: vec![WayType::Road, WayType::Elevated],
            item_class: "Basic Road".to_string(),
            width: 16.0,
        };
        let json = serde_json::to_value(&segment).expect("serialization must not fail");
        assert_eq!(json["wayType"][0], "Road");
        assert_eq!(json["wayType"][1], "Elevated");
    }

    #[test]
    fn transit_line_mode_is_typed_enum() {
        let stop = TransitStop {
            id: "stop-1".to_string(),
            mode: TransitMode::Metro,
            position: Vec3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            name: "Central".to_string(),
        };
        let json = serde_json::to_value(&stop).expect("serialization must not fail");
        assert_eq!(json["mode"], "Metro");
    }
}
