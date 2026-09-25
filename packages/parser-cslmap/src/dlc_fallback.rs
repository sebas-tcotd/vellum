/// Returns true for `ItemClass` values known to the base game and major DLCs.
/// Sources: CS1 base game + Snowfall, After Dark, Mass Transit, etc.
#[must_use]
pub fn is_known_item_class(item_class: &str) -> bool {
    // Every `* Line` class is a virtual transit connector — the same suffix rule
    // the `.cslmap` handler and `@vellum/core`'s renderer classification apply.
    item_class.ends_with(" Line")
        || matches!(
            item_class,
            // Roads — base game
            "Basic Road"
            | "Basic Road Elevated"
            | "Basic Road Bridge"
            | "Small Road"
            | "Small Road Elevated"
            | "Medium Road"
            | "Medium Road Elevated"
            | "Large Road"
            | "Large Road Elevated"
            | "Highway"
            | "Highway Ramp"
            | "Highway Elevated"
            | "Highway Barrier"
            // Tunnels. CS1 names these `... Tunnel`, never `... Underground`:
            // six real cities yield 927 tunnel segments and zero `Underground`
            // ones. Mirrors the tunnel keys of `ITEM_CLASS_TIER` in
            // `@vellum/core/road-classification`.
            | "Small Road Tunnel"
            | "Medium Road Tunnel"
            | "Large Road Tunnel"
            | "Highway Tunnel"
            | "Train Track Tunnel"
            | "Metro Track Tunnel"
            | "Pedestrian Tunnel"
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
            | "Blimp Path"
            | "Blimp Line"
            | "Ship Path"
            // Beautification (buildings, not roads — filtered at render time)
            | "Beautification Item"
            // Classes only the native `.vellummap` carries as segments: the
            // `.cslmap` exporter filtered them out. Each has a decided render
            // treatment in `@vellum/core/road-classification`.
            | "Pedestrian Street"
            | "Airplane Runway"
            | "Airport Concourse"
            | "Bus Stop"
            | "Ship Dock"
            | "Landscaping Quay"
            | "Transport Connection"
            | "Water Pipe"
            // Vanilla ways the renderer already treats (cable car) or excludes
            // (helicopter), which native documents can carry as segments.
            | "CableCar Path"
            | "Helicopter Path"
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_item_class_recognized() {
        assert!(is_known_item_class("Basic Road"));
        assert!(is_known_item_class("Highway"));
        assert!(is_known_item_class("Bus Line"));
        assert!(is_known_item_class("Blimp Path"));
    }

    /// Classes a native `.vellummap` carries as segments. Dropping one from the
    /// list would flood every normal native open with parse warnings.
    #[test]
    fn native_segment_classes_are_known() {
        for class in [
            "Pedestrian Street",
            "Airplane Runway",
            "Airport Concourse",
            "Bus Stop",
            "Ship Dock",
            "Landscaping Quay",
            "Transport Connection",
            "Water Pipe",
            "CableCar Path",
            "Helicopter Path",
            "Metro Line",
            "Airplane Line",
            "Some Future Line",
        ] {
            assert!(is_known_item_class(class), "{class} should be known");
        }
    }

    #[test]
    fn unknown_item_class_not_recognized() {
        assert!(!is_known_item_class("NExtSmall4LRoad"));
        assert!(!is_known_item_class("SomeMod Highway"));
        assert!(!is_known_item_class(""));
    }

    /// Tunnels used to warn as unknown assets: 927 spurious warnings across the
    /// six real-city fixtures, because the list said `Underground`.
    #[test]
    fn tunnels_are_known_and_underground_is_not_the_vocabulary() {
        for class in [
            "Small Road Tunnel",
            "Medium Road Tunnel",
            "Large Road Tunnel",
            "Highway Tunnel",
            "Train Track Tunnel",
            "Metro Track Tunnel",
            "Pedestrian Tunnel",
        ] {
            assert!(is_known_item_class(class), "{class} should be known");
        }
        assert!(!is_known_item_class("Small Road Underground"));
    }
}
