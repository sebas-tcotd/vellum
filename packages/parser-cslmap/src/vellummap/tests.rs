#![allow(clippy::expect_used, clippy::unwrap_used)]

use super::manifest::{
    parse_manifest, spec_of, CityInfo, Codec, GameInfo, Manifest, Producer, MODULES,
};
use super::modules::{
    BuildingsModule, DepthProvenance, DistrictDoc, DistrictsModule, ParkDoc, ParksModule, Position,
    RoadNodeDoc, RoadSegmentDoc, RoadsModule, TransitLineDoc, TransitModule, TransitStopDoc,
    WaterModule,
};
use super::read::{read_document, sha256_hex};
use super::write::{write_document, write_zip};
use super::*;
use crate::city_data::{CityData, CitySource};
use crate::parser::parse_cslmap_bytes;
use std::io::{Cursor, Read};
use std::path::PathBuf;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TERRAIN_CELLS: usize = 1081 * 1081;
const AREA_CELLS: usize = 900 * 900;

fn fixture(name: &str) -> Vec<u8> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures")
        .join(name);
    std::fs::read(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}

fn pos(x: f64, y: f64, z: f64) -> Position {
    Position { x, y, z }
}

/// A small, valid document with every optional Bridge extra: captured depth with
/// provenance, derived stop names, district and park grids.
#[allow(clippy::too_many_lines)]
fn bridge_document() -> Document {
    let mut terrain = vec![1000_u16; TERRAIN_CELLS];
    let mut water_mask = vec![0_u8; TERRAIN_CELLS];
    let mut water_depth = vec![0_u16; TERRAIN_CELLS];
    // A 20 × 20 lake in the middle of the map.
    for row in 530..550 {
        for col in 530..550 {
            let i = row * 1081 + col;
            terrain[i] = 900;
            water_mask[i] = 1;
            water_depth[i] = 200;
        }
    }
    let mut district_grid = vec![0_u8; AREA_CELLS * 8];
    district_grid[0] = 1; // cell 0, slot 0 → district 1
    district_grid[4] = 255; // its alpha
    let mut park_grid = vec![0_u8; AREA_CELLS * 8];
    park_grid[8] = 3; // cell 1, slot 0 → park 3
    park_grid[12] = 128;

    Document {
        manifest: Manifest {
            format: FORMAT.to_owned(),
            export_schema_version: EXPORT_SCHEMA_VERSION.to_owned(),
            snapshot_id: "0f8fad5b-d9cb-469f-a165-70867728950e".to_owned(),
            parent_snapshot_id: Some("7c9e6679-7425-40de-944b-e07fc1f90ae7".to_owned()),
            exported_at_utc: "2026-09-23T14:05:00Z".to_owned(),
            game_time: Some("2031-05-17T08:00:00".to_owned()),
            game: GameInfo {
                version: "1.21.1-f9".to_owned(),
                instance_id: Some("3f2504e0-4f89-11d3-9a0c-0305e82c3301".to_owned()),
            },
            producer: Producer {
                name: "Vellum Bridge".to_owned(),
                version: "0.5.0".to_owned(),
            },
            city: CityInfo {
                name: "Sample City".to_owned(),
            },
            modules: Vec::new(),
        },
        terrain,
        water: WaterModule {
            sea_level: 10.0,
            depth: Some(DepthProvenance {
                simulation_paused: true,
                frame_index: Some(123_456),
            }),
        },
        water_mask,
        water_depth: Some(water_depth),
        vegetation: vec![0; 512 * 512],
        roads: RoadsModule {
            nodes: vec![
                RoadNodeDoc {
                    source_id: 1,
                    position: pos(0.0, 70.0, 0.0),
                    elevation: 0,
                    underground: false,
                },
                RoadNodeDoc {
                    source_id: 2,
                    position: pos(100.0, 80.0, 0.0),
                    elevation: 10,
                    underground: false,
                },
            ],
            segments: vec![RoadSegmentDoc {
                source_id: 7,
                start_node_source_id: 1,
                end_node_source_id: 2,
                item_class: "Medium Road".to_owned(),
                width: 24.0,
                name: Some("Elm Street".to_owned()),
                points: vec![pos(0.0, 70.0, 0.0), pos(100.0, 80.0, 0.0)],
            }],
        },
        transit: TransitModule {
            lines: vec![TransitLineDoc {
                source_id: 4,
                name: "Line 4".to_owned(),
                transport_type: "Bus".to_owned(),
                color: "#FF6600FF".to_owned(),
                stops: vec![
                    TransitStopDoc {
                        source_id: 1,
                        position: pos(0.0, 70.0, 0.0),
                        name: Some("Main Street".to_owned()),
                        name_derived: Some(true),
                    },
                    TransitStopDoc {
                        source_id: 2,
                        position: pos(100.0, 80.0, 0.0),
                        name: None,
                        name_derived: None,
                    },
                ],
                route: vec![7],
            }],
        },
        buildings: BuildingsModule::default(),
        districts: DistrictsModule {
            districts: vec![DistrictDoc {
                source_id: 1,
                name: "Downtown".to_owned(),
                label_position: pos(50.0, 0.0, 50.0),
            }],
        },
        parks: ParksModule {
            parks: vec![ParkDoc {
                source_id: 3,
                name: "Zoo".to_owned(),
                label_position: pos(-50.0, 0.0, -50.0),
                park_type: Some("Zoo".to_owned()),
            }],
        },
        district_grid: Some(district_grid),
        park_grid: Some(park_grid),
    }
}

/// Every entry of a zip as `(path, decompressed bytes, codec)`.
fn entries(zip_bytes: &[u8]) -> Vec<(String, Vec<u8>, Codec)> {
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).unwrap();
    (0..archive.len())
        .map(|i| {
            let mut file = archive.by_index(i).unwrap();
            let codec = match file.compression() {
                zip::CompressionMethod::Stored => Codec::Stored,
                _ => Codec::Deflate,
            };
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).unwrap();
            (file.name().to_owned(), bytes, codec)
        })
        .collect()
}

fn rezip(entries: &[(String, Vec<u8>, Codec)]) -> Vec<u8> {
    let refs: Vec<(&str, &[u8], Codec)> = entries
        .iter()
        .map(|(p, b, c)| (p.as_str(), b.as_slice(), *c))
        .collect();
    write_zip(&refs).unwrap()
}

fn manifest_value(entries: &[(String, Vec<u8>, Codec)]) -> serde_json::Value {
    let (_, bytes, _) = entries.iter().find(|(p, _, _)| p == MANIFEST_PATH).unwrap();
    serde_json::from_slice(bytes).unwrap()
}

fn set_manifest(entries: &mut [(String, Vec<u8>, Codec)], manifest: &serde_json::Value) {
    let slot = entries
        .iter_mut()
        .find(|(p, _, _)| p == MANIFEST_PATH)
        .unwrap();
    slot.1 = serde_json::to_vec(manifest).unwrap();
}

/// Rewrites the manifest of a valid document.
fn with_manifest(zip_bytes: &[u8], edit: impl FnOnce(&mut serde_json::Value)) -> Vec<u8> {
    let mut entries = entries(zip_bytes);
    let mut manifest = manifest_value(&entries);
    edit(&mut manifest);
    set_manifest(&mut entries, &manifest);
    rezip(&entries)
}

/// Replaces a module's bytes; with `fix_hash`, also updates its manifest sha256
/// so that only the content rule under test is broken.
fn with_module(zip_bytes: &[u8], path: &str, bytes: Vec<u8>, fix_hash: bool) -> Vec<u8> {
    let mut entries = entries(zip_bytes);
    if fix_hash {
        let mut manifest = manifest_value(&entries);
        for module in manifest["modules"].as_array_mut().unwrap() {
            if module["path"] == path {
                module["sha256"] = sha256_hex(&bytes).into();
            }
        }
        set_manifest(&mut entries, &manifest);
    }
    entries.iter_mut().find(|(p, _, _)| p == path).unwrap().1 = bytes;
    rezip(&entries)
}

fn edit_json_module(
    zip_bytes: &[u8],
    path: &str,
    edit: impl FnOnce(&mut serde_json::Value),
) -> Vec<u8> {
    let (_, bytes, _) = entries(zip_bytes)
        .into_iter()
        .find(|(p, _, _)| p == path)
        .unwrap();
    let mut value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    edit(&mut value);
    with_module(zip_bytes, path, serde_json::to_vec(&value).unwrap(), true)
}

/// Overwrites the uncompressed size an entry declares, in both its local header
/// and the central directory, without touching its data.
fn patch_declared_size(zip_bytes: &[u8], path: &str, size: u32) -> Vec<u8> {
    let mut out = zip_bytes.to_vec();
    let name = path.as_bytes();
    let le16 = |b: &[u8], at: usize| usize::from(u16::from_le_bytes([b[at], b[at + 1]]));
    let mut patched = 0;
    let mut i = 0;
    while i + 4 <= out.len() {
        let sig = &out[i..i + 4];
        if sig == b"PK\x03\x04"
            && out[i + 30..].starts_with(name)
            && le16(&out, i + 26) == name.len()
        {
            out[i + 22..i + 26].copy_from_slice(&size.to_le_bytes());
            patched += 1;
        } else if sig == b"PK\x01\x02"
            && out[i + 46..].starts_with(name)
            && le16(&out, i + 28) == name.len()
        {
            out[i + 24..i + 28].copy_from_slice(&size.to_le_bytes());
            patched += 1;
        }
        i += 1;
    }
    assert_eq!(
        patched, 2,
        "expected a local and a central header for {path}"
    );
    out
}

/// Overwrites the first compressed bytes of an entry with `0xFF`: inflating it
/// now fails (a deflate block of reserved type), so an error that is *not* a read
/// error proves the entry was rejected before being inflated.
fn corrupt_entry_data(zip_bytes: &[u8], path: &str) -> Vec<u8> {
    let mut out = zip_bytes.to_vec();
    let name = path.as_bytes();
    let le16 = |b: &[u8], at: usize| usize::from(u16::from_le_bytes([b[at], b[at + 1]]));
    let at = (0..out.len() - 30)
        .find(|&i| {
            out[i..].starts_with(b"PK\x03\x04")
                && le16(&out, i + 26) == name.len()
                && out[i + 30..].starts_with(name)
        })
        .expect("local header");
    let data = at + 30 + name.len() + le16(&out, at + 28);
    for byte in &mut out[data..data + 8] {
        *byte = 0xFF;
    }
    out
}

/// Renames an entry in place (local and central headers), keeping the length.
fn rename_entry(zip_bytes: &[u8], from: &str, to: &str) -> Vec<u8> {
    assert_eq!(from.len(), to.len());
    let mut out = zip_bytes.to_vec();
    let mut i = 0;
    while i + from.len() <= out.len() {
        if out[i..].starts_with(from.as_bytes()) {
            out[i..i + to.len()].copy_from_slice(to.as_bytes());
        }
        i += 1;
    }
    out
}

#[track_caller]
fn assert_invalid(result: Result<CityData, VellumError>, needle: &str) {
    match result {
        Err(VellumError::InvalidFile { reason }) => assert!(
            reason.contains(needle),
            "expected an InvalidFile mentioning `{needle}`, got: {reason}"
        ),
        Err(other) => panic!("expected InvalidFile mentioning `{needle}`, got {other:?}"),
        Ok(_) => panic!("expected InvalidFile mentioning `{needle}`, got Ok"),
    }
}

fn bridge_zip() -> Vec<u8> {
    write_document(&bridge_document()).expect("the sample document is valid")
}

// ─── Module table ─────────────────────────────────────────────────────────────

#[test]
fn module_table_is_indexed_by_module_id() {
    for (index, spec) in MODULES.iter().enumerate() {
        assert_eq!(spec.id as usize, index, "{} is out of order", spec.name);
        assert_eq!(spec_of(spec.id).name, spec.name);
    }
    assert_eq!(MODULE_ORDER.len(), MODULES.len());
}

// ─── Parity (matrix: "Paridad") ───────────────────────────────────────────────

/// Every real fixture (plus the two small synthetic ones with numeric IDs):
/// `.cslmap` → converter → adapter gives the same `CityData` as the `.cslmap`
/// parser, except `fileName` and `generatedAt`. `generatedAt` is pinned instead:
/// it is the fixture's `<Generated>` read as UTC and written as RFC 3339.
#[test]
fn converted_fixtures_match_the_cslmap_city_data() {
    for (name, generated, generated_utc) in [
        (
            "altavento.cslmap",
            "4/4/2026 2:02:16 AM",
            "2026-04-04T02:02:16Z",
        ),
        (
            "aurelia-del-delta.cslmap",
            "3/28/2026 11:56:21 PM",
            "2026-03-28T23:56:21Z",
        ),
        (
            "fährimperium.cslmap",
            "6/10/2026 5:17:54 PM",
            "2026-06-10T17:17:54Z",
        ),
        (
            "island-hopping.cslmap",
            "6/10/2026 5:35:58 PM",
            "2026-06-10T17:35:58Z",
        ),
        (
            "pepper-lake.cslmap",
            "6/10/2026 5:26:15 PM",
            "2026-06-10T17:26:15Z",
        ),
        (
            "verkehrsbehebung.cslmap",
            "6/10/2026 5:41:10 PM",
            "2026-06-10T17:41:10Z",
        ),
        (
            "minimal-valid.cslmap",
            "1/1/2026 12:00:00 AM",
            "2026-01-01T00:00:00Z",
        ),
        (
            "unknown-dlc-assets.cslmap",
            "1/1/2026 12:00:00 AM",
            "2026-01-01T00:00:00Z",
        ),
    ] {
        let cslmap = fixture(name);
        let expected = parse_cslmap_bytes(&cslmap).expect("fixture must parse");
        let vellummap = cslmap_to_vellummap(&cslmap).expect("fixture must convert");
        let actual = parse_vellummap_bytes(&vellummap).expect("converted document must open");
        assert_eq!(
            expected.source,
            CitySource::Cslmap,
            "{name}: .cslmap source"
        );
        assert_eq!(
            actual.source,
            CitySource::Vellummap,
            "{name}: native source"
        );

        assert_eq!(
            expected.generated_at, generated,
            "{name}: fixture <Generated>"
        );
        assert_eq!(actual.generated_at, generated_utc, "{name}: exportedAtUtc");

        let mut expected = serde_json::to_value(expected).unwrap();
        let mut actual = serde_json::to_value(actual).unwrap();
        for value in [&mut expected, &mut actual] {
            let object = value.as_object_mut().unwrap();
            object.remove("fileName");
            object.remove("generatedAt");
            // Which document it came from is the one field that must differ.
            object.remove("source");
        }
        for (key, want) in expected.as_object().unwrap() {
            assert!(
                actual.get(key) == Some(want),
                "{name}: `{key}` differs between .cslmap and .vellummap"
            );
        }
        assert_eq!(expected, actual, "{name}: CityData differs");
    }
}

#[test]
fn converter_is_deterministic() {
    let cslmap = fixture("minimal-valid.cslmap");
    assert_eq!(
        cslmap_to_vellummap(&cslmap).unwrap(),
        cslmap_to_vellummap(&cslmap).unwrap()
    );
}

#[test]
fn converter_rejects_non_numeric_ids() {
    let result = cslmap_to_vellummap(&fixture("with-transit.cslmap"));
    match result {
        Err(VellumError::InvalidFile { reason }) => assert!(reason.contains("`L1`"), "{reason}"),
        other => panic!("expected InvalidFile, got {other:?}"),
    }
}

// ─── Matrix: "Solo máscara de agua" ───────────────────────────────────────────

#[test]
fn mask_only_water_builds_with_synthetic_depth() {
    let mut document = bridge_document();
    document.water_depth = None;
    document.water.depth = None;
    let bytes = write_document(&document).unwrap();

    let read = read_document(&bytes).unwrap();
    let raw = read.into_raw();
    let lake = 540 * 1081 + 540;
    assert!((raw.res_grid[lake] - 2.0 * MIN_WATER_DEPTH).abs() < f64::EPSILON);
    assert!(raw.res_grid[0].abs() < f64::EPSILON);

    let city = parse_vellummap_bytes(&bytes).expect("mask-only document must open");
    assert!(
        !city.inland_water_polygons.is_empty(),
        "the masked lake must become inland water"
    );
}

// ─── Matrix: "Extras de Bridge" ───────────────────────────────────────────────

#[test]
fn bridge_extras_are_accepted_and_reach_city_data() {
    let city = parse_vellummap_bytes(&bridge_zip()).expect("bridge document must open");
    assert_eq!(city.city_name, "Sample City");
    assert_eq!(city.generated_at, "2026-09-23T14:05:00Z");
    let line = &city.transit_lines[0];
    assert_eq!(line.color, "#FF6600FF");
    assert_eq!(line.stops[0].name, "Main Street");
    assert!(line.stops[0].name_derived, "the derived mark must survive");
    assert_eq!(line.stops[1].name, "");
    assert!(!line.stops[1].name_derived);
    assert_eq!(city.source, CitySource::Vellummap);
    // One owned cell each in the area grids → one closed boundary each.
    for boundary in [&city.districts[0].boundary, &city.park_areas[0].boundary] {
        let polygons = boundary
            .as_ref()
            .expect("an area in the grid gets a boundary");
        assert_eq!(polygons.len(), 1);
    }
    assert_eq!(line.route[0].segment_ids, vec!["7".to_owned()]);
    assert_eq!(city.road_segments[0].name.as_deref(), Some("Elm Street"));
    // Node 2 is elevated → the segment is classified through the shared path.
    assert!(city.road_segments[0]
        .way_type
        .iter()
        .any(|t| matches!(t, crate::city_data::WayType::Elevated)));
    assert!(matches!(
        city.park_areas[0].park_type,
        crate::city_data::ParkType::None
    ));
    assert!(!city.inland_water_polygons.is_empty());
}

#[test]
fn cslmap_source_serializes_as_the_literal_the_chip_checks() {
    let city = parse_cslmap_bytes(&fixture("minimal-valid.cslmap")).unwrap();
    assert_eq!(serde_json::to_value(&city).unwrap()["source"], "cslmap");
}

#[test]
fn native_parse_warnings_reach_the_observer() {
    let mut document = bridge_document();
    document.roads.segments[0].item_class = "Some Modded Road".to_owned();
    let bytes = write_document(&document).unwrap();

    let mut seen = Vec::new();
    parse_vellummap_observed(&bytes, |warnings| seen.extend_from_slice(warnings)).unwrap();
    assert_eq!(seen.len(), 1, "{seen:?}");
    assert!(seen[0].contains("Some Modded Road"), "{seen:?}");
}

// ─── Matrix: "Áreas" — sin grilla, solo etiqueta ──────────────────────────────

#[test]
fn areas_without_a_grid_keep_only_their_label() {
    let mut document = bridge_document();
    document.district_grid = None;
    document.park_grid = None;
    let city = parse_vellummap_bytes(&write_document(&document).unwrap()).unwrap();
    assert!(city.districts[0].boundary.is_none());
    assert!(city.park_areas[0].boundary.is_none());

    // …and the contract omits the field instead of sending `null`.
    let json = serde_json::to_value(&city).unwrap();
    // The frontend compares this literal (`source === 'cslmap'`): pin the wire value.
    assert_eq!(json["source"], "vellummap");
    assert!(json["districts"][0].get("boundary").is_none());
    assert!(json["transitLines"][0]["stops"][1]
        .get("nameDerived")
        .is_none());
}

#[test]
fn stored_codec_is_accepted_when_declared() {
    let mut entries = entries(&bridge_zip());
    let mut manifest = manifest_value(&entries);
    for module in manifest["modules"].as_array_mut().unwrap() {
        if module["id"] == "roads" {
            module["codec"] = "stored".into();
        }
    }
    set_manifest(&mut entries, &manifest);
    entries
        .iter_mut()
        .find(|(p, _, _)| p == "roads.json")
        .unwrap()
        .2 = Codec::Stored;
    assert!(read_document(&rezip(&entries)).is_ok());
}

// ─── Matrix: "Versión futura" ─────────────────────────────────────────────────

#[test]
fn future_major_is_unsupported_even_with_unknown_fields() {
    let bytes = with_manifest(&bridge_zip(), |m| {
        m["exportSchemaVersion"] = "2.0".into();
        m["somethingFromV2"] = true.into();
    });
    match parse_vellummap_bytes(&bytes) {
        Err(VellumError::UnsupportedVersion { found }) => assert_eq!(found, "2.0"),
        other => panic!("expected UnsupportedVersion, got {other:?}"),
    }
}

#[test]
fn future_minor_of_major_one_is_accepted() {
    let bytes = with_manifest(&bridge_zip(), |m| m["exportSchemaVersion"] = "1.7".into());
    assert!(read_document(&bytes).is_ok());
}

#[test]
fn future_module_major_is_unsupported() {
    let bytes = with_manifest(&bridge_zip(), |m| m["modules"][0]["version"] = "2.0".into());
    match parse_vellummap_bytes(&bytes) {
        Err(VellumError::UnsupportedVersion { found }) => assert_eq!(found, "2.0"),
        other => panic!("expected UnsupportedVersion, got {other:?}"),
    }
}

#[test]
fn malformed_version_is_invalid() {
    let bytes = with_manifest(&bridge_zip(), |m| m["exportSchemaVersion"] = "1".into());
    assert_invalid(parse_vellummap_bytes(&bytes), "MAJOR.MINOR");
}

// ─── Matrix: "Contenido inválido" ─────────────────────────────────────────────

#[test]
fn hash_mismatch_is_invalid() {
    let original = entries(&bridge_zip());
    let (_, mut roads, _) = original
        .into_iter()
        .find(|(p, _, _)| p == "roads.json")
        .unwrap();
    roads.push(b' ');
    let bytes = with_module(&bridge_zip(), "roads.json", roads, false);
    assert_invalid(parse_vellummap_bytes(&bytes), "sha256");
}

#[test]
fn grid_of_the_wrong_size_is_invalid() {
    let bytes = with_module(&bridge_zip(), "terrain.bin", vec![0; 1000], true);
    assert_invalid(parse_vellummap_bytes(&bytes), "must measure exactly");
}

#[test]
fn undeclared_file_is_invalid() {
    let mut document = bridge_document();
    document.park_grid = None;
    let mut entries = entries(&write_document(&document).unwrap());
    entries.push(("notes.txt".to_owned(), b"hi".to_vec(), Codec::Deflate));
    assert_invalid(parse_vellummap_bytes(&rezip(&entries)), "`notes.txt`");
}

#[test]
fn declared_file_missing_from_the_zip_is_invalid() {
    let mut entries = entries(&bridge_zip());
    entries.retain(|(p, _, _)| p != "parks.bin");
    assert_invalid(parse_vellummap_bytes(&rezip(&entries)), "no `parks.bin`");
}

#[test]
fn missing_required_module_is_invalid() {
    let mut entries = entries(&bridge_zip());
    let mut manifest = manifest_value(&entries);
    manifest["modules"]
        .as_array_mut()
        .unwrap()
        .retain(|m| m["id"] != "buildings");
    set_manifest(&mut entries, &manifest);
    entries.retain(|(p, _, _)| p != "buildings.json");
    assert_invalid(
        parse_vellummap_bytes(&rezip(&entries)),
        "required module `buildings`",
    );
}

#[test]
fn unknown_manifest_field_is_invalid() {
    let bytes = with_manifest(&bridge_zip(), |m| m["extra"] = 1.into());
    assert_invalid(parse_vellummap_bytes(&bytes), "unknown field `extra`");
}

#[test]
fn unknown_module_field_is_invalid() {
    let bytes = edit_json_module(&bridge_zip(), "roads.json", |v| {
        v["nodes"][0]["name"] = "x".into();
    });
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "roads.json: unknown field `name`",
    );
}

#[test]
fn explicit_null_for_an_optional_field_is_invalid() {
    let bytes = with_manifest(&bridge_zip(), |m| m["gameTime"] = serde_json::Value::Null);
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "manifest.json: invalid type: null, expected a string",
    );
}

#[test]
fn unknown_module_id_is_invalid() {
    let bytes = with_manifest(&bridge_zip(), |m| {
        m["modules"][0]["id"] = "trees".into();
    });
    assert_invalid(parse_vellummap_bytes(&bytes), "unknown module `trees`");
}

#[test]
fn codec_that_does_not_match_the_entry_is_invalid() {
    let bytes = with_manifest(&bridge_zip(), |m| {
        m["modules"][0]["codec"] = "stored".into();
    });
    assert_invalid(parse_vellummap_bytes(&bytes), "declares codec `stored`");
}

#[test]
fn grid_shape_other_than_v1_is_invalid() {
    let bytes = with_manifest(&bridge_zip(), |m| {
        m["modules"][0]["grid"]["resolution"] = 1080.into();
    });
    assert_invalid(parse_vellummap_bytes(&bytes), "grid must be");
}

#[test]
fn mask_that_disagrees_with_depth_is_invalid() {
    let mut mask = bridge_document().water_mask;
    mask[0] = 1;
    let bytes = with_module(&bridge_zip(), "water-mask.bin", mask, true);
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "disagrees with water-depth.bin",
    );
}

#[test]
fn mask_value_other_than_zero_or_one_is_invalid() {
    let mut document = bridge_document();
    document.water_depth = None;
    document.water.depth = None;
    let zip = write_document(&document).unwrap();
    let mut mask = document.water_mask;
    mask[0] = 2;
    let bytes = with_module(&zip, "water-mask.bin", mask, true);
    assert_invalid(parse_vellummap_bytes(&bytes), "only 0 (dry) and 1 (wet)");
}

#[test]
fn depth_without_provenance_is_invalid() {
    let bytes = edit_json_module(&bridge_zip(), "water.json", |v| {
        v.as_object_mut().unwrap().remove("depth");
    });
    assert_invalid(parse_vellummap_bytes(&bytes), "no `depth` provenance");
}

#[test]
fn nonexistent_district_id_is_invalid() {
    let mut grid = bridge_document().district_grid.unwrap();
    grid[1] = 9; // cell 0, slot 1 → district 9, not declared
    let bytes = with_module(&bridge_zip(), "districts.bin", grid, true);
    assert_invalid(parse_vellummap_bytes(&bytes), "references id 9");
}

#[test]
fn nonexistent_park_id_is_invalid() {
    let mut grid = bridge_document().park_grid.unwrap();
    grid[8] = 4;
    let bytes = with_module(&bridge_zip(), "parks.bin", grid, true);
    assert_invalid(parse_vellummap_bytes(&bytes), "references id 4");
}

#[test]
fn derived_stop_name_without_name_is_invalid() {
    let bytes = edit_json_module(&bridge_zip(), "transit.json", |v| {
        v["lines"][0]["stops"][0]
            .as_object_mut()
            .unwrap()
            .remove("name");
    });
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "`nameDerived` requires `name`",
    );
}

#[test]
fn malformed_line_color_is_invalid() {
    let bytes = edit_json_module(&bridge_zip(), "transit.json", |v| {
        v["lines"][0]["color"] = "#ff6600ff".into();
    });
    assert_invalid(parse_vellummap_bytes(&bytes), "uppercase hex");
}

#[test]
fn writer_refuses_an_invalid_document() {
    let mut document = bridge_document();
    document.water.depth = None;
    assert!(matches!(
        write_document(&document),
        Err(VellumError::InvalidFile { .. })
    ));
}

// ─── Matrix: "Zip bomb / no-zip" ──────────────────────────────────────────────

#[test]
fn corrupt_entry_data_fails_as_a_read_error() {
    // Control for the tests below: inflating the corrupted entry is a read error.
    let bytes = corrupt_entry_data(&bridge_zip(), "roads.json");
    assert_invalid(parse_vellummap_bytes(&bytes), "cannot read `roads.json`");
}

#[test]
fn oversized_json_declaration_is_rejected_before_inflating() {
    let bytes = corrupt_entry_data(&bridge_zip(), "roads.json");
    let bytes = patch_declared_size(&bytes, "roads.json", 300 * 1024 * 1024);
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "`roads.json` declares 314572800 bytes, above the 268435456-byte limit",
    );
}

#[test]
fn oversized_grid_declaration_is_rejected_before_inflating() {
    let bytes = corrupt_entry_data(&bridge_zip(), "terrain.bin");
    let bytes = patch_declared_size(&bytes, "terrain.bin", 900_000_000);
    assert_invalid(parse_vellummap_bytes(&bytes), "must measure exactly");
}

#[test]
fn oversized_manifest_declaration_is_rejected_before_inflating() {
    let bytes = corrupt_entry_data(&bridge_zip(), MANIFEST_PATH);
    let bytes = patch_declared_size(&bytes, MANIFEST_PATH, 2 * 1024 * 1024);
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "above the 1048576-byte limit",
    );
}

#[test]
fn document_budget_is_checked_before_inflating() {
    // Five JSON entries of 250 MiB each: every one under its own limit, 1.25 GiB
    // together, and all of them corrupt.
    let mut bytes = bridge_zip();
    for path in [
        "roads.json",
        "transit.json",
        "buildings.json",
        "districts.json",
        "parks.json",
    ] {
        bytes = corrupt_entry_data(&bytes, path);
        bytes = patch_declared_size(&bytes, path, 250 * 1024 * 1024);
    }
    assert_invalid(parse_vellummap_bytes(&bytes), "document budget");
}

#[test]
fn entry_that_inflates_to_another_size_is_invalid() {
    let (_, roads, _) = entries(&bridge_zip())
        .into_iter()
        .find(|(p, _, _)| p == "roads.json")
        .unwrap();
    let declared = u32::try_from(roads.len()).unwrap() + 10;
    let bytes = patch_declared_size(&bridge_zip(), "roads.json", declared);
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        &format!(
            "`roads.json` inflates to {} bytes but declares {declared}",
            roads.len()
        ),
    );
}

#[test]
fn duplicate_entry_names_are_invalid() {
    let mut entries = entries(&bridge_zip());
    entries.push(("parks.jsoX".to_owned(), b"{}".to_vec(), Codec::Deflate));
    let bytes = rename_entry(&rezip(&entries), "parks.jsoX", "parks.json");
    assert_invalid(parse_vellummap_bytes(&bytes), "duplicate entry names");
}

#[test]
fn bytes_that_are_not_a_zip_are_invalid() {
    assert_invalid(
        parse_vellummap_bytes(b"<CSLExportXML version=\"4.1\"/>"),
        "not a .vellummap zip",
    );
    assert_invalid(parse_vellummap_bytes(&[]), "not a .vellummap zip");
}

#[test]
fn too_many_entries_is_invalid() {
    let mut entries = entries(&bridge_zip());
    for i in 0..20 {
        entries.push((format!("x{i}"), Vec::new(), Codec::Stored));
    }
    assert_invalid(parse_vellummap_bytes(&rezip(&entries)), "at most 13");
}

#[test]
fn zip_without_manifest_is_invalid() {
    let bytes = write_zip(&[("roads.json", b"{}", Codec::Deflate)]).unwrap();
    assert_invalid(parse_vellummap_bytes(&bytes), "no `manifest.json`");
}

// ─── Reader rules added in review ─────────────────────────────────────────────

#[test]
fn duplicate_source_ids_are_invalid() {
    type Edit = fn(&mut serde_json::Value);
    let cases: [(&str, &str, Edit); 6] = [
        ("roads.json", "roads.json nodes", |v| {
            let node = v["nodes"][0].clone();
            v["nodes"].as_array_mut().unwrap().push(node);
        }),
        ("roads.json", "roads.json segments", |v| {
            let seg = v["segments"][0].clone();
            v["segments"].as_array_mut().unwrap().push(seg);
        }),
        ("transit.json", "transit.json lines", |v| {
            let line = v["lines"][0].clone();
            v["lines"].as_array_mut().unwrap().push(line);
        }),
        ("buildings.json", "buildings.json", |v| {
            let b = serde_json::json!({
                "sourceId": 5, "name": "a", "itemClass": "b", "serviceType": "c", "footprint": []
            });
            v["buildings"] = serde_json::json!([b.clone(), b]);
        }),
        ("districts.json", "districts.json", |v| {
            let d = v["districts"][0].clone();
            v["districts"].as_array_mut().unwrap().push(d);
        }),
        ("parks.json", "parks.json", |v| {
            let p = v["parks"][0].clone();
            v["parks"].as_array_mut().unwrap().push(p);
        }),
    ];
    for (path, what, edit) in cases {
        let bytes = edit_json_module(&bridge_zip(), path, edit);
        assert_invalid(parse_vellummap_bytes(&bytes), &format!("{what}: sourceId"));
    }
}

#[test]
fn segment_endpoint_that_is_not_a_node_is_invalid() {
    let bytes = edit_json_module(&bridge_zip(), "roads.json", |v| {
        v["segments"][0]["endNodeSourceId"] = 99.into();
    });
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "endNodeSourceId 99 is not a declared node",
    );
}

#[test]
fn transit_route_may_reference_missing_segments() {
    let bytes = edit_json_module(&bridge_zip(), "transit.json", |v| {
        v["lines"][0]["route"] = serde_json::json!([7, 4242]);
    });
    assert!(parse_vellummap_bytes(&bytes).is_ok());
}

#[test]
fn negative_width_is_invalid() {
    let bytes = edit_json_module(&bridge_zip(), "roads.json", |v| {
        v["segments"][0]["width"] = (-1.0).into();
    });
    assert_invalid(parse_vellummap_bytes(&bytes), "width -1 is negative");
}

#[test]
fn area_source_id_outside_a_grid_byte_is_invalid() {
    for (path, id) in [
        ("districts.json", 0),
        ("districts.json", 256),
        ("parks.json", 300),
    ] {
        let key = if path == "districts.json" {
            "districts"
        } else {
            "parks"
        };
        let bytes = edit_json_module(&bridge_zip(), path, |v| {
            let mut extra = v[key][0].clone();
            extra["sourceId"] = id.into();
            v[key].as_array_mut().unwrap().push(extra);
        });
        assert_invalid(
            parse_vellummap_bytes(&bytes),
            &format!("declares sourceId {id}, which"),
        );
    }
}

#[test]
fn area_source_id_zero_is_allowed_without_a_grid() {
    let mut document = bridge_document();
    document.district_grid = None;
    document.districts.districts[0].source_id = 0;
    assert!(read_document(&write_document(&document).unwrap()).is_ok());
}

#[test]
fn major_that_overflows_u32_is_unsupported() {
    let bytes = with_manifest(&bridge_zip(), |m| {
        m["exportSchemaVersion"] = "99999999999999999999.0".into();
    });
    match parse_vellummap_bytes(&bytes) {
        Err(VellumError::UnsupportedVersion { found }) => {
            assert_eq!(found, "99999999999999999999.0");
        }
        other => panic!("expected UnsupportedVersion, got {other:?}"),
    }
}

#[test]
fn frame_index_must_be_a_safe_integer_without_fraction() {
    for (frame, needle) in [
        (
            serde_json::json!(9_007_199_254_740_992_u64),
            "above 9007199254740991",
        ),
        (serde_json::json!(1.0), "invalid type: floating point"),
    ] {
        let bytes = edit_json_module(&bridge_zip(), "water.json", |v| {
            v["depth"]["frameIndex"] = frame;
        });
        assert_invalid(parse_vellummap_bytes(&bytes), needle);
    }
}

#[test]
fn source_id_with_a_fraction_is_invalid() {
    let bytes = edit_json_module(&bridge_zip(), "roads.json", |v| {
        v["nodes"][0]["sourceId"] = (1.0).into();
    });
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "invalid type: floating point",
    );
}

#[test]
fn module_declared_twice_is_invalid() {
    let bytes = with_manifest(&bridge_zip(), |m| {
        let first = m["modules"][1].clone();
        m["modules"].as_array_mut().unwrap().push(first);
    });
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "declares module `water` twice",
    );
}

#[test]
fn module_path_other_than_the_fixed_one_is_invalid() {
    let bytes = with_manifest(&bridge_zip(), |m| m["modules"][1]["path"] = "w.json".into());
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "module `water` must live at `water.json`, not `w.json`",
    );
}

#[test]
fn json_module_that_declares_a_grid_is_invalid() {
    let bytes = with_manifest(&bridge_zip(), |m| {
        m["modules"][1]["grid"] = m["modules"][0]["grid"].clone();
    });
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "module `water` is JSON and must not declare a `grid`",
    );
}

#[test]
fn malformed_sha256_is_invalid() {
    for edit in [|s: &str| s.to_uppercase(), |s: &str| s[..63].to_owned()] {
        let bytes = with_manifest(&bridge_zip(), |m| {
            let sha = m["modules"][0]["sha256"].as_str().unwrap().to_owned();
            m["modules"][0]["sha256"] = edit(&sha).into();
        });
        assert_invalid(
            parse_vellummap_bytes(&bytes),
            "sha256 must be 64 lowercase hex characters",
        );
    }
}

#[test]
fn empty_stop_name_is_invalid() {
    let bytes = edit_json_module(&bridge_zip(), "transit.json", |v| {
        v["lines"][0]["stops"][0]["name"] = "".into();
    });
    assert_invalid(parse_vellummap_bytes(&bytes), "`name` must not be empty");
}

#[test]
fn empty_park_type_is_invalid() {
    let bytes = edit_json_module(&bridge_zip(), "parks.json", |v| {
        v["parks"][0]["parkType"] = "".into();
    });
    assert_invalid(
        parse_vellummap_bytes(&bytes),
        "`parkType` must not be empty",
    );
}

#[test]
fn grids_are_little_endian() {
    let document = bridge_document();
    let mut terrain = encode(&document.terrain);
    terrain[0] = 0x02;
    terrain[1] = 0x01;
    let bytes = with_module(&bridge_zip(), "terrain.bin", terrain, true);
    // Cell 0 is dry, so depth 0x0102 = 258 would break the mask; patch a wet cell.
    let lake = 540 * 1081 + 540;
    let mut depth = encode(document.water_depth.as_ref().unwrap());
    depth[lake * 2] = 0x02;
    depth[lake * 2 + 1] = 0x01;
    let bytes = with_module(&bytes, "water-depth.bin", depth, true);

    let read = read_document(&bytes).unwrap();
    assert_eq!(read.terrain[0], 0x0102);
    assert_eq!(read.water_depth.as_ref().unwrap()[lake], 0x0102);
    let raw = read.into_raw();
    assert!((raw.elev_grid[0] - 258.0).abs() < f64::EPSILON);
    assert!((raw.res_grid[lake] - 258.0).abs() < f64::EPSILON);
}

fn encode(values: &[u16]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}

#[test]
fn unknown_item_class_warnings_reach_the_shared_path() {
    let mut document = bridge_document();
    document.roads.segments[0].item_class = "Some Modded Road".to_owned();
    let raw = read_document(&write_document(&document).unwrap())
        .unwrap()
        .into_raw();
    assert_eq!(
        raw.warnings(),
        vec!["Unknown ItemClass 'Some Modded Road' (width 24.0)".to_owned()]
    );
}

#[test]
fn converter_rejects_a_node_without_position() {
    let xml = br#"<?xml version="1.0"?><CSLExportXML version="4.1"><City>C</City><Generated>g</Generated><Nodes><Node id="1" elev="0" ug="false"></Node></Nodes></CSLExportXML>"#;
    match cslmap_to_vellummap(xml) {
        Err(VellumError::InvalidFile { reason }) => {
            assert!(reason.contains("has no <Pos>"), "{reason}");
        }
        other => panic!("expected InvalidFile, got {other:?}"),
    }
}

// ─── exportedAtUtc ────────────────────────────────────────────────────────────

#[test]
fn generated_timestamps_convert_to_utc() {
    use super::write::generated_to_utc;
    for (generated, utc) in [
        ("6/10/2026 5:35:58 PM", "2026-06-10T17:35:58Z"),
        ("1/1/2026 12:00:00 AM", "2026-01-01T00:00:00Z"),
        ("1/1/2026 12:30:05 PM", "2026-01-01T12:30:05Z"),
        ("12/31/2026 11:59:59 PM", "2026-12-31T23:59:59Z"),
        ("2/29/2028 1:00:00 AM", "2028-02-29T01:00:00Z"),
    ] {
        assert_eq!(generated_to_utc(generated).unwrap(), utc, "{generated}");
    }
    for bad in [
        "",
        "2026-06-10T17:35:58Z",
        "6/10/2026 17:35:58",
        "6/10/2026 0:35:58 AM",
        "6/10/2026 13:35:58 PM",
        "6/10/2026 5:35:58 pm",
        "13/10/2026 5:35:58 PM",
        "2/29/2026 5:35:58 PM",
        "6/10/26 5:35:58 PM",
        "6/10/2026 5:3:58 PM",
        "6/10/2026 5:35:60 PM",
        "6/10/2026  5:35:58 PM",
    ] {
        match generated_to_utc(bad) {
            Err(VellumError::InvalidFile { reason }) => {
                assert!(reason.contains("M/D/YYYY h:mm:ss AM|PM"), "{reason}");
            }
            other => panic!("`{bad}` must be rejected, got {other:?}"),
        }
    }
}

#[test]
fn converter_rejects_an_unreadable_generated_timestamp() {
    let xml = br#"<?xml version="1.0"?><CSLExportXML version="4.1"><City>C</City><Generated>10.06.2026 17:35</Generated></CSLExportXML>"#;
    match cslmap_to_vellummap(xml) {
        Err(VellumError::InvalidFile { reason }) => {
            assert!(
                reason.contains("<Generated> `10.06.2026 17:35`"),
                "{reason}"
            );
        }
        other => panic!("expected InvalidFile, got {other:?}"),
    }
}

#[test]
fn exported_at_must_be_rfc3339_utc() {
    for bad in [
        "2026-06-10T17:35:58",
        "2026-06-10T17:35:58+02:00",
        "2026-06-10 17:35:58Z",
        "2026-06-10t17:35:58z",
        "2026-02-30T17:35:58Z",
        "2026-06-10T24:00:00Z",
        "2026-06-10T17:35:58.Z",
        "6/10/2026 5:35:58 PM",
    ] {
        let bytes = with_manifest(&bridge_zip(), |m| m["exportedAtUtc"] = bad.into());
        assert_invalid(
            parse_vellummap_bytes(&bytes),
            &format!("exportedAtUtc `{bad}` must be an RFC 3339 UTC timestamp"),
        );
    }
    for good in [
        "2026-06-10T17:35:58Z",
        "2026-06-10T17:35:58.123Z",
        "2028-02-29T00:00:00Z",
    ] {
        let bytes = with_manifest(&bridge_zip(), |m| m["exportedAtUtc"] = good.into());
        let city = parse_vellummap_bytes(&bytes).expect("valid timestamp");
        assert_eq!(
            city.generated_at, good,
            "generatedAt is exportedAtUtc as is"
        );
    }
}

// ─── Schema examples (anti-drift with ajv) ────────────────────────────────────

/// Validates one example the way the reader would: the manifest through
/// `parse_manifest`, JSON modules through serde plus their module rules.
fn check_example(def: &str, bytes: &[u8]) -> Result<(), String> {
    fn de<T: serde::de::DeserializeOwned>(bytes: &[u8]) -> Result<T, String> {
        serde_json::from_slice(bytes).map_err(|e| e.to_string())
    }
    match def {
        "manifest" => parse_manifest(bytes).map(|_| ()).map_err(|e| e.to_string()),
        "water" => de::<WaterModule>(bytes)?
            .validate()
            .map_err(|e| e.to_string()),
        "roads" => de::<RoadsModule>(bytes)?
            .validate()
            .map_err(|e| e.to_string()),
        "transit" => de::<TransitModule>(bytes)?
            .validate()
            .map_err(|e| e.to_string()),
        "buildings" => de::<BuildingsModule>(bytes)?
            .validate()
            .map_err(|e| e.to_string()),
        "districts" => de::<DistrictsModule>(bytes)?
            .validate()
            .map_err(|e| e.to_string()),
        "parks" => de::<ParksModule>(bytes)?
            .validate()
            .map_err(|e| e.to_string()),
        other => panic!("unknown schema $def `{other}` in an example file name"),
    }
}

fn examples(kind: &str) -> Vec<(String, String, Vec<u8>)> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("schema/examples")
        .join(kind);
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
        .map(|entry| entry.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "json"))
        .collect();
    files.sort();
    files
        .into_iter()
        .map(|path| {
            let file = path.file_name().unwrap().to_string_lossy().into_owned();
            let def = file.split('.').next().unwrap().to_owned();
            (file, def, std::fs::read(&path).unwrap())
        })
        .collect()
}

#[test]
fn valid_schema_examples_deserialize() {
    let valid = examples("valid");
    assert!(valid.len() >= 8, "expected the published examples");
    for (file, def, bytes) in valid {
        if let Err(e) = check_example(&def, &bytes) {
            panic!("{file} must be accepted: {e}");
        }
    }
}

#[test]
fn invalid_schema_examples_are_rejected() {
    let invalid = examples("invalid");
    assert!(!invalid.is_empty());
    for (file, def, bytes) in invalid {
        assert!(
            check_example(&def, &bytes).is_err(),
            "{file} must be rejected"
        );
    }
}

#[test]
fn major_two_example_is_reported_as_unsupported() {
    let (_, _, bytes) = examples("invalid")
        .into_iter()
        .find(|(file, _, _)| file == "manifest.major-2.json")
        .expect("the major-2 example exists");
    assert!(matches!(
        parse_manifest(&bytes),
        Err(VellumError::UnsupportedVersion { .. })
    ));
}

#[test]
fn published_manifest_example_matches_the_writer() {
    // The full example manifest lists exactly the modules the writer emits for a
    // Bridge document: same ids, paths and grids.
    let (_, _, bytes) = examples("valid")
        .into_iter()
        .find(|(file, _, _)| file == "manifest.bridge.json")
        .expect("the bridge manifest example exists");
    let example = parse_manifest(&bytes).unwrap();
    let written = read_document(&bridge_zip()).unwrap().manifest;
    let shape = |m: &Manifest| -> Vec<(String, String, Option<String>)> {
        m.modules
            .iter()
            .map(|e| {
                (
                    e.id.clone(),
                    e.path.clone(),
                    e.grid.map(|g| format!("{g:?}")),
                )
            })
            .collect()
    };
    assert_eq!(shape(&example), shape(&written));
}
