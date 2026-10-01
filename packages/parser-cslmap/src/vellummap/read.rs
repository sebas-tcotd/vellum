//! `.vellummap` reader: zip → validated `Document` → `CityData`.
//!
//! Strict with every minor it knows; a newer minor may add fields, which are
//! ignored (never new modules, paths or enum values). Everything is read in
//! memory. Each entry's declared size is checked against its limit before a
//! single byte is inflated (anti zip bomb).

use super::areas::area_boundaries;
use super::manifest::{
    deserialize_scope, is_newer_minor, parse_manifest, spec_of, Codec, Manifest, ModuleId, MODULES,
};
use super::modules::TransitModule;
use super::{
    invalid, Document, MANIFEST_PATH, MAX_DOCUMENT_BYTES, MAX_JSON_BYTES, MAX_MANIFEST_BYTES,
    MODULE_ORDER,
};
use crate::city_data::{CityData, CitySource};
use crate::errors::VellumError;
use crate::parser::builder::build_city_data;
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use zip::result::ZipError;
use zip::{CompressionMethod, ZipArchive};

type Archive<'a> = ZipArchive<Cursor<&'a [u8]>>;

/// Opens a `.vellummap` held in memory and builds its `CityData` through the same
/// path as a `.cslmap`. `fileName` is left empty, as `parse_cslmap_bytes` does.
///
/// # Errors
/// `VellumError::UnsupportedVersion` for a document or module of another major;
/// `VellumError::InvalidFile` for anything else the contract does not allow
/// (not a zip, undeclared or missing entry, wrong size, hash or codec, unknown
/// field, inconsistent modules).
pub fn parse_vellummap_bytes(bytes: &[u8]) -> Result<CityData, VellumError> {
    parse_vellummap_observed(bytes, |_| {})
}

/// `parse_vellummap_bytes`, handing the unknown-`ItemClass` warnings to
/// `on_warnings` before `CityData` is built — as the `.cslmap` loop does.
pub(crate) fn parse_vellummap_observed(
    bytes: &[u8],
    on_warnings: impl FnOnce(&[String]),
) -> Result<CityData, VellumError> {
    let mut document = read_document(bytes)?;
    let district_grid = document.district_grid.take();
    let park_grid = document.park_grid.take();
    let city_id = document.manifest.city.id.take();

    let raw = document.into_raw();
    on_warnings(&raw.warnings());
    let mut city = build_city_data(raw)?;
    city.source = CitySource::Vellummap;
    city.city_id = city_id;

    // Area ids are `sourceId`s (1–255, checked by `Document::validate`), which
    // the adapter turned into the `id` strings.
    if let Some(grid) = district_grid {
        let mut boundaries = area_boundaries(&grid);
        for district in &mut city.districts {
            district.boundary = district
                .id
                .parse::<u8>()
                .ok()
                .and_then(|id| boundaries.remove(&id));
        }
    }
    if let Some(grid) = park_grid {
        let mut boundaries = area_boundaries(&grid);
        for park in &mut city.park_areas {
            park.boundary = park
                .id
                .parse::<u8>()
                .ok()
                .and_then(|id| boundaries.remove(&id));
        }
    }
    Ok(city)
}

/// Reads and fully validates a `.vellummap` into a `Document`.
pub(crate) fn read_document(bytes: &[u8]) -> Result<Document, VellumError> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| invalid(format!("not a .vellummap zip container: {e}")))?;

    // manifest + at most one entry per v1 module.
    if archive.len() > MODULES.len() + 1 {
        return Err(invalid(format!(
            "the archive has {} entries; a v1 document has at most {}",
            archive.len(),
            MODULES.len() + 1
        )));
    }

    // The zip crate indexes entries by name and silently keeps the last of two
    // with the same name: compare against the count the archive itself declares.
    if end_of_central_directory_entries(bytes) != Some(archive.len()) {
        return Err(invalid(
            "the archive declares duplicate entry names (or an entry count it does not hold)",
        ));
    }

    // Budget for the whole document, from declared sizes, before inflating anything.
    let mut declared_total: u64 = 0;
    for index in 0..archive.len() {
        let file = archive
            .by_index_raw(index)
            .map_err(|e| invalid(format!("cannot read entry {index}: {e}")))?;
        declared_total = declared_total.saturating_add(file.size());
    }
    if declared_total > MAX_DOCUMENT_BYTES {
        return Err(invalid(format!(
            "the archive declares {declared_total} decompressed bytes, above the {MAX_DOCUMENT_BYTES}-byte document budget"
        )));
    }

    let manifest_bytes = read_entry(
        &mut archive,
        MANIFEST_PATH,
        SizeRule::AtMost(MAX_MANIFEST_BYTES),
        None,
    )?;
    let manifest = parse_manifest(&manifest_bytes)?;

    let names: Vec<String> = archive.file_names().map(str::to_owned).collect();
    if let Some(extra) = names
        .iter()
        .find(|name| *name != MANIFEST_PATH && !manifest.modules.iter().any(|m| &m.path == *name))
    {
        return Err(invalid(format!(
            "the archive contains `{extra}`, which the manifest does not declare"
        )));
    }

    let mut data = read_modules(&archive, &manifest)?;
    // Each JSON module's fields follow that module's own `version`.
    let tolerant = |id: ModuleId| {
        manifest
            .entry(id)
            .is_some_and(|entry| is_newer_minor(&entry.version, spec_of(id).known_minor))
    };

    let mut take = |id: ModuleId| data.remove(&id);
    let required = |bytes: Option<Vec<u8>>, id: ModuleId| {
        // `parse_manifest` already guarantees every required module is declared.
        bytes.ok_or_else(|| invalid(format!("module `{}` is missing", spec_of(id).name)))
    };

    let document = Document {
        terrain: decode_u16le(&required(take(ModuleId::Terrain), ModuleId::Terrain)?),
        water: parse_json(
            "water.json",
            &required(take(ModuleId::Water), ModuleId::Water)?,
            tolerant(ModuleId::Water),
        )?,
        water_mask: required(take(ModuleId::WaterMask), ModuleId::WaterMask)?,
        water_depth: take(ModuleId::WaterDepth).map(|b| decode_u16le(&b)),
        vegetation: required(take(ModuleId::Vegetation), ModuleId::Vegetation)?,
        roads: parse_json(
            "roads.json",
            &required(take(ModuleId::Roads), ModuleId::Roads)?,
            tolerant(ModuleId::Roads),
        )?,
        transit: parse_transit(
            &manifest,
            &required(take(ModuleId::Transit), ModuleId::Transit)?,
            tolerant(ModuleId::Transit),
        )?,
        buildings: parse_json(
            "buildings.json",
            &required(take(ModuleId::Buildings), ModuleId::Buildings)?,
            tolerant(ModuleId::Buildings),
        )?,
        districts: parse_json(
            "districts.json",
            &required(take(ModuleId::Districts), ModuleId::Districts)?,
            tolerant(ModuleId::Districts),
        )?,
        parks: parse_json(
            "parks.json",
            &required(take(ModuleId::Parks), ModuleId::Parks)?,
            tolerant(ModuleId::Parks),
        )?,
        district_grid: take(ModuleId::DistrictGrid),
        park_grid: take(ModuleId::ParkGrid),
        manifest,
    };
    document.validate()?;
    Ok(document)
}

/// `transit.json` under the minor rule, plus one exception: `stationId` arrives
/// with transit 1.1, so unlike other known fields a transit `1.0` keeps
/// rejecting it as unknown (a 1.0 producer never wrote it).
fn parse_transit(
    manifest: &Manifest,
    bytes: &[u8],
    tolerant: bool,
) -> Result<TransitModule, VellumError> {
    let transit: TransitModule = parse_json("transit.json", bytes, tolerant)?;
    if manifest
        .entry(ModuleId::Transit)
        .is_some_and(|entry| !is_newer_minor(&entry.version, 0))
    {
        transit.reject_station_ids()?;
    }
    Ok(transit)
}

/// Inflates and hash-checks every declared module, each on its own thread: they
/// share only the read-only zip bytes. Results are checked in `MODULE_ORDER`, so
/// a broken document reports the same first error a sequential read would.
fn read_modules(
    archive: &Archive<'_>,
    manifest: &Manifest,
) -> Result<HashMap<ModuleId, Vec<u8>>, VellumError> {
    let jobs: Vec<_> = MODULE_ORDER
        .into_iter()
        .filter_map(|id| manifest.entry(id).map(|entry| (id, entry)))
        .collect();
    let results: Vec<Result<(ModuleId, Vec<u8>), VellumError>> = std::thread::scope(|scope| {
        let handles: Vec<_> = jobs
            .iter()
            .map(|&(id, entry)| {
                let mut archive = (*archive).clone();
                scope.spawn(move || {
                    let rule = match spec_of(id).grid {
                        Some(grid) => SizeRule::Exactly(grid.byte_len()),
                        None => SizeRule::AtMost(MAX_JSON_BYTES),
                    };
                    let bytes = read_entry(&mut archive, &entry.path, rule, Some(entry.codec))?;
                    let digest = sha256_hex(&bytes);
                    if digest != entry.sha256 {
                        return Err(invalid(format!(
                            "`{}` does not match its sha256 (manifest {}, content {digest})",
                            entry.path, entry.sha256
                        )));
                    }
                    Ok((id, bytes))
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .unwrap_or_else(|panic| std::panic::resume_unwind(panic))
            })
            .collect()
    });
    results.into_iter().collect()
}

/// Upper bound of the buffer allocated up front for an entry.
const INITIAL_CAPACITY: u64 = 1024 * 1024;

/// Number of entries the end-of-central-directory record declares, or `None`
/// if the record cannot be found.
fn end_of_central_directory_entries(bytes: &[u8]) -> Option<usize> {
    const EOCD_LEN: usize = 22;
    let last = bytes.len().checked_sub(EOCD_LEN)?;
    (0..=last).rev().find_map(|at| {
        let record = &bytes[at..];
        let comment = usize::from(u16::from_le_bytes([record[20], record[21]]));
        (record.starts_with(b"PK\x05\x06") && at + EOCD_LEN + comment == bytes.len())
            .then(|| usize::from(u16::from_le_bytes([record[10], record[11]])))
    })
}

#[derive(Clone, Copy)]
enum SizeRule {
    AtMost(u64),
    Exactly(u64),
}

/// Reads one entry fully into memory after checking its declared (central
/// directory) size, so an oversized entry is rejected without being inflated.
fn read_entry(
    archive: &mut Archive<'_>,
    path: &str,
    rule: SizeRule,
    codec: Option<Codec>,
) -> Result<Vec<u8>, VellumError> {
    let mut file = archive.by_name(path).map_err(|e| match e {
        ZipError::FileNotFound => invalid(format!("the archive has no `{path}`")),
        other => invalid(format!("cannot open `{path}`: {other}")),
    })?;

    let method = file.compression();
    let actual = match method {
        CompressionMethod::Deflated => Codec::Deflate,
        CompressionMethod::Stored => Codec::Stored,
        other => {
            return Err(invalid(format!(
                "`{path}` uses compression {other}; only deflate and stored are allowed"
            )))
        }
    };
    if let Some(declared) = codec {
        if declared != actual {
            return Err(invalid(format!(
                "`{path}` declares codec `{declared}` but is stored as `{actual}`"
            )));
        }
    }

    let size = file.size();
    match rule {
        SizeRule::AtMost(max) if size > max => {
            return Err(invalid(format!(
                "`{path}` declares {size} bytes, above the {max}-byte limit"
            )))
        }
        SizeRule::Exactly(expected) if size != expected => {
            return Err(invalid(format!(
                "`{path}` declares {size} bytes; its grid must measure exactly {expected}"
            )))
        }
        _ => {}
    }

    // The declared size is only a claim: start small and let the buffer grow with
    // the bytes that actually inflate.
    let mut buf = Vec::with_capacity(usize::try_from(size.min(INITIAL_CAPACITY)).unwrap_or(0));
    (&mut file)
        .take(size + 1)
        .read_to_end(&mut buf)
        .map_err(|e| invalid(format!("cannot read `{path}`: {e}")))?;
    if buf.len() as u64 != size {
        return Err(invalid(format!(
            "`{path}` inflates to {} bytes but declares {size}",
            buf.len()
        )));
    }
    Ok(buf)
}

/// Deserializes a JSON module in one pass. `tolerant` (a minor newer than the one
/// this reader knows) ignores unknown fields; otherwise the first is an error.
pub(crate) fn parse_json<T: DeserializeOwned>(
    file: &str,
    bytes: &[u8],
    tolerant: bool,
) -> Result<T, VellumError> {
    let mut de = serde_json::Deserializer::from_slice(bytes);
    let value = deserialize_scope(file, &mut de, tolerant)?;
    de.end().map_err(|e| invalid(format!("{file}: {e}")))?;
    Ok(value)
}

fn decode_u16le(bytes: &[u8]) -> Vec<u16> {
    bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect()
}

pub(crate) fn sha256_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    Sha256::digest(bytes)
        .iter()
        .fold(String::with_capacity(64), |mut hex, byte| {
            let _ = write!(hex, "{byte:02x}");
            hex
        })
}
