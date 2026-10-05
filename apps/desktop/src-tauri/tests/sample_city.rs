use parser_cslmap::city_data::CitySource;
use parser_cslmap::vellummap::parse_vellummap_bytes;

#[test]
fn bundled_costa_tijuca_opens_with_substantive_city_content() {
    let bytes = include_bytes!("../resources/sample-city/city.vellummap");
    let city = parse_vellummap_bytes(bytes).expect("bundled sample must pass the strict reader");
    assert_eq!(city.city_name, "Costa Tijuca");
    assert_eq!(city.source, CitySource::Vellummap);
    assert!(city.road_nodes.len() > 100);
    assert!(city.road_segments.len() > 100);
    assert!(city.buildings.len() > 10);
    assert!(city.coastline.lines.iter().any(|line| line.len() > 10));
    assert!(!city.land_polygon.is_empty());
    assert!(city.bounds.sea_level > 0.0);
    assert_eq!(city.transit_lines.len(), 23);
    assert_eq!(city.districts.len(), 31);
    assert_eq!(city.park_areas.len(), 17);
}
