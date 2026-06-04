//! Spike tool: parse a .cslmap fixture and export road segments as GeoJSON.
//!
//! Applies the equatorial coordinate transform (CS1 ±8640 → WGS-84 at [0°,0°])
//! identical to `packages/renderer-webgl/src/coordinate-transform.ts`.
//!
//! # Usage
//!
//! ```bash
//! # From repo root — outputs to packages/parser-cslmap/fixtures/altavento.geojson
//! cargo run --example export_geojson --package parser-cslmap
//!
//! # Verify with jq
//! jq '.features | length' packages/parser-cslmap/fixtures/altavento.geojson
//! jq '[.features[] | select(.properties.itemClass == "Bus Line")] | length' \
//!     packages/parser-cslmap/fixtures/altavento.geojson
//! ```

use parser_cslmap::parser::parse_cslmap_bytes;
use serde_json::{json, Value};
use std::path::PathBuf;

// ─── Coordinate transform (mirrors coordinate-transform.ts) ───────────────────

const CS1_WORLD_HALF: f64 = 8640.0;
const CS1_WORLD_SIZE: f64 = CS1_WORLD_HALF * 2.0;
/// 17280 m / 111195 m·deg⁻¹ ≈ 0.15541° — treating 1 CS1 unit = 1 m
const CS1_EXTENT_DEG: f64 = CS1_WORLD_SIZE / 111_195.0;
const CS1_HALF_EXTENT_DEG: f64 = CS1_EXTENT_DEG / 2.0;

/// Returns `[longitude, latitude]` (GeoJSON / RFC 7946 order).
///
/// ⚠ Z-axis inversion: CS1 +Z = south, geographic +lat = north.
fn cs_to_geo_array(x: f64, z: f64) -> [f64; 2] {
    let lng = (x / CS1_WORLD_HALF) * CS1_HALF_EXTENT_DEG;
    let lat = -(z / CS1_WORLD_HALF) * CS1_HALF_EXTENT_DEG;
    [lng, lat]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

fn main() {
    // ── 1. Locate fixture ──────────────────────────────────────────────────────
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let fixture_path = manifest_dir.join("fixtures").join("altavento.cslmap");

    eprintln!("Reading fixture: {}", fixture_path.display());
    let bytes = std::fs::read(&fixture_path)
        .unwrap_or_else(|e| panic!("Failed to read {}: {e}", fixture_path.display()));

    // ── 2. Parse ───────────────────────────────────────────────────────────────
    let t_parse_start = std::time::Instant::now();
    let city = parse_cslmap_bytes(&bytes).unwrap_or_else(|e| panic!("Parse failed: {e:?}"));
    let parse_ms = t_parse_start.elapsed().as_millis();

    eprintln!("Parsed '{}' in {}ms", city.city_name, parse_ms);
    eprintln!("  road_nodes:    {}", city.road_nodes.len());
    eprintln!("  road_segments: {}", city.road_segments.len());

    // ── 3. Verify no Bus Line segments leaked through the parser filter ────────
    let bus_line_count = city
        .road_segments
        .iter()
        .filter(|s| s.item_class == "Bus Line")
        .count();
    if bus_line_count > 0 {
        eprintln!("ERROR: {bus_line_count} Bus Line segment(s) found — parser filter broken!");
        std::process::exit(1);
    }
    eprintln!("  Bus Line segments: 0 ✓");

    // ── 4. Build node lookup ───────────────────────────────────────────────────
    let node_by_id: std::collections::HashMap<&str, &parser_cslmap::city_data::RoadNode> =
        city.road_nodes.iter().map(|n| (n.id.as_str(), n)).collect();

    // ── 5. Convert road segments to GeoJSON features ──────────────────────────
    let t_tile_start = std::time::Instant::now();
    let mut features: Vec<Value> = Vec::with_capacity(city.road_segments.len());
    let mut skipped = 0usize;

    for segment in &city.road_segments {
        let Some(start_node) = node_by_id.get(segment.start_node_id.as_str()) else {
            skipped += 1;
            continue;
        };
        let Some(end_node) = node_by_id.get(segment.end_node_id.as_str()) else {
            skipped += 1;
            continue;
        };

        // Build coordinate sequence: start → intermediate points → end
        let mut coords: Vec<Value> = Vec::with_capacity(segment.points.len() + 2);

        let [lng, lat] = cs_to_geo_array(start_node.position.x, start_node.position.z);
        coords.push(json!([lng, lat]));

        for p in &segment.points {
            let [lng, lat] = cs_to_geo_array(p.x, p.z);
            coords.push(json!([lng, lat]));
        }

        let [lng, lat] = cs_to_geo_array(end_node.position.x, end_node.position.z);
        coords.push(json!([lng, lat]));

        features.push(json!({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": coords
            },
            "properties": {
                "id": segment.id,
                "itemClass": segment.item_class,
                "width": segment.width,
                "wayType": segment.way_type
                    .iter()
                    .map(|w| format!("{w:?}"))
                    .collect::<Vec<_>>()
                    .join(",")
            }
        }));
    }

    let conversion_ms = t_tile_start.elapsed().as_millis();
    eprintln!(
        "  GeoJSON conversion: {}ms ({} features, {} skipped)",
        conversion_ms,
        features.len(),
        skipped
    );

    // ── 6. Serialize ───────────────────────────────────────────────────────────
    let geojson = json!({
        "type": "FeatureCollection",
        "features": features
    });

    let output_path = manifest_dir.join("fixtures").join("altavento.geojson");
    let json_str = serde_json::to_string_pretty(&geojson).expect("GeoJSON serialisation failed");
    std::fs::write(&output_path, &json_str)
        .unwrap_or_else(|e| panic!("Failed to write output: {e}"));

    // ── 7. Report ──────────────────────────────────────────────────────────────
    eprintln!();
    eprintln!("✓ Output: {}", output_path.display());
    eprintln!("  File size: {:.1} KB", json_str.len() as f64 / 1024.0);
    eprintln!();
    eprintln!("Verify with:");
    eprintln!("  jq '.features | length' {}", output_path.display());
    eprintln!(
        "  jq '[.features[] | select(.properties.itemClass == \"Bus Line\")] | length' {}",
        output_path.display()
    );
    eprintln!();
    eprintln!("SPIKE GATE CHECKLIST:");
    eprintln!(
        "  [{}] AC-GEOJSON-001: features > 0",
        if features.is_empty() { "✗" } else { "✓" }
    );
    eprintln!("  [✓] AC-GEOJSON-002: Bus Line count = 0");
    eprintln!("  [ ] AC-GEOJSON-003: MapLibre renders the network (Bloque B)");
    eprintln!("  [ ] AC-GEOJSON-004: FPS > 30 during pan/zoom (Bloque B)");
}
