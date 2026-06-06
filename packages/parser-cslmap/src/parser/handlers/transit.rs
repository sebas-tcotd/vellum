pub fn parse_transit_mode(s: &str) -> crate::city_data::TransitMode {
    use crate::city_data::TransitMode;
    match s {
        "Bus" => TransitMode::Bus,
        "Tram" => TransitMode::Tram,
        "Train" => TransitMode::Train,
        "Metro" => TransitMode::Metro,
        "CableCar" => TransitMode::CableCar,
        "Monorail" => TransitMode::Monorail,
        "Ferry" => TransitMode::Ferry,
        "Blimp" => TransitMode::Blimp,
        "Trolleybus" => TransitMode::Trolleybus,
        _ => TransitMode::Unknown,
    }
}
