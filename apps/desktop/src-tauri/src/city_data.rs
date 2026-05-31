// All domain types are canonical in parser-cslmap — re-exported here for src-tauri.
pub use parser_cslmap::city_data::*;

#[cfg(test)]
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
        let json =
            serde_json::to_value(TransitMode::Unknown).expect("serialization must not fail");
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
            points: vec![],
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
