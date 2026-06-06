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

/// A ring of WGS-84 `[longitude, latitude]` coordinate pairs forming a polygon boundary.
/// Coordinates use the south-up convention: positive Z maps to positive latitude.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TerrainRing(pub Vec<[f64; 2]>);

/// A single terrain polygon with an exterior boundary and optional interior holes.
/// Holes represent inland water bodies (rivers, lakes) cut out of the landmass.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerrainPolygon {
    /// Outer boundary ring in WGS-84 `[lng, lat]`.
    pub exterior: TerrainRing,
    /// Interior rings (holes) for inland water bodies.
    pub holes: Vec<TerrainRing>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerrainIsoline {
    pub elevation: f64,
    /// Un arreglo de líneas. Cada línea es un arreglo de coordenadas [lng, lat]
    pub lines: Vec<Vec<[f64; 2]>>,
}

/// An elevation isoband covering a `[elevation_min, elevation_max)` range in raw game units.
/// Only land cells (above sea level, not covered by inland water) are included.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerrainBand {
    /// Lower bound of this elevation range (inclusive), in raw game elevation units.
    pub elevation_min: f64,
    /// Upper bound of this elevation range (exclusive), in raw game elevation units.
    pub elevation_max: f64,
    /// Polygon geometry for this elevation band.
    pub polygons: Vec<TerrainPolygon>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CityData {
    pub city_name: String,
    pub file_name: String,
    pub generated_at: String,
    pub bounds: MapBounds,
    /// Vectorized landmass polygon in WGS-84. Holes represent inland water bodies.
    pub land_polygon: Vec<TerrainPolygon>,

    pub contour_lines: Vec<TerrainIsoline>,

    /// Vectorized inland water bodies (rivers and lakes) in WGS-84. Rendered above `land_polygon`.
    pub inland_water_polygons: Vec<TerrainPolygon>,
    /// Elevation isobands for the optional terrain-shading layer, in WGS-84.
    //pub terrain_bands: Vec<TerrainBand>,
    /// Base64-encoded PNG data URL (`data:image/png;base64,…`) of the baked terrain texture.
    /// 1081×1081 RGBA pixels: elevation-tinted land with baked contour lines; water = transparent.
    pub terrain_texture: String,
    pub road_nodes: Vec<RoadNode>,
    /// Physical road segments. Bus Line virtual connectors are pre-filtered out.
    pub road_segments: Vec<RoadSegment>,
    pub transit_lines: Vec<TransitLine>,
    pub buildings: Vec<Building>,
    pub forest_cells: Vec<ForestCell>,
    pub districts: Vec<District>,
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
