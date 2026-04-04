// apps/desktop/src-tauri/src/city_data.rs
// Mirrors de CityData TypeScript — producidos por el parser, serializados por serde al IPC

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
    pub road_segments: Vec<RoadSegment>,
    pub transit_lines: Vec<TransitLine>,
    pub buildings: Vec<Building>,
    pub forest_cells: Vec<ForestCell>,
    pub districts: Vec<District>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LandTile {
    pub elevation: f64,
    pub x: f64,
    pub z: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WaterTile {
    pub depth: f64,
    pub x: f64,
    pub z: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoadNode {
    pub id: String,
    pub position: Vec3,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoadSegment {
    pub id: String,
    pub start_node_id: String,
    pub end_node_id: String,
    pub way_type: Vec<String>,
    pub item_class: String,
    pub width: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransitLine {
    pub id: String,
    pub name: String,
    pub mode: String,
    pub color: String,
    pub stops: Vec<TransitStop>,
    pub route: Vec<PathSegment>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransitStop {
    pub id: String,
    pub mode: String,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct District {
    pub id: String,
    pub name: String,
    pub boundary: Vec<Vec3>,
}
