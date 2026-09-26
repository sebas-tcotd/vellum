//! Reference writer and the `.cslmap` → `.vellummap` converter.
//!
//! The converter exists to prove parity: a `.cslmap` converted here and opened
//! with `parse_vellummap_bytes` yields the same `CityData` as `parse_cslmap_bytes`.
//! It is not the production exporter (Bridge writes `.vellummap` in Story 5.3).

use super::manifest::{
    days_in_month, spec_of, CityInfo, Codec, GameInfo, Manifest, ModuleEntry, ModuleId, Producer,
};
use super::modules::{
    BuildingDoc, BuildingsModule, DepthProvenance, DistrictDoc, DistrictsModule, ParkDoc,
    ParksModule, Position, RoadNodeDoc, RoadSegmentDoc, RoadsModule, TransitLineDoc, TransitModule,
    TransitStopDoc, WaterModule,
};
use super::read::sha256_hex;
use super::{
    invalid, Document, EXPORT_SCHEMA_VERSION, FORMAT, MANIFEST_PATH, MODULE_ORDER, MODULE_VERSION,
};
use crate::errors::VellumError;
use crate::parser::builder::RawCity;
use crate::parser::handlers::roads::NodeElevation;
use crate::parser::parse_cslmap_raw;
use crate::parser::terrain::grid::{is_water, TERRAIN_GRID_SIZE};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// Producer name the reference converter writes in the manifest.
const CONVERTER_NAME: &str = "vellum-cslmap-converter";

/// Converts a `.cslmap` into an equivalent `.vellummap` (reference implementation).
///
/// What `.cslmap` does not carry is written honestly: `game.version` is
/// `"unknown"`, the depth provenance says the pause state is unknown
/// (`simulationPaused: false`, no `frameIndex`), and `exportedAtUtc` is
/// `<Generated>` converted to RFC 3339 **assuming UTC** — `.cslmap` does not
/// record its time zone, so the zone is unknown.
///
/// # Errors
/// Any error of `parse_cslmap_bytes`, plus `VellumError::InvalidFile` when the
/// `.cslmap` holds values the document cannot represent losslessly — non-numeric
/// or duplicated IDs, terrain values that are not integers in u16, node `elev`
/// that is not an integer in 0–255, a `<Node>` without `<Pos>`, a line color
/// that is not `#RRGGBBAA`, a missing `<Generated>` or one that is not
/// `M/D/YYYY h:mm:ss AM|PM` — and `VellumError::IoError` if the
/// zip cannot be written.
pub fn cslmap_to_vellummap(cslmap: &[u8]) -> Result<Vec<u8>, VellumError> {
    let raw = parse_cslmap_raw(cslmap)?;
    let document = document_from_raw(raw, sha256_hex(cslmap))?;
    write_document(&document)
}

/// Serializes a `Document` into a `.vellummap`, recomputing the module table.
/// The document is validated first: the reference writer never emits a file its
/// own reader would reject.
pub(crate) fn write_document(document: &Document) -> Result<Vec<u8>, VellumError> {
    document.validate()?;

    let mut files: Vec<(ModuleId, Vec<u8>)> = Vec::new();
    for id in MODULE_ORDER {
        let bytes = match id {
            ModuleId::Terrain => Some(encode_u16le(&document.terrain)),
            ModuleId::Water => Some(to_json(&document.water)?),
            ModuleId::WaterMask => Some(document.water_mask.clone()),
            ModuleId::WaterDepth => document.water_depth.as_deref().map(encode_u16le),
            ModuleId::Vegetation => Some(document.vegetation.clone()),
            ModuleId::Roads => Some(to_json(&document.roads)?),
            ModuleId::Transit => Some(to_json(&document.transit)?),
            ModuleId::Buildings => Some(to_json(&document.buildings)?),
            ModuleId::Districts => Some(to_json(&document.districts)?),
            ModuleId::Parks => Some(to_json(&document.parks)?),
            ModuleId::DistrictGrid => document.district_grid.clone(),
            ModuleId::ParkGrid => document.park_grid.clone(),
        };
        if let Some(bytes) = bytes {
            let expected = spec_of(id).grid.map(|g| g.byte_len());
            if let Some(expected) = expected {
                if bytes.len() as u64 != expected {
                    return Err(invalid(format!(
                        "module `{}` has {} bytes; its grid must measure {expected}",
                        spec_of(id).name,
                        bytes.len()
                    )));
                }
            }
            files.push((id, bytes));
        }
    }

    let mut manifest = document.manifest.clone();
    manifest.modules = files
        .iter()
        .map(|(id, bytes)| {
            let spec = spec_of(*id);
            ModuleEntry {
                id: spec.name.to_owned(),
                path: spec.path.to_owned(),
                version: MODULE_VERSION.to_owned(),
                codec: Codec::Deflate,
                sha256: sha256_hex(bytes),
                grid: spec.grid,
            }
        })
        .collect();
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| invalid(format!("cannot serialize manifest.json: {e}")))?;

    let mut entries: Vec<(&str, &[u8], Codec)> =
        vec![(MANIFEST_PATH, &manifest_bytes, Codec::Deflate)];
    entries.extend(
        files
            .iter()
            .map(|(id, bytes)| (spec_of(*id).path, bytes.as_slice(), Codec::Deflate)),
    );
    write_zip(&entries)
}

/// Writes raw zip entries in order. Deterministic: fixed timestamps.
pub(crate) fn write_zip(entries: &[(&str, &[u8], Codec)]) -> Result<Vec<u8>, VellumError> {
    let io = |e: &dyn std::fmt::Display| VellumError::IoError {
        reason: format!("cannot write the .vellummap zip: {e}"),
    };
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    for (path, bytes, codec) in entries {
        let method = match codec {
            Codec::Deflate => CompressionMethod::Deflated,
            Codec::Stored => CompressionMethod::Stored,
        };
        let options = SimpleFileOptions::default()
            .compression_method(method)
            // DOS epoch (1980-01-01 00:00), explicitly: the default depends on
            // whether zip's `time` feature is unified in.
            .last_modified_time(zip::DateTime::default())
            .large_file(bytes.len() as u64 >= u64::from(u32::MAX));
        zip.start_file(*path, options).map_err(|e| io(&e))?;
        zip.write_all(bytes).map_err(|e| io(&e))?;
    }
    Ok(zip.finish().map_err(|e| io(&e))?.into_inner())
}

fn to_json<T: Serialize>(value: &T) -> Result<Vec<u8>, VellumError> {
    serde_json::to_vec(value).map_err(|e| invalid(format!("cannot serialize module: {e}")))
}

fn encode_u16le(values: &[u16]) -> Vec<u8> {
    values.iter().flat_map(|v| v.to_le_bytes()).collect()
}

// ─── RawCity → Document ───────────────────────────────────────────────────────

/// Maps a parsed `.cslmap` onto the document, refusing anything that would not
/// round-trip exactly. The one planned transformation is `<Generated>` →
/// `exportedAtUtc` (see `generated_to_utc`).
fn document_from_raw(raw: RawCity, snapshot_id: String) -> Result<Document, VellumError> {
    if raw.generated_at.is_empty() {
        return Err(invalid(
            "the .cslmap has no <Generated> timestamp to use as exportedAtUtc",
        ));
    }

    let cells = TERRAIN_GRID_SIZE * TERRAIN_GRID_SIZE;
    if raw.elev_grid.len() > cells || raw.res_grid.len() > cells {
        return Err(invalid(format!(
            "the .cslmap terrain has more than {cells} cells"
        )));
    }
    // Same zero padding `build_city_data` applies to short grids.
    let pad = |grid: &[f64]| -> Result<Vec<u16>, VellumError> {
        let mut out = Vec::with_capacity(cells);
        for &value in grid {
            out.push(to_u16(value)?);
        }
        out.resize(cells, 0);
        Ok(out)
    };
    let terrain = pad(&raw.elev_grid)?;
    let depth = pad(&raw.res_grid)?;
    let water_mask = depth
        .iter()
        .map(|&d| u8::from(is_water(f64::from(d))))
        .collect();

    let (roads, transit) = (roads_from_raw(&raw)?, transit_from_raw(&raw)?);
    let (buildings, districts, parks) = areas_from_raw(&raw)?;

    Ok(Document {
        manifest: Manifest {
            format: FORMAT.to_owned(),
            export_schema_version: EXPORT_SCHEMA_VERSION.to_owned(),
            snapshot_id,
            parent_snapshot_id: None,
            exported_at_utc: generated_to_utc(&raw.generated_at)?,
            game_time: None,
            game: GameInfo {
                version: "unknown".to_owned(),
                instance_id: None,
            },
            producer: Producer {
                name: CONVERTER_NAME.to_owned(),
                version: env!("CARGO_PKG_VERSION").to_owned(),
            },
            city: CityInfo {
                name: raw.city_name,
            },
            modules: Vec::new(),
        },
        terrain,
        water: WaterModule {
            sea_level: raw.sea_level,
            depth: Some(DepthProvenance {
                simulation_paused: false,
                frame_index: None,
            }),
        },
        water_mask,
        water_depth: Some(depth),
        vegetation: raw.forest_grid,
        roads,
        transit,
        buildings,
        districts,
        parks,
        district_grid: None,
        park_grid: None,
    })
}

/// Every `<Node>` must have a position: `roads.json` has nowhere to keep the
/// elevation of a node without one, and dropping it would change `WayType`.
fn roads_from_raw(raw: &RawCity) -> Result<RoadsModule, VellumError> {
    let elevations: HashMap<&str, NodeElevation> = raw
        .node_elevations
        .iter()
        .map(|(id, elevation)| (id.as_str(), *elevation))
        .collect();
    let positioned: HashSet<&str> = raw.road_nodes.iter().map(|n| n.id.as_str()).collect();
    if let Some(id) = elevations.keys().find(|id| !positioned.contains(*id)) {
        return Err(invalid(format!(
            "the .cslmap node `{id}` has no <Pos>; roads.json cannot represent it"
        )));
    }
    Ok(RoadsModule {
        nodes: raw
            .road_nodes
            .iter()
            .map(|node| {
                let elevation = elevations
                    .get(node.id.as_str())
                    .copied()
                    .unwrap_or_default();
                Ok(RoadNodeDoc {
                    source_id: source_id(&node.id)?,
                    position: (&node.position).into(),
                    elevation: to_u8(elevation.elev)?,
                    underground: elevation.underground,
                })
            })
            .collect::<Result<_, VellumError>>()?,
        segments: raw
            .road_segments
            .iter()
            .map(|seg| {
                Ok(RoadSegmentDoc {
                    source_id: source_id(&seg.id)?,
                    start_node_source_id: source_id(&seg.start_node_id)?,
                    end_node_source_id: source_id(&seg.end_node_id)?,
                    item_class: seg.item_class.clone(),
                    width: seg.width,
                    name: seg.name.clone(),
                    points: seg.points.iter().map(Position::from).collect(),
                })
            })
            .collect::<Result<_, VellumError>>()?,
    })
}

/// Stop names are written only when present; `.cslmap` never derives them, so
/// `nameDerived` is left out.
fn transit_from_raw(raw: &RawCity) -> Result<TransitModule, VellumError> {
    Ok(TransitModule {
        lines: raw
            .transit_lines
            .iter()
            .map(|line| {
                Ok(TransitLineDoc {
                    source_id: source_id(&line.id)?,
                    name: line.name.clone(),
                    transport_type: line.transport_type.clone(),
                    color: line.color.clone(),
                    stops: line
                        .stops
                        .iter()
                        .map(|stop| {
                            Ok(TransitStopDoc {
                                source_id: source_id(&stop.node_id)?,
                                position: (&stop.position).into(),
                                name: Some(stop.name.clone()).filter(|n| !n.is_empty()),
                                name_derived: None,
                            })
                        })
                        .collect::<Result<_, VellumError>>()?,
                    route: line
                        .route
                        .iter()
                        .map(|id| source_id(id))
                        .collect::<Result<_, VellumError>>()?,
                })
            })
            .collect::<Result<_, VellumError>>()?,
    })
}

fn areas_from_raw(
    raw: &RawCity,
) -> Result<(BuildingsModule, DistrictsModule, ParksModule), VellumError> {
    let buildings = BuildingsModule {
        buildings: raw
            .buildings
            .iter()
            .map(|b| {
                Ok(BuildingDoc {
                    source_id: source_id(&b.id)?,
                    name: b.name.clone(),
                    item_class: b.item_class.clone(),
                    service_type: b.service_type.clone(),
                    footprint: b.footprint.iter().map(Position::from).collect(),
                })
            })
            .collect::<Result<_, VellumError>>()?,
    };
    let districts = DistrictsModule {
        districts: raw
            .districts
            .iter()
            .map(|d| {
                Ok(DistrictDoc {
                    source_id: source_id(&d.id)?,
                    name: d.name.clone(),
                    label_position: (&d.position).into(),
                })
            })
            .collect::<Result<_, VellumError>>()?,
    };
    let parks = ParksModule {
        parks: raw
            .park_areas
            .iter()
            .map(|p| {
                Ok(ParkDoc {
                    source_id: source_id(&p.id)?,
                    name: p.name.clone(),
                    label_position: (&p.position).into(),
                    park_type: Some(p.park_type.clone()).filter(|t| !t.is_empty()),
                })
            })
            .collect::<Result<_, VellumError>>()?,
    };
    Ok((buildings, districts, parks))
}

/// Converts a `.cslmap` `<Generated>` timestamp (`M/D/YYYY h:mm:ss AM|PM`, as
/// CSL Map View writes it) to RFC 3339 **assuming UTC**: `.cslmap` does not
/// record its time zone, so the zone is unknown and UTC is a convention.
pub(crate) fn generated_to_utc(generated: &str) -> Result<String, VellumError> {
    let fail = || {
        invalid(format!(
            "the .cslmap <Generated> `{generated}` is not `M/D/YYYY h:mm:ss AM|PM`"
        ))
    };
    let number = |part: &str, max_len: usize| -> Option<u32> {
        (!part.is_empty() && part.len() <= max_len && part.bytes().all(|c| c.is_ascii_digit()))
            .then(|| part.parse().ok())
            .flatten()
    };
    let mut words = generated.split(' ');
    let (Some(date), Some(time), Some(meridiem), None) =
        (words.next(), words.next(), words.next(), words.next())
    else {
        return Err(fail());
    };
    let mut date = date.split('/');
    let (Some(month), Some(day), Some(year), None) = (
        date.next().and_then(|p| number(p, 2)),
        date.next().and_then(|p| number(p, 2)),
        date.next()
            .filter(|p| p.len() == 4)
            .and_then(|p| number(p, 4)),
        date.next(),
    ) else {
        return Err(fail());
    };
    let mut clock = time.split(':');
    let (Some(hour12), Some(minute), Some(second), None) = (
        clock.next().and_then(|p| number(p, 2)),
        clock
            .next()
            .filter(|p| p.len() == 2)
            .and_then(|p| number(p, 2)),
        clock
            .next()
            .filter(|p| p.len() == 2)
            .and_then(|p| number(p, 2)),
        clock.next(),
    ) else {
        return Err(fail());
    };
    if !(1..=12).contains(&hour12) || minute > 59 || second > 59 {
        return Err(fail());
    }
    let hour = match meridiem {
        "AM" => hour12 % 12,
        "PM" => hour12 % 12 + 12,
        _ => return Err(fail()),
    };
    if !(1..=12).contains(&month) || !(1..=days_in_month(year, month)).contains(&day) {
        return Err(fail());
    }
    Ok(format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z"
    ))
}

/// A CS1 ID as a `sourceId`. Only canonical decimals are accepted, so the
/// document's `sourceId.to_string()` reproduces the `.cslmap` ID exactly.
fn source_id(id: &str) -> Result<u32, VellumError> {
    match id.parse::<u32>() {
        Ok(n) if n.to_string() == id => Ok(n),
        _ => Err(invalid(format!(
            "the .cslmap ID `{id}` is not a canonical unsigned integer"
        ))),
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn to_u16(value: f64) -> Result<u16, VellumError> {
    if value.fract() == 0.0 && (0.0..=f64::from(u16::MAX)).contains(&value) {
        Ok(value as u16)
    } else {
        Err(invalid(format!(
            "the .cslmap terrain value {value} does not fit a u16 grid"
        )))
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn to_u8(value: f64) -> Result<u8, VellumError> {
    if value.fract() == 0.0 && (0.0..=f64::from(u8::MAX)).contains(&value) {
        Ok(value as u8)
    } else {
        Err(invalid(format!(
            "the .cslmap node elevation {value} does not fit a u8"
        )))
    }
}
