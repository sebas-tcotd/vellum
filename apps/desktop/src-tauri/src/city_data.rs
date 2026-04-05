// apps/desktop/src-tauri/src/city_data.rs
// Mirrors de CityData TypeScript — producidos por el parser, serializados por serde al IPC

use serde::{Deserialize, Serialize};

/// Punto en espacio 3D del juego. `x` = este-oeste, `y` = elevación, `z` = norte-sur.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Bounds del mapa derivados del XML. Define el espacio de coordenadas válido.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MapBounds {
    pub min_x: f64,
    pub max_x: f64,
    pub min_z: f64,
    pub max_z: f64,
    /// Nivel de mar típico: 40. Todo `y < sea_level` es agua o subterráneo.
    pub sea_level: f64,
}

/// Modelo de dominio raíz que representa una ciudad parseada desde un `.cslmap`.
///
/// Inmutable una vez construido. Serializado como camelCase al cruzar el IPC.
/// Todos los `Vec<_>` pueden estar vacíos pero nunca son nulos.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CityData {
    pub city_name: String,
    pub file_name: String,
    /// Timestamp ISO 8601 de cuándo se generó el archivo.
    pub generated_at: String,
    pub bounds: MapBounds,
    pub land_tiles: Vec<LandTile>,
    pub water_tiles: Vec<WaterTile>,
    pub road_nodes: Vec<RoadNode>,
    /// Excluye segmentos `Bus Line` — son conectores virtuales filtrados por el parser.
    pub road_segments: Vec<RoadSegment>,
    pub transit_lines: Vec<TransitLine>,
    pub buildings: Vec<Building>,
    pub forest_cells: Vec<ForestCell>,
    pub districts: Vec<District>,
}

/// Celda de terreno seco con su nivel de elevación discreta (0–23).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LandTile {
    /// Nivel de elevación (0–23 en los 24 umbrales del juego).
    pub elevation: f64,
    pub x: f64,
    pub z: f64,
}

/// Celda de agua con su profundidad en unidades del juego.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WaterTile {
    pub depth: f64,
    pub x: f64,
    pub z: f64,
}

/// Nodo de intersección o extremo de un segmento vial.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoadNode {
    pub id: String,
    pub position: Vec3,
}

/// Clasificación de un segmento vial. Mirror del union TypeScript `WayType`.
/// Serializa como PascalCase para coincidir con el contrato IPC.
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

/// Segmento vial entre dos nodos con sus flags de clasificación.
/// Excluye siempre `icls="Bus Line"` — son conectores virtuales filtrados por el parser.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoadSegment {
    pub id: String,
    pub start_node_id: String,
    pub end_node_id: String,
    /// Flags combinables de clasificación del segmento.
    pub way_type: Vec<WayType>,
    /// Clase original del asset en el juego (para filtrado).
    pub item_class: String,
    /// Ancho en unidades del juego.
    pub width: f64,
}

/// Modo de transporte de una línea o parada. Mirror del union TypeScript `TransitMode`.
/// Serializa como PascalCase para coincidir con el contrato IPC.
/// `Unknown` actúa como fallback graceful para tipos no reconocidos.
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
    /// Fallback para tipos de transporte desconocidos — nunca producir error fatal.
    Unknown,
}

/// Línea de transporte público con su ruta completa pre-calculada y sus paradas.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransitLine {
    pub id: String,
    pub name: String,
    pub mode: TransitMode,
    /// Color hex asignado por el juego, p.ej. `"#FF6600"`.
    pub color: String,
    pub stops: Vec<TransitStop>,
    /// Ruta completa pre-calculada. No se necesita pathfinding.
    pub route: Vec<PathSegment>,
}

/// Parada de tránsito con posición geográfica y modo de transporte.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TransitStop {
    pub id: String,
    pub mode: TransitMode,
    pub position: Vec3,
    pub name: String,
}

/// Segmento de ruta pre-calculada: lista ordenada de IDs de `RoadSegment`.
/// Las rutas ya vienen calculadas en el `.cslmap` — no se necesita pathfinding en Vellum.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathSegment {
    /// IDs de `RoadSegment` en orden de recorrido.
    pub segment_ids: Vec<String>,
}

/// Edificio con su huella poligonal en coordenadas del juego.
/// `item_class` se usa para filtrar tipos excluidos (p.ej. `"Beautification Item"`).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Building {
    pub id: String,
    pub position: Vec3,
    /// Clase del asset en el juego. Usada para filtrar edificios excluidos.
    pub item_class: String,
    /// Polígono del edificio en coordenadas del juego.
    pub footprint: Vec<Vec3>,
}

/// Celda de vegetación con densidad normalizada (0.0–1.0).
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForestCell {
    pub x: f64,
    pub z: f64,
    /// Densidad de vegetación normalizada entre 0.0 (vacío) y 1.0 (denso).
    pub density: f64,
}

/// Distrito de la ciudad con su polígono de delimitación.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct District {
    pub id: String,
    pub name: String,
    /// Polígono de delimitación del distrito en coordenadas del juego.
    pub boundary: Vec<Vec3>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn way_type_serializes_pascalcase() {
        // P2 fix: WayType debe serializar como PascalCase para coincidir con el union TypeScript
        let json = serde_json::to_value(WayType::Road).expect("serialization must not fail");
        assert_eq!(json, "Road");

        let json = serde_json::to_value(WayType::Highway).expect("serialization must not fail");
        assert_eq!(json, "Highway");

        let json = serde_json::to_value(WayType::None).expect("serialization must not fail");
        assert_eq!(json, "None");
    }

    #[test]
    fn transit_mode_serializes_pascalcase() {
        // P2 fix: TransitMode debe serializar como PascalCase para coincidir con el union TypeScript
        let json = serde_json::to_value(TransitMode::Bus).expect("serialization must not fail");
        assert_eq!(json, "Bus");

        let json = serde_json::to_value(TransitMode::CableCar).expect("serialization must not fail");
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
            position: Vec3 { x: 0.0, y: 0.0, z: 0.0 },
            name: "Central".to_string(),
        };
        let json = serde_json::to_value(&stop).expect("serialization must not fail");
        assert_eq!(json["mode"], "Metro");
    }
}
