//! Opens a `.vellummap` with the strict reader and prints what it holds, or exits
//! with the reader's error. Used to validate the files Vellum Bridge exports
//! (Story 5.3) and the synthetic ones its .NET harness writes.
//!
//! Besides the `CityData` counts it prints each module with its codec and the
//! water depth provenance, read straight from the zip once the reader accepted it.
//!
//! # Usage
//!
//! ```bash
//! cargo run --example validate_vellummap --package parser-cslmap -- city.vellummap
//! ```

use parser_cslmap::vellummap::parse_vellummap_bytes;
use serde_json::Value;
use std::io::{Cursor, Read};

fn main() {
    let mut args = std::env::args().skip(1);
    let (Some(input), None) = (args.next(), args.next()) else {
        eprintln!("usage: validate_vellummap <file.vellummap>");
        std::process::exit(2);
    };

    let bytes = match std::fs::read(&input) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("read {input}: {e}");
            std::process::exit(1);
        }
    };

    let city = match parse_vellummap_bytes(&bytes) {
        Ok(city) => city,
        Err(e) => {
            eprintln!("{input}: invalid .vellummap: {e}");
            std::process::exit(1);
        }
    };

    let stops: usize = city.transit_lines.iter().map(|l| l.stops.len()).sum();
    println!("{input}: valid ({} bytes)", bytes.len());
    println!("city={} generatedAt={}", city.city_name, city.generated_at);
    println!(
        "roadNodes={} roadSegments={} transitLines={} stops={} buildings={} districts={} parks={} forestCells={}",
        city.road_nodes.len(),
        city.road_segments.len(),
        city.transit_lines.len(),
        stops,
        city.buildings.len(),
        city.districts.len(),
        city.park_areas.len(),
        city.forest_cells.len(),
    );

    // The reader already validated the container, so these reads only report.
    let manifest = match read_json(&bytes, "manifest.json") {
        Ok(value) => value,
        Err(e) => {
            eprintln!("{input}: cannot re-read manifest.json: {e}");
            std::process::exit(1);
        }
    };
    let modules = manifest["modules"]
        .as_array()
        .map_or(&[][..], Vec::as_slice);
    let listed: Vec<String> = modules
        .iter()
        .map(|m| {
            format!(
                "{} ({})",
                m["id"].as_str().unwrap_or("?"),
                m["codec"].as_str().unwrap_or("?")
            )
        })
        .collect();
    println!("modules: {}", listed.join(", "));

    match read_json(&bytes, "water.json") {
        Ok(water) => match water.get("depth") {
            Some(depth) => println!(
                "water: seaLevel={} depth=yes simulationPaused={}{}",
                water["seaLevel"],
                depth["simulationPaused"],
                depth
                    .get("frameIndex")
                    .map_or_else(String::new, |f| format!(" frameIndex={f}")),
            ),
            None => println!("water: seaLevel={} depth=no", water["seaLevel"]),
        },
        Err(e) => {
            eprintln!("{input}: cannot re-read water.json: {e}");
            std::process::exit(1);
        }
    }
}

/// Reads and parses one JSON entry of the zip.
fn read_json(bytes: &[u8], name: &str) -> Result<Value, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut entry = archive.by_name(name).map_err(|e| e.to_string())?;
    let mut text = Vec::new();
    entry.read_to_end(&mut text).map_err(|e| e.to_string())?;
    serde_json::from_slice(&text).map_err(|e| e.to_string())
}
