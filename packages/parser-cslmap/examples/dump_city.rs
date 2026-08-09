//! Spike tool: parse a `.cslmap` and dump the resulting `CityData` as JSON, so the
//! TypeScript render pipeline can be exercised on real cities outside the Tauri app.
//!
//! `terrainDem` is stripped: it is a base64 PNG data URI worth tens of megabytes and
//! nothing downstream of the GeoJSON builders reads it.
//!
//! # Usage
//!
//! ```bash
//! cargo run --release --example dump_city --package parser-cslmap -- \
//!     ~/Desktop/san-rico.cslmap /tmp/san-rico.json
//! ```

use parser_cslmap::parser::parse_cslmap_bytes;
use serde_json::Value;

fn main() {
    let mut args = std::env::args().skip(1);
    let (Some(input), Some(output)) = (args.next(), args.next()) else {
        eprintln!("usage: dump_city <input.cslmap> <output.json>");
        std::process::exit(2);
    };

    let bytes = match std::fs::read(&input) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("read {input}: {e}");
            std::process::exit(1);
        }
    };

    let city = match parse_cslmap_bytes(&bytes) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("parse {input}: {e}");
            std::process::exit(1);
        }
    };

    let Ok(mut value) = serde_json::to_value(&city) else {
        eprintln!("serialize failed");
        std::process::exit(1);
    };
    if let Some(obj) = value.as_object_mut() {
        obj.insert("terrainDem".into(), Value::Null);
    }

    eprintln!(
        "elevMin={} elevMax={} domainRaw={} ({} m)",
        city.terrain_dem.elev_min,
        city.terrain_dem.elev_max,
        city.terrain_dem.elev_max - city.terrain_dem.elev_min,
        (city.terrain_dem.elev_max - city.terrain_dem.elev_min) / 64.0,
    );
    eprintln!(
        "roadNodes={} roadSegments={} buildings={} transitLines={} districts={}",
        city.road_nodes.len(),
        city.road_segments.len(),
        city.buildings.len(),
        city.transit_lines.len(),
        city.districts.len(),
    );

    if let Err(e) = std::fs::write(&output, value.to_string()) {
        eprintln!("write {output}: {e}");
        std::process::exit(1);
    }
    eprintln!("wrote {output}");
}
