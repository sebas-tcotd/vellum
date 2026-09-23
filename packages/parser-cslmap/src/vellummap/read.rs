//! Strict `.vellummap` reader: zip → validated `Document` → `CityData`.
//!
//! Everything is read in memory. Each entry's declared size is checked against
//! its limit before a single byte is inflated (anti zip bomb).

use super::manifest::{parse_manifest, spec_of, Codec, ModuleId, MODULES};
use super::{
    invalid, Document, MANIFEST_PATH, MAX_DOCUMENT_BYTES, MAX_JSON_BYTES, MAX_MANIFEST_BYTES,
    MODULE_ORDER,
};
use crate::city_data::CityData;
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
    build_city_data(read_document(bytes)?.into_raw())
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

    let mut data: HashMap<ModuleId, Vec<u8>> = HashMap::new();
    for id in MODULE_ORDER {
        let Some(entry) = manifest.entry(id) else {
            continue;
        };
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
        data.insert(id, bytes);
    }

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
        )?,
        water_mask: required(take(ModuleId::WaterMask), ModuleId::WaterMask)?,
        water_depth: take(ModuleId::WaterDepth).map(|b| decode_u16le(&b)),
        vegetation: required(take(ModuleId::Vegetation), ModuleId::Vegetation)?,
        roads: parse_json(
            "roads.json",
            &required(take(ModuleId::Roads), ModuleId::Roads)?,
        )?,
        transit: parse_json(
            "transit.json",
            &required(take(ModuleId::Transit), ModuleId::Transit)?,
        )?,
        buildings: parse_json(
            "buildings.json",
            &required(take(ModuleId::Buildings), ModuleId::Buildings)?,
        )?,
        districts: parse_json(
            "districts.json",
            &required(take(ModuleId::Districts), ModuleId::Districts)?,
        )?,
        parks: parse_json(
            "parks.json",
            &required(take(ModuleId::Parks), ModuleId::Parks)?,
        )?,
        district_grid: take(ModuleId::DistrictGrid),
        park_grid: take(ModuleId::ParkGrid),
        manifest,
    };
    document.validate()?;
    Ok(document)
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

fn parse_json<T: DeserializeOwned>(file: &str, bytes: &[u8]) -> Result<T, VellumError> {
    serde_json::from_slice(bytes).map_err(|e| invalid(format!("{file}: {e}")))
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
