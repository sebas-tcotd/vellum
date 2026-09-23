//! JSON modules of a `.vellummap`. Every type denies unknown fields: the
//! document is strict, a field v1 does not declare is an error.

use super::invalid;
use crate::errors::VellumError;
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashSet;

/// Largest integer JSON consumers (JavaScript) represent exactly: 2^53 − 1.
pub(crate) const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

/// `sourceId`s must be unique within a collection. JSON Schema cannot express
/// uniqueness by key, so this is a reader-only rule.
pub(crate) fn check_unique_ids(
    what: &str,
    ids: impl IntoIterator<Item = u32>,
) -> Result<HashSet<u32>, VellumError> {
    let mut seen = HashSet::new();
    for id in ids {
        if !seen.insert(id) {
            return Err(invalid(format!(
                "{what}: sourceId {id} appears more than once"
            )));
        }
    }
    Ok(seen)
}

/// For optional fields: absent → `None`, present → must be a valid value.
/// An explicit `null` is rejected, as the JSON Schema does.
pub(crate) fn non_null<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}

/// World-space position, in game units (x/z horizontal, y vertical).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Position {
    pub(crate) x: f64,
    pub(crate) y: f64,
    pub(crate) z: f64,
}

// ─── water.json ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WaterModule {
    /// Sea level in metres.
    pub(crate) sea_level: f64,
    /// Provenance of `water-depth.bin`; present exactly when that module is.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) depth: Option<DepthProvenance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DepthProvenance {
    /// Whether the water simulation was paused at capture. Depth captured with the
    /// simulation running is not comparable cell by cell with another capture.
    pub(crate) simulation_paused: bool,
    /// Water simulation frame at capture, when the producer knows it.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) frame_index: Option<u64>,
}

// ─── roads.json ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RoadsModule {
    pub(crate) nodes: Vec<RoadNodeDoc>,
    pub(crate) segments: Vec<RoadSegmentDoc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RoadNodeDoc {
    pub(crate) source_id: u32,
    pub(crate) position: Position,
    /// `NetNode.m_elevation`: height above ground of an elevated node.
    pub(crate) elevation: u8,
    /// `NetNode.Flags.Underground`.
    pub(crate) underground: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RoadSegmentDoc {
    pub(crate) source_id: u32,
    pub(crate) start_node_source_id: u32,
    pub(crate) end_node_source_id: u32,
    /// The network prefab's `ItemClass` name — the source of truth for classification.
    pub(crate) item_class: String,
    pub(crate) width: f64,
    /// Curve points along the segment, start to end.
    pub(crate) points: Vec<Position>,
}

// ─── transit.json ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TransitModule {
    pub(crate) lines: Vec<TransitLineDoc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TransitLineDoc {
    pub(crate) source_id: u32,
    pub(crate) name: String,
    /// The game's `TransportInfo.TransportType` name (`Bus`, `Metro`, `Ship`, …).
    pub(crate) transport_type: String,
    /// Visible line color, `#RRGGBBAA` uppercase.
    pub(crate) color: String,
    pub(crate) stops: Vec<TransitStopDoc>,
    /// Segment `sourceId`s of the whole route, in travel order.
    pub(crate) route: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TransitStopDoc {
    /// `sourceId` of the stop's node.
    pub(crate) source_id: u32,
    pub(crate) position: Position,
    /// Absent when the stop has no name (no named street, no custom name).
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) name: Option<String>,
    /// `true` when `name` was derived from the street, not assigned in game.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) name_derived: Option<bool>,
}

impl WaterModule {
    pub(crate) fn validate(&self) -> Result<(), VellumError> {
        match &self.depth {
            Some(DepthProvenance {
                frame_index: Some(frame),
                ..
            }) if *frame > MAX_SAFE_INTEGER => Err(invalid(format!(
                "water.json: frameIndex {frame} is above {MAX_SAFE_INTEGER}"
            ))),
            _ => Ok(()),
        }
    }
}

impl RoadsModule {
    /// Unique ids (reader-only), segment endpoints that exist among the nodes
    /// (reader-only) and non-negative widths (also in the schema).
    pub(crate) fn validate(&self) -> Result<(), VellumError> {
        let nodes = check_unique_ids("roads.json nodes", self.nodes.iter().map(|n| n.source_id))?;
        check_unique_ids(
            "roads.json segments",
            self.segments.iter().map(|s| s.source_id),
        )?;
        for seg in &self.segments {
            for (end, node) in [
                ("startNodeSourceId", seg.start_node_source_id),
                ("endNodeSourceId", seg.end_node_source_id),
            ] {
                if !nodes.contains(&node) {
                    return Err(invalid(format!(
                        "roads.json segment {}: {end} {node} is not a declared node",
                        seg.source_id
                    )));
                }
            }
            if seg.width < 0.0 {
                return Err(invalid(format!(
                    "roads.json segment {}: width {} is negative",
                    seg.source_id, seg.width
                )));
            }
        }
        Ok(())
    }
}

impl TransitModule {
    pub(crate) fn validate(&self) -> Result<(), VellumError> {
        check_unique_ids("transit.json lines", self.lines.iter().map(|l| l.source_id))?;
        for line in &self.lines {
            if !is_rgba_hex(&line.color) {
                return Err(invalid(format!(
                    "transit.json line {}: color `{}` must be #RRGGBBAA uppercase hex",
                    line.source_id, line.color
                )));
            }
            for stop in &line.stops {
                if stop.name.as_deref() == Some("") {
                    return Err(invalid(format!(
                        "transit.json line {} stop {}: `name` must not be empty (omit it instead)",
                        line.source_id, stop.source_id
                    )));
                }
                if stop.name_derived.is_some() && stop.name.is_none() {
                    return Err(invalid(format!(
                        "transit.json line {} stop {}: `nameDerived` requires `name`",
                        line.source_id, stop.source_id
                    )));
                }
            }
        }
        Ok(())
    }
}

fn is_rgba_hex(color: &str) -> bool {
    color.len() == 9
        && color.starts_with('#')
        && color[1..]
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'A'..=b'F').contains(&b))
}

// ─── buildings.json ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildingsModule {
    pub(crate) buildings: Vec<BuildingDoc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BuildingDoc {
    pub(crate) source_id: u32,
    /// Prefab (asset) name.
    pub(crate) name: String,
    pub(crate) item_class: String,
    /// The prefab's sub-service (`ResidentialLow`, …).
    pub(crate) service_type: String,
    /// Footprint polygon; its first point is the building's anchor.
    pub(crate) footprint: Vec<Position>,
}

// ─── districts.json / parks.json ─────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DistrictsModule {
    pub(crate) districts: Vec<DistrictDoc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DistrictDoc {
    pub(crate) source_id: u32,
    pub(crate) name: String,
    pub(crate) label_position: Position,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ParksModule {
    pub(crate) parks: Vec<ParkDoc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ParkDoc {
    pub(crate) source_id: u32,
    pub(crate) name: String,
    pub(crate) label_position: Position,
    /// The game's park type name (`Generic`, `Zoo`, `Airport`, …), unreduced.
    #[serde(
        default,
        deserialize_with = "non_null",
        skip_serializing_if = "Option::is_none"
    )]
    pub(crate) park_type: Option<String>,
}

impl BuildingsModule {
    pub(crate) fn validate(&self) -> Result<(), VellumError> {
        check_unique_ids("buildings.json", self.buildings.iter().map(|b| b.source_id)).map(|_| ())
    }
}

impl DistrictsModule {
    pub(crate) fn validate(&self) -> Result<(), VellumError> {
        check_unique_ids("districts.json", self.districts.iter().map(|d| d.source_id)).map(|_| ())
    }
}

impl ParksModule {
    pub(crate) fn validate(&self) -> Result<(), VellumError> {
        check_unique_ids("parks.json", self.parks.iter().map(|p| p.source_id))?;
        if let Some(park) = self
            .parks
            .iter()
            .find(|p| p.park_type.as_deref() == Some(""))
        {
            return Err(invalid(format!(
                "parks.json park {}: `parkType` must not be empty (omit it instead)",
                park.source_id
            )));
        }
        Ok(())
    }
}
