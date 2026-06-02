// Canonical domain model — mirrors packages/core/src/city-data.ts
// src-tauri/src/city_data.rs re-exports from this module.

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MapBounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_z: f64,
    pub max_z: f64,
    pub sea_level: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CityData {
    pub city_name: String,
    pub file_name: String,
    pub generated_at: String,
    pub bounds: MapBounds,
    pub land_tiles: Vec<LandTile>,
    pub water_tiles: Vec<WaterTile>,
    pub road_nodes: Vec<RoadNode>,
    /// Physical road segments. Bus Line virtual connectors are pre-filtered out.
    pub road_segments: Vec<RoadSegment>,
    pub transit_lines: Vec<TransitLine>,
    pub buildings: Vec<Building>,
    pub forest_cells: Vec<ForestCell>,
    pub districts: Vec<District>,
}

/// Land and water tiles are always kept as separate arrays — never merged into a heightmap.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LandTile {
    /// Raw elevation value from the terrain CSV (not in game-unit meters).
    pub elevation: f64,
    /// Raw resolution (surface) value from the terrain CSV.
    pub resolution: u32,
    /// X-coordinate in world space, derived from grid index (origin -8640, step 16).
    pub x: f64,
    /// Z-coordinate in world space, derived from grid index (origin -8640, step 16).
    pub z: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WaterTile {
    /// Depth approximated as (`sea_level_raw` - `elevation_raw`).
    pub depth: f64,
    /// X-coordinate in world space, derived from grid index.
    pub x: f64,
    /// Z-coordinate in world space, derived from grid index.
    pub z: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoadNode {
    pub id: String,
    pub position: Vec3,
}

/// Serializes as `PascalCase` (default serde behavior) to match the TypeScript union.
/// Keep this enum in `PascalCase` — do not add #[`serde(rename_all)`].
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoadSegment {
    pub id: String,
    pub start_node_id: String,
    pub end_node_id: String,
    /// `WayType` classifications. Empty for real `CSLExportXML` segments (no `WayType` element).
    pub way_type: Vec<WayType>,
    pub item_class: String,
    pub width: f64,
    /// Bezier control points from the segment's `<Points>` element.
    pub points: Vec<Vec3>,
}

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
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransitLine {
    pub id: String,
    pub name: String,
    pub mode: TransitMode,
    pub color: String,
    pub stops: Vec<TransitStop>,
    pub route: Vec<PathSegment>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransitStop {
    pub id: String,
    pub mode: TransitMode,
    pub position: Vec3,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathSegment {
    pub segment_ids: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Building {
    pub id: String,
    /// Asset name as exported from the game.
    pub name: String,
    /// Anchor position derived from the first footprint point.
    pub position: Vec3,
    pub item_class: String,
    pub footprint: Vec<Vec3>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForestCell {
    pub x: f64,
    pub z: f64,
    pub density: f64,
}

/// Named city district.
/// The `.cslmap` format only exports a single position per district — no polygon
/// boundaries are available. Render as a label at `position`.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct District {
    pub id: String,
    pub name: String,
    /// Label anchor in world-space (first `<p>` element in the Dist XML node).
    pub position: Vec3,
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;

    #[test]
    fn way_type_serializes_pascalcase() {
        let json = serde_json::to_value(WayType::Road).expect("serialization must not fail");
        assert_eq!(json, "Road");
        let json = serde_json::to_value(WayType::Highway).expect("serialization must not fail");
        assert_eq!(json, "Highway");
        let json = serde_json::to_value(WayType::None).expect("serialization must not fail");
        assert_eq!(json, "None");
    }

    #[test]
    fn transit_mode_serializes_pascalcase() {
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
            points: vec![Vec3 {
                x: 1.0,
                y: 2.0,
                z: 3.0,
            }],
        };
        let json = serde_json::to_value(&segment).expect("serialization must not fail");
        assert_eq!(json["wayType"][0], "Road");
        assert_eq!(json["wayType"][1], "Elevated");
        assert_eq!(json["points"][0]["x"], 1.0);
        assert_eq!(json["points"][0]["y"], 2.0);
        assert_eq!(json["points"][0]["z"], 3.0);
    }
}
