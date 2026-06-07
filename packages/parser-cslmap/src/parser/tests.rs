// ─── Tests ────────────────────────────────────────────────────────────────────

#![allow(clippy::expect_used)]

#[cfg(test)]
use super::*;

// AC1: minimal-valid.cslmap → valid CityData, no errors, city_name correct.
// This fixture has 3 terrain cells (all inland water due to res > sea_level),
// so land_polygon may be empty — that is correct behavior for this fixture.
#[test]
fn parses_minimal_valid_cslmap() {
    let bytes = include_bytes!("../../fixtures/minimal-valid.cslmap");
    let result = parse_cslmap_bytes(bytes);
    assert!(result.is_ok(), "expected Ok, got: {result:?}");
    let city = result.expect("already checked");
    assert_eq!(city.city_name, "Test City");
    // Terrain vectors are present (even if empty for this small fixture).
    assert!(city.land_polygon.len() < usize::MAX);
    assert!(city.inland_water_polygons.len() < usize::MAX);
    assert!(city.contour_lines.len() < usize::MAX);
}

// AC3 + Gotcha 6: Bus Line excluded from road_segments; transit_lines populated
#[test]
fn bus_line_excluded_from_road_segments() {
    let bytes = include_bytes!("../../fixtures/with-transit.cslmap");
    let result = parse_cslmap_bytes(bytes);
    assert!(result.is_ok(), "expected Ok, got: {result:?}");
    let city = result.expect("already checked");
    let has_bus_line = city
        .road_segments
        .iter()
        .any(|s| s.item_class == "Bus Line");
    assert!(!has_bus_line, "Bus Line must not appear in road_segments");
    assert!(!city.transit_lines.is_empty(), "expected transit lines");
}

// Bus Line route reconstruction: each transit line assembles its full route from
// per-stop-pair Bus Line virtual segs, keyed by (sn, en). Verifies with Altavento
// fixture (36 Bus Line segs across 4 Trans: 16+20 stop pairs).
// Uses the 13MB altavento fixture + full vectorization; run with --release.
#[test]
#[ignore = "large fixture + vectorization; run with: cargo test -p parser-cslmap --release -- --ignored"]
fn transit_routes_assembled_from_stop_pairs() {
    let bytes = include_bytes!("../../fixtures/altavento.cslmap");
    let result = parse_cslmap_bytes(bytes);
    assert!(result.is_ok(), "expected Ok, got: {result:?}");
    let city = result.expect("already checked");
    assert!(!city.transit_lines.is_empty(), "expected transit lines");
    // Every transit line with stops must have a non-empty route
    for line in &city.transit_lines {
        if !line.stops.is_empty() {
            let total_segs: usize = line.route.iter().map(|p| p.segment_ids.len()).sum();
            assert!(
                total_segs > 1,
                "transit line '{}' has {} stops but only {} route segments — expected full route",
                line.name,
                line.stops.len(),
                total_segs,
            );
        }
    }
}

// AC5 + Gotcha 4: debug-format fixture → no duplicate leading segment in route
#[test]
fn debug_format_has_no_duplicate_leading_segment() {
    let bytes = include_bytes!("../../fixtures/with-transit-paths-debug.cslmap");
    let result = parse_cslmap_bytes(bytes);
    assert!(result.is_ok(), "expected Ok, got: {result:?}");
    let city = result.expect("already checked");
    for line in &city.transit_lines {
        for path in &line.route {
            if path.segment_ids.len() >= 2 {
                assert_ne!(
                    path.segment_ids[0], path.segment_ids[1],
                    "duplicate leading segment must be removed in debug format"
                );
            }
        }
    }
}

// Story 2.5: corrupted.cslmap → PartialParse (XML started valid before error)
#[test]
fn corrupted_cslmap_returns_partial_parse_error() {
    let bytes = include_bytes!("../../fixtures/corrupted.cslmap");
    let result = parse_cslmap_bytes(bytes);
    assert!(
        matches!(result, Err(VellumError::PartialParse { .. })),
        "expected PartialParse error (XML was partially valid before corruption), got: {result:?}"
    );
}

// Story 2.5: XML that fails immediately (no root element processed) → InvalidFile
#[test]
fn totally_invalid_file_returns_invalid_file_error() {
    // Quick-xml fails on unclosed tags before any element is opened
    let bytes = b"<unclosed";
    let result = parse_cslmap_bytes(bytes);
    assert!(
        matches!(result, Err(VellumError::InvalidFile { .. })),
        "expected InvalidFile error for XML that fails before root, got: {result:?}"
    );
}

// Story 2.5: allow_partial mode on corrupted.cslmap → Ok with partial data
#[test]
fn allow_partial_returns_ok_with_partial_data() {
    let bytes = include_bytes!("../../fixtures/corrupted.cslmap");
    let result = parse_cslmap_bytes_lenient(bytes);
    assert!(
        result.is_ok(),
        "expected Ok in lenient mode, got: {result:?}"
    );
    let city = result.expect("already checked");
    assert_eq!(
        city.city_name, "Corrupted",
        "city_name should be populated from the valid section before corruption"
    );
}

// AC4 + Gotcha 7: unknown DLC assets → Ok with fallback (non-fatal)
#[test]
fn unknown_dlc_assets_returns_ok_with_fallback() {
    let bytes = include_bytes!("../../fixtures/unknown-dlc-assets.cslmap");
    let result = parse_cslmap_bytes(bytes);
    assert!(
        result.is_ok(),
        "expected Ok (DLC fallback non-fatal), got: {result:?}"
    );
}

// AC2 + Gotcha 5: [Deprecated] prefix stripped before WayType classification
#[test]
fn deprecated_prefix_stripped_in_way_type() {
    use crate::city_data::WayType;
    let types = handlers::roads::way_type_from_item_class("[Deprecated]Basic Road");
    assert!(
        matches!(types[0], WayType::Road),
        "expected Road, got {types:?}"
    );

    let types = handlers::roads::way_type_from_item_class("[Deprecated]Highway");
    assert!(
        matches!(types[0], WayType::Highway),
        "expected Highway, got {types:?}"
    );
}

#[test]
fn way_type_from_item_class_covers_main_cases() {
    use crate::city_data::WayType;
    let cases: &[(&str, WayType)] = &[
        ("Basic Road", WayType::Road),
        ("Medium Road Elevated", WayType::Road),
        ("Highway", WayType::Highway),
        ("Highway Elevated", WayType::Highway),
        ("Pedestrian Way", WayType::Pedestrian),
        ("Bicycle Lane", WayType::Bicycle),
    ];
    for (icls, expected) in cases {
        let types = handlers::roads::way_type_from_item_class(icls);
        assert!(
            std::mem::discriminant(&types[0]) == std::mem::discriminant(expected),
            "{icls}: expected {expected:?}, got {types:?}"
        );
    }

    // "Medium Road Elevated" → [Road, Elevated]
    let elevated = handlers::roads::way_type_from_item_class("Medium Road Elevated");
    assert!(
        elevated.iter().any(|t| matches!(t, WayType::Elevated)),
        "expected Elevated flag in {elevated:?}"
    );

    // Truly unknown (no road/highway/pedestrian/bicycle keyword) → [None]
    let unknown = handlers::roads::way_type_from_item_class("Electricity Wire");
    assert!(
        matches!(unknown[0], WayType::None),
        "expected None, got {unknown:?}"
    );
}

// Terrain CSV parsing: elev and res values are stored correctly in both grids
#[test]
fn terrain_csv_fills_grids() {
    let mut elev = Vec::new();
    let mut res = Vec::new();
    // Two entries: elev=50:res=0 and elev=200:res=80
    terrain::grid::parse_terrain_csv("50:0,200:80", &mut elev, &mut res);
    assert_eq!(elev.len(), 2);
    assert_eq!(res.len(), 2);
    assert!((elev[0] - 50.0).abs() < f64::EPSILON);
    assert!((elev[1] - 200.0).abs() < f64::EPSILON);
    assert!((res[1] - 80.0).abs() < f64::EPSILON);
}

// Terrain CSV grid overflow guard: entries beyond 1081×1081 are discarded
#[test]
fn terrain_csv_overflow_guard() {
    let mut elev = Vec::new();
    let mut res = Vec::new();
    let entry = "300:0";
    let total = 1081 * 1081 + 5;
    let csv = std::iter::repeat_n(entry, total)
        .collect::<Vec<_>>()
        .join(",");
    terrain::grid::parse_terrain_csv(&csv, &mut elev, &mut res);
    assert_eq!(
        elev.len(),
        1081 * 1081,
        "overflow entries must be discarded"
    );
}

// Color hex conversion — 8-digit format with alpha
#[test]
fn rgba_to_hex_formats_correctly() {
    assert_eq!(utils::rgba_to_hex(255, 102, 0, 255), "#FF6600FF");
    assert_eq!(utils::rgba_to_hex(44, 85, 191, 255), "#2C55BFFF");
    assert_eq!(utils::rgba_to_hex(0, 0, 0, 0), "#00000000");
}

// parse_cslmap_bytes transparently strips UTF-8 BOM
#[test]
fn parse_cslmap_bytes_strips_bom() {
    let mut with_bom: Vec<u8> = b"\xEF\xBB\xBF".to_vec();
    with_bom
        .extend_from_slice(b"<CSLExportXML version=\"4.1\"><City>BomCity</City></CSLExportXML>");
    let result = parse_cslmap_bytes(&with_bom);
    assert!(result.is_ok(), "BOM-prefixed input must parse: {result:?}");
    assert_eq!(result.expect("ok").city_name, "BomCity");
}

// Building footprint points use lowercase <p> — regression for b"P" vs b"p"
#[test]
fn building_footprint_parsed_from_lowercase_p_tags() {
    let xml = br#"<CSLExportXML version="4.1"><Buildings>
            <Buil id="1" name="Test Building" srv="Residential" subsrv="ResidentialLow" icls="Low Residential - Level2">
              <Points>
                <p x="100.0" y="10.0" z="200.0" />
                <p x="200.0" y="10.0" z="200.0" />
                <p x="200.0" y="10.0" z="300.0" />
                <p x="100.0" y="10.0" z="300.0" />
              </Points>
            </Buil>
          </Buildings></CSLExportXML>"#;
    let result = parse_cslmap_bytes(xml);
    assert!(result.is_ok(), "expected Ok: {result:?}");
    let city = result.expect("ok");
    assert_eq!(city.buildings.len(), 1, "expected one building");
    let footprint = &city.buildings[0].footprint;
    assert_eq!(
        footprint.len(),
        4,
        "footprint must have 4 vertices, got {}",
        footprint.len()
    );
    assert!((footprint[0].x - 100.0_f64).abs() < f64::EPSILON);
    assert!((footprint[0].z - 200.0_f64).abs() < f64::EPSILON);
}

// Transit line color defaults to #FFFFFFFF when <color> element is absent
#[test]
fn transit_line_color_defaults_when_absent() {
    let xml =
            b"<CSLExportXML version=\"4.1\"><Transports><Trans id=\"1\" name=\"Bus 1\" type=\"Bus\"></Trans></Transports></CSLExportXML>";
    let result = parse_cslmap_bytes(xml);
    assert!(result.is_ok(), "expected Ok: {result:?}");
    let city = result.expect("ok");
    assert_eq!(city.transit_lines.len(), 1);
    assert_eq!(city.transit_lines[0].color, "#FFFFFFFF");
}

#[test]
#[ignore = "requires large fixture; run manually with cargo test -- --ignored"]
fn perf_10mb_file() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/large-city.cslmap");
    assert!(
        std::path::Path::new(path).exists(),
        "Fixture not found: {path}. Create a ~10MB .cslmap file to enable this benchmark."
    );
    let bytes = std::fs::read(path).expect("read file");
    let start = std::time::Instant::now();
    let _ = parse_cslmap_bytes(&bytes); // BOM stripped internally
    let elapsed = start.elapsed();
    assert!(
        elapsed.as_millis() < 100,
        "Parser took {}ms, expected <100ms",
        elapsed.as_millis()
    );
}

#[test]
#[ignore = "manual only - validates against real .cslmap files in test-maps/"]
fn validate_real_altavento() {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../test-maps/Altavento-20260404-020217.cslmap"
    );
    let bytes = std::fs::read(path).expect("read altavento");
    let result = parse_cslmap_bytes(&bytes); // BOM stripped internally
    assert!(result.is_ok(), "Altavento parse failed: {result:?}");
    let city = result.expect("ok");
    eprintln!("city_name: {:?}", city.city_name);
    eprintln!("road_nodes: {}", city.road_nodes.len());
    eprintln!("road_segments: {}", city.road_segments.len());
    eprintln!("land_polygon polygons: {}", city.land_polygon.len());
    eprintln!(
        "inland_water_polygons: {}",
        city.inland_water_polygons.len()
    );
    eprintln!("terrain_bands: {}", city.contour_lines.len());
    eprintln!("transit_lines: {}", city.transit_lines.len());
    eprintln!("buildings: {}", city.buildings.len());
    eprintln!("districts: {}", city.districts.len());
    assert_eq!(city.city_name, "Altavento");
    assert!(city.road_nodes.len() > 1000, "expected many nodes");
    assert!(city.road_segments.len() > 1000, "expected many segments");
    let has_bus_line = city
        .road_segments
        .iter()
        .any(|s| s.item_class == "Bus Line");
    assert!(!has_bus_line, "Bus Line must not be in road_segments");
}
