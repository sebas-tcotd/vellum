use crate::city_data::WayType;

/// Derives `WayType` flags from an `item_class` string.
/// Strips `[Deprecated]` prefix (AC2 / Gotcha 5) before matching.
/// Returns a non-empty Vec — unknown items get `[None]`.
pub fn way_type_from_item_class(item_class: &str) -> Vec<WayType> {
    let s = item_class.trim_start_matches("[Deprecated]");

    if s.contains("Pedestrian") {
        return vec![WayType::Pedestrian];
    }
    if s.contains("Bicycle") {
        return vec![WayType::Bicycle];
    }

    let mut types = Vec::new();

    if s.contains("Highway") {
        types.push(WayType::Highway);
    } else if s.contains("Road") || s.contains("Alley") || s.contains("Gravel") {
        types.push(WayType::Road);
    }

    if s.contains("Elevated") {
        types.push(WayType::Elevated);
    }
    if s.contains("Underground") {
        types.push(WayType::Underground);
    }
    if s.contains("Bridge") {
        types.push(WayType::Bridge);
    }
    if s.contains("Tunnel") {
        types.push(WayType::Tunnel);
    }

    if types.is_empty() {
        types.push(WayType::None);
    }

    types
}
