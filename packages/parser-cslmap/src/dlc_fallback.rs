use crate::types::road::RoadHierarchy;

/// Road hierarchy derived purely from physical width when `ItemClass` is unknown.
/// Thresholds: ≤12 → Small, ≤24 → Medium, >24 → Large.
#[must_use]
pub fn classify_by_width(width: f64) -> RoadHierarchy {
    if width < 0.0 {
        return RoadHierarchy::Small;
    }
    #[allow(clippy::if_not_else)]
    if width <= 12.0 {
        RoadHierarchy::Small
    } else if width <= 24.0 {
        RoadHierarchy::Medium
    } else {
        RoadHierarchy::Large
    }
}

/// Returns true for `ItemClass` values known to the base game and major DLCs.
/// Sources: CS1 base game + Snowfall, After Dark, Mass Transit, etc.
#[must_use]
pub fn is_known_item_class(item_class: &str) -> bool {
    matches!(
        item_class,
        // Roads — base game
        "Basic Road"
            | "Basic Road Elevated"
            | "Basic Road Underground"
            | "Basic Road Bridge"
            | "Small Road"
            | "Small Road Elevated"
            | "Small Road Underground"
            | "Medium Road"
            | "Medium Road Elevated"
            | "Medium Road Underground"
            | "Large Road"
            | "Large Road Elevated"
            | "Large Road Underground"
            | "Highway"
            | "Highway Ramp"
            | "Highway Elevated"
            | "Highway Barrier"
            // Pedestrian
            | "Pedestrian Way"
            | "Pedestrian Path"
            // Transit infrastructure
            | "Bus Line"
            | "Tram Line"
            | "Tram Track"
            | "Tram Track Elevated"
            | "Train Track"
            | "Train Track Elevated"
            | "Metro Track"
            | "Metro Track Elevated"
            | "Monorail Track"
            | "Monorail Track Elevated"
            | "Cable Car Line"
            | "Ferry Line"
            // Utility
            | "Electricity Wire"
            | "Dam Node"
            // Landscaping / service
            | "Alley Road"
            | "Gravel Road"
            | "Landscaping Canal"
            | "Landscaping Flood Wall"
            // Maritime infrastructure
            | "Ferry Path"
            // Pedestrian infrastructure
            | "Pedestrian Bridge"
            // Invisible / virtual paths
            | "Airplane Path"
            | "Ship Path"
            // Beautification (buildings, not roads — filtered at render time)
            | "Beautification Item"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_small_road() {
        assert_eq!(classify_by_width(8.0), RoadHierarchy::Small);
        assert_eq!(classify_by_width(12.0), RoadHierarchy::Small);
    }

    #[test]
    fn classify_medium_road() {
        assert_eq!(classify_by_width(12.1), RoadHierarchy::Medium);
        assert_eq!(classify_by_width(16.0), RoadHierarchy::Medium);
        assert_eq!(classify_by_width(24.0), RoadHierarchy::Medium);
    }

    #[test]
    fn classify_large_road() {
        assert_eq!(classify_by_width(24.1), RoadHierarchy::Large);
        assert_eq!(classify_by_width(30.0), RoadHierarchy::Large);
    }

    #[test]
    fn known_item_class_recognized() {
        assert!(is_known_item_class("Basic Road"));
        assert!(is_known_item_class("Highway"));
        assert!(is_known_item_class("Bus Line"));
    }

    #[test]
    fn unknown_item_class_not_recognized() {
        assert!(!is_known_item_class("NExtSmall4LRoad"));
        assert!(!is_known_item_class("SomeMod Highway"));
        assert!(!is_known_item_class(""));
    }
}
