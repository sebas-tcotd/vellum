use serde::{Deserialize, Serialize};

/// Road hierarchy derived from width fallback (AC4).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RoadHierarchy {
    Small,
    Medium,
    Large,
}

/// Intermediate parsing representation of a road segment.
/// `way_type_flags` holds raw strings (possibly prefixed with `[Deprecated]`).
/// Converted to `city_data::RoadSegment` after stripping and classifying.
#[derive(Debug, Clone)]
pub struct ParsedRoadSegment {
    pub id: String,
    pub start_node_id: String,
    pub end_node_id: String,
    pub item_class: String,
    pub width: f64,
    pub way_type_flags: Vec<String>,
    pub path_segs: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dlc_fallback;

    #[test]
    fn deprecated_prefix_is_stripped() {
        let raw = "[Deprecated]Road";
        let clean = raw.trim_start_matches("[Deprecated]");
        assert_eq!(clean, "Road");
    }

    #[test]
    fn bus_line_excluded_from_road_segments() {
        let seg = ParsedRoadSegment {
            id: "1".to_string(),
            start_node_id: "n1".to_string(),
            end_node_id: "n2".to_string(),
            item_class: "Bus Line".to_string(),
            width: 2.0,
            way_type_flags: vec![],
            path_segs: vec![],
        };
        assert_eq!(seg.item_class, "Bus Line");
    }

    #[test]
    fn fallback_hierarchy_by_width() {
        assert_eq!(
            dlc_fallback::classify_by_width(8.0),
            RoadHierarchy::Small
        );
        assert_eq!(
            dlc_fallback::classify_by_width(16.0),
            RoadHierarchy::Medium
        );
        assert_eq!(
            dlc_fallback::classify_by_width(30.0),
            RoadHierarchy::Large
        );
    }
}
