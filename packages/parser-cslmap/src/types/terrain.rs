use serde::{Deserialize, Serialize};

/// Intermediate parsing type for a dry terrain cell.
/// Converted to `city_data::LandTile` when building CityData.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LandTile {
    pub elevation: f64,
    pub x: f64,
    pub z: f64,
}

/// Intermediate parsing type for a water cell.
/// LandTile and WaterTile arrays are always kept separate — never unified.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaterTile {
    pub depth: f64,
    pub x: f64,
    pub z: f64,
}
