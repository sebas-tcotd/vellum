use parser_cslmap::city_data::CitySource;
use parser_cslmap::vellummap::parse_vellummap_bytes;

#[test]
fn bundled_aurelia_opens_with_substantive_city_content() {
    let bytes = include_bytes!("../resources/sample-city/city.vellummap");
    let city = parse_vellummap_bytes(bytes).expect("bundled sample must pass the strict reader");
    assert_eq!(city.city_name, "Aurelia del Delta");
    assert_eq!(city.source, CitySource::Vellummap);
    assert!(city.road_nodes.len() > 100);
    assert!(city.road_segments.len() > 100);
    assert!(city.buildings.len() > 10);
    assert!(city.coastline.lines.iter().any(|line| line.len() > 10));
    assert!(!city.land_polygon.is_empty());
    assert!(city.bounds.sea_level > 0.0);
    assert!(!city.transit_lines.is_empty());
    assert!(city.transit_lines.iter().any(|line| line.stops.len() >= 2));
}
