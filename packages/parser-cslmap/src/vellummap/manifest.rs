//! `manifest.json`: document metadata and the table of modules.

use super::modules::non_null;
use super::{invalid, FORMAT, SUPPORTED_MAJOR};
use crate::errors::VellumError;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

// ─── Serde types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Manifest {
    /// Always `"vellummap"`; checked before strict deserialization.
    pub(crate) format: String,
    pub(crate) export_schema_version: String,
    pub(crate) snapshot_id: String,
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) parent_snapshot_id: Option<String>,
    pub(crate) exported_at_utc: String,
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) game_time: Option<String>,
    pub(crate) game: GameInfo,
    pub(crate) producer: Producer,
    pub(crate) city: CityInfo,
    pub(crate) modules: Vec<ModuleEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct GameInfo {
    pub(crate) version: String,
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) instance_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Producer {
    pub(crate) name: String,
    pub(crate) version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CityInfo {
    pub(crate) name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ModuleEntry {
    pub(crate) id: String,
    pub(crate) path: String,
    pub(crate) version: String,
    pub(crate) codec: Codec,
    /// Lowercase hex SHA-256 of the entry's decompressed bytes.
    pub(crate) sha256: String,
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) grid: Option<Grid>,
}

/// Compression of a zip entry. Must match the entry's real compression method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Codec {
    Deflate,
    Stored,
}

impl std::fmt::Display for Codec {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Codec::Deflate => "deflate",
            Codec::Stored => "stored",
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Grid {
    /// Cells per side; the grid is `resolution²` samples, row-major.
    pub(crate) resolution: u32,
    /// World units per cell side.
    pub(crate) cell_size: f64,
    pub(crate) sample: Sample,
    /// Metres per raw unit, for height/depth grids.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) scale: Option<f64>,
}

impl Grid {
    /// Exact decompressed size of the grid, in bytes.
    pub(crate) fn byte_len(&self) -> u64 {
        u64::from(self.resolution) * u64::from(self.resolution) * self.sample.bytes()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) enum Sample {
    #[serde(rename = "u8")]
    U8,
    #[serde(rename = "u16le")]
    U16Le,
    /// 8 bytes per cell: 4 area ids followed by their 4 alphas.
    #[serde(rename = "u8x8")]
    U8x8,
}

impl Sample {
    pub(crate) fn bytes(self) -> u64 {
        match self {
            Sample::U8 => 1,
            Sample::U16Le => 2,
            Sample::U8x8 => 8,
        }
    }
}

// ─── Module table ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum ModuleId {
    Terrain,
    Water,
    WaterMask,
    WaterDepth,
    Vegetation,
    Roads,
    Transit,
    Buildings,
    Districts,
    Parks,
    DistrictGrid,
    ParkGrid,
}

/// What v1 fixes for a module: its file, whether it is mandatory and, for
/// grids, the exact shape.
pub(crate) struct ModuleSpec {
    pub(crate) id: ModuleId,
    pub(crate) name: &'static str,
    pub(crate) path: &'static str,
    pub(crate) required: bool,
    pub(crate) grid: Option<Grid>,
}

const HEIGHT_SCALE: f64 = 1.0 / 64.0;
const WORLD_SIZE: f64 = 17_280.0;

const TERRAIN_GRID: Grid = Grid {
    resolution: 1081,
    cell_size: 16.0,
    sample: Sample::U16Le,
    scale: Some(HEIGHT_SCALE),
};
const MASK_GRID: Grid = Grid {
    resolution: 1081,
    cell_size: 16.0,
    sample: Sample::U8,
    scale: None,
};
const VEGETATION_GRID: Grid = Grid {
    resolution: 512,
    cell_size: WORLD_SIZE / 512.0,
    sample: Sample::U8,
    scale: None,
};
const AREA_GRID: Grid = Grid {
    resolution: 900,
    cell_size: WORLD_SIZE / 900.0,
    sample: Sample::U8x8,
    scale: None,
};

pub(crate) const MODULES: [ModuleSpec; 12] = [
    spec(
        ModuleId::Terrain,
        "terrain",
        "terrain.bin",
        true,
        Some(TERRAIN_GRID),
    ),
    spec(ModuleId::Water, "water", "water.json", true, None),
    spec(
        ModuleId::WaterMask,
        "water-mask",
        "water-mask.bin",
        true,
        Some(MASK_GRID),
    ),
    spec(
        ModuleId::WaterDepth,
        "water-depth",
        "water-depth.bin",
        false,
        Some(TERRAIN_GRID),
    ),
    spec(
        ModuleId::Vegetation,
        "vegetation",
        "vegetation.bin",
        true,
        Some(VEGETATION_GRID),
    ),
    spec(ModuleId::Roads, "roads", "roads.json", true, None),
    spec(ModuleId::Transit, "transit", "transit.json", true, None),
    spec(
        ModuleId::Buildings,
        "buildings",
        "buildings.json",
        true,
        None,
    ),
    spec(
        ModuleId::Districts,
        "districts",
        "districts.json",
        true,
        None,
    ),
    spec(ModuleId::Parks, "parks", "parks.json", true, None),
    spec(
        ModuleId::DistrictGrid,
        "district-grid",
        "districts.bin",
        false,
        Some(AREA_GRID),
    ),
    spec(
        ModuleId::ParkGrid,
        "park-grid",
        "parks.bin",
        false,
        Some(AREA_GRID),
    ),
];

const fn spec(
    id: ModuleId,
    name: &'static str,
    path: &'static str,
    required: bool,
    grid: Option<Grid>,
) -> ModuleSpec {
    ModuleSpec {
        id,
        name,
        path,
        required,
        grid,
    }
}

/// `MODULES` is laid out in `ModuleId` declaration order (checked by a test).
pub(crate) fn spec_of(id: ModuleId) -> &'static ModuleSpec {
    &MODULES[id as usize]
}

fn spec_named(name: &str) -> Option<&'static ModuleSpec> {
    MODULES.iter().find(|s| s.name == name)
}

// ─── Versions ─────────────────────────────────────────────────────────────────

/// Whether `s` has the `MAJOR.MINOR` shape (decimal, no leading zeros).
fn is_version_shape(s: &str) -> bool {
    let canonical = |p: &str| {
        !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) && (p == "0" || !p.starts_with('0'))
    };
    s.split_once('.')
        .is_some_and(|(major, minor)| canonical(major) && canonical(minor))
}

/// A malformed version is an invalid file; a well-formed one of another major —
/// including a major too large for u32 — is `UnsupportedVersion`. Any minor of
/// major 1 is accepted.
pub(crate) fn check_version(field: &str, found: &str) -> Result<(), VellumError> {
    if !is_version_shape(found) {
        return Err(invalid(format!(
            "{field} `{found}` is not a MAJOR.MINOR version"
        )));
    }
    let major = found.split('.').next().and_then(|m| m.parse::<u32>().ok());
    if major != Some(SUPPORTED_MAJOR) {
        return Err(VellumError::UnsupportedVersion {
            found: found.to_owned(),
        });
    }
    Ok(())
}

// ─── Parsing & validation ─────────────────────────────────────────────────────

/// Parses and validates `manifest.json`.
///
/// `format` and `exportSchemaVersion` are checked on the untyped JSON first, so a
/// document from a future major is reported as `UnsupportedVersion` even when it
/// carries fields v1 does not know.
///
/// # Errors
/// `UnsupportedVersion` for a document or module of another major; `InvalidFile`
/// for anything else the contract does not allow.
pub(crate) fn parse_manifest(bytes: &[u8]) -> Result<Manifest, VellumError> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|e| invalid(format!("manifest.json is not valid JSON: {e}")))?;
    let Some(object) = value.as_object() else {
        return Err(invalid("manifest.json must be a JSON object"));
    };
    if object.get("format").and_then(serde_json::Value::as_str) != Some(FORMAT) {
        return Err(invalid(format!(
            "manifest.json: `format` must be \"{FORMAT}\""
        )));
    }
    let Some(version) = object
        .get("exportSchemaVersion")
        .and_then(serde_json::Value::as_str)
    else {
        return Err(invalid(
            "manifest.json: `exportSchemaVersion` is missing or not a string",
        ));
    };
    check_version("exportSchemaVersion", version)?;

    let manifest: Manifest =
        serde_json::from_value(value).map_err(|e| invalid(format!("manifest.json: {e}")))?;
    manifest.validate()?;
    Ok(manifest)
}

impl Manifest {
    /// Rules on top of the serde shape; mirrors the JSON Schema.
    fn validate(&self) -> Result<(), VellumError> {
        non_empty("snapshotId", &self.snapshot_id)?;
        if !is_rfc3339_utc(&self.exported_at_utc) {
            return Err(invalid(format!(
                "manifest.json: exportedAtUtc `{}` must be an RFC 3339 UTC timestamp ending in `Z` (e.g. 2026-06-10T17:35:58Z)",
                self.exported_at_utc
            )));
        }
        non_empty("game.version", &self.game.version)?;
        non_empty("producer.name", &self.producer.name)?;
        non_empty("producer.version", &self.producer.version)?;
        for (field, value) in [
            ("parentSnapshotId", &self.parent_snapshot_id),
            ("gameTime", &self.game_time),
            ("game.instanceId", &self.game.instance_id),
        ] {
            if let Some(value) = value {
                non_empty(field, value)?;
            }
        }

        let mut seen = HashSet::new();
        for entry in &self.modules {
            let Some(spec) = spec_named(&entry.id) else {
                return Err(invalid(format!(
                    "manifest.json declares unknown module `{}`",
                    entry.id
                )));
            };
            if !seen.insert(spec.id) {
                return Err(invalid(format!(
                    "manifest.json declares module `{}` twice",
                    entry.id
                )));
            }
            if entry.path != spec.path {
                return Err(invalid(format!(
                    "module `{}` must live at `{}`, not `{}`",
                    entry.id, spec.path, entry.path
                )));
            }
            check_version(&format!("module `{}` version", entry.id), &entry.version)?;
            if entry.sha256.len() != 64
                || !entry
                    .sha256
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            {
                return Err(invalid(format!(
                    "module `{}`: sha256 must be 64 lowercase hex characters",
                    entry.id
                )));
            }
            check_grid(&entry.id, entry.grid.as_ref(), spec.grid.as_ref())?;
        }

        if let Some(missing) = MODULES
            .iter()
            .find(|spec| spec.required && !seen.contains(&spec.id))
        {
            return Err(invalid(format!(
                "manifest.json is missing the required module `{}`",
                missing.name
            )));
        }
        Ok(())
    }

    /// The manifest entry of a module, if declared.
    pub(crate) fn entry(&self, id: ModuleId) -> Option<&ModuleEntry> {
        let name = spec_of(id).name;
        self.modules.iter().find(|m| m.id == name)
    }
}

/// `YYYY-MM-DDTHH:MM:SS[.fraction]Z`: RFC 3339 in UTC, uppercase `T` and `Z`,
/// no offset. The day must exist in its month (leap years included); second 60
/// is allowed for leap seconds, as RFC 3339 does.
pub(crate) fn is_rfc3339_utc(s: &str) -> bool {
    let b = s.as_bytes();
    let digits = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = s.get(range)?;
        if part.bytes().all(|c| c.is_ascii_digit()) {
            part.parse().ok()
        } else {
            None
        }
    };
    if b.len() < 20
        || b[4] != b'-'
        || b[7] != b'-'
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
        || b[b.len() - 1] != b'Z'
    {
        return false;
    }
    let fraction = &s[19..s.len() - 1];
    let fraction_ok = fraction.is_empty()
        || (fraction.len() > 1
            && fraction.starts_with('.')
            && fraction[1..].bytes().all(|c| c.is_ascii_digit()));
    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second)) = (
        digits(0..4),
        digits(5..7),
        digits(8..10),
        digits(11..13),
        digits(14..16),
        digits(17..19),
    ) else {
        return false;
    };
    fraction_ok
        && (1..=12).contains(&month)
        && (1..=days_in_month(year, month)).contains(&day)
        && hour <= 23
        && minute <= 59
        && second <= 60
}

pub(crate) fn days_in_month(year: u32, month: u32) -> u32 {
    match month {
        2 if (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400) => {
            29
        }
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn non_empty(field: &str, value: &str) -> Result<(), VellumError> {
    if value.is_empty() {
        Err(invalid(format!(
            "manifest.json: `{field}` must not be empty"
        )))
    } else {
        Ok(())
    }
}

/// Grids are fixed in v1: the declared shape must equal the expected one exactly.
#[allow(clippy::float_cmp)] // exact by contract: these are constants, not measurements
fn check_grid(
    id: &str,
    declared: Option<&Grid>,
    expected: Option<&Grid>,
) -> Result<(), VellumError> {
    match (declared, expected) {
        (None, None) => Ok(()),
        (Some(_), None) => Err(invalid(format!(
            "module `{id}` is JSON and must not declare a `grid`"
        ))),
        (None, Some(_)) => Err(invalid(format!("module `{id}` must declare its `grid`"))),
        (Some(d), Some(e)) => {
            if d.resolution == e.resolution
                && d.cell_size == e.cell_size
                && d.sample == e.sample
                && d.scale == e.scale
            {
                Ok(())
            } else {
                Err(invalid(format!(
                    "module `{id}` grid must be {e:?}, found {d:?}"
                )))
            }
        }
    }
}
