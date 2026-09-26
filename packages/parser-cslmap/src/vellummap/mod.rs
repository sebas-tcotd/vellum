//! `.vellummap` — Vellum's stable, versioned city document (Story 5.2).
//!
//! A zip holding a `manifest.json` and one entry per module: JSON for entities,
//! little-endian `.bin` grids for rasters. The contract is published as JSON Schema
//! in `schema/vellummap.schema.json` and documented in `docs/es/vellummap-format.md`.
//!
//! Reading is strict: anything the contract does not declare is a `VellumError`,
//! never a silent reinterpretation. A valid document is turned into a `RawCity` and
//! goes through the same `build_city_data` path as a `.cslmap`.

mod areas;
mod manifest;
mod modules;
mod read;
mod write;

#[cfg(test)]
mod tests;

pub use read::parse_vellummap_bytes;
pub(crate) use read::parse_vellummap_observed;
pub use write::cslmap_to_vellummap;

use crate::city_data::{District, Vec3};
use crate::errors::VellumError;
use crate::parser::builder::RawCity;
use crate::parser::handlers::buildings::RawBuilding;
use crate::parser::handlers::parks::RawParkArea;
use crate::parser::handlers::roads::{NodeElevation, RawRoadNode, RawRoadSegment};
use crate::parser::handlers::transit::{RawTransitLine, RawTransitStop};
use crate::parser::terrain::grid::{is_water, MIN_WATER_DEPTH};
use manifest::{Manifest, ModuleId};
use modules::{
    BuildingsModule, DistrictsModule, ParksModule, Position, RoadsModule, TransitModule,
    WaterModule,
};
use std::collections::HashSet;

/// Value of the manifest's `format` field.
pub(crate) const FORMAT: &str = "vellummap";
/// `exportSchemaVersion` written by this crate.
pub(crate) const EXPORT_SCHEMA_VERSION: &str = "1.0";
/// Version written for every module by this crate.
pub(crate) const MODULE_VERSION: &str = "1.0";
/// The only major (document and module) this reader understands.
pub(crate) const SUPPORTED_MAJOR: u32 = 1;
/// Path of the manifest inside the zip.
pub(crate) const MANIFEST_PATH: &str = "manifest.json";
/// Largest decompressed size accepted for a JSON module (anti zip bomb).
pub(crate) const MAX_JSON_BYTES: u64 = 256 * 1024 * 1024;
/// Largest total decompressed size a document may declare (all entries).
pub(crate) const MAX_DOCUMENT_BYTES: u64 = 1024 * 1024 * 1024;
/// Largest decompressed size accepted for `manifest.json` itself.
pub(crate) const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;

pub(crate) fn invalid(reason: impl Into<String>) -> VellumError {
    VellumError::InvalidFile {
        reason: reason.into(),
    }
}

/// A `.vellummap` decoded in memory: the manifest plus every module, already
/// deserialized (JSON) or unpacked (grids). Shared by the reader and the writer.
#[derive(Debug, Clone)]
pub(crate) struct Document {
    /// `modules` is recomputed by the writer; the reader keeps what the file declared.
    pub(crate) manifest: Manifest,
    /// `RawHeights2`, u16 raw units (1/64 m), 1081².
    pub(crate) terrain: Vec<u16>,
    pub(crate) water: WaterModule,
    /// 1 = wet (depth > `MIN_WATER_DEPTH`), 0 = dry, 1081².
    pub(crate) water_mask: Vec<u8>,
    /// Water depth, u16 raw units (1/64 m), 1081².
    pub(crate) water_depth: Option<Vec<u16>>,
    /// `m_tree` density, 512².
    pub(crate) vegetation: Vec<u8>,
    pub(crate) roads: RoadsModule,
    pub(crate) transit: TransitModule,
    pub(crate) buildings: BuildingsModule,
    pub(crate) districts: DistrictsModule,
    pub(crate) parks: ParksModule,
    /// 900² cells × (4 district ids + 4 alphas).
    pub(crate) district_grid: Option<Vec<u8>>,
    /// 900² cells × (4 park ids + 4 alphas).
    pub(crate) park_grid: Option<Vec<u8>>,
}

impl Document {
    /// Cross-module rules that no single schema can express.
    ///
    /// # Errors
    /// `VellumError::InvalidFile` naming the first rule broken.
    pub(crate) fn validate(&self) -> Result<(), VellumError> {
        self.water.validate()?;
        self.roads.validate()?;
        self.transit.validate()?;
        self.buildings.validate()?;
        self.districts.validate()?;
        self.parks.validate()?;

        match (&self.water_depth, &self.water.depth) {
            (Some(_), None) => {
                return Err(invalid(
                    "water-depth.bin is present but water.json has no `depth` provenance",
                ))
            }
            (None, Some(_)) => {
                return Err(invalid(
                    "water.json declares `depth` provenance but water-depth.bin is absent",
                ))
            }
            _ => {}
        }

        if let Some(cell) = self.water_mask.iter().position(|&v| v > 1) {
            return Err(invalid(format!(
                "water-mask.bin cell {cell} is {}; only 0 (dry) and 1 (wet) are allowed",
                self.water_mask[cell]
            )));
        }

        if let Some(depth) = &self.water_depth {
            let mismatch = self
                .water_mask
                .iter()
                .zip(depth)
                .position(|(&mask, &d)| (mask == 1) != is_water(f64::from(d)));
            if let Some(cell) = mismatch {
                return Err(invalid(format!(
                    "water-mask.bin disagrees with water-depth.bin at cell {cell}: mask {} but depth {} (wet means depth > {MIN_WATER_DEPTH})",
                    self.water_mask[cell], depth[cell]
                )));
            }
        }

        if let Some(grid) = &self.district_grid {
            let ids = self.districts.districts.iter().map(|d| d.source_id);
            check_area_grid("districts.bin", grid, ids, "districts.json")?;
        }
        if let Some(grid) = &self.park_grid {
            let ids = self.parks.parks.iter().map(|p| p.source_id);
            check_area_grid("parks.bin", grid, ids, "parks.json")?;
        }

        Ok(())
    }

    /// Projects the document onto the shared construction input.
    ///
    /// Without `water-depth.bin`, depth is synthesized from the mask as
    /// `2 · MIN_WATER_DEPTH` on wet cells: the land contour then follows the mask,
    /// which is the stable contract (it does not reproduce the sub-cell
    /// interpolation a captured depth gives).
    pub(crate) fn into_raw(self) -> RawCity {
        let elev_grid = self.terrain.iter().map(|&h| f64::from(h)).collect();
        let res_grid = match &self.water_depth {
            Some(depth) => depth.iter().map(|&d| f64::from(d)).collect(),
            None => self
                .water_mask
                .iter()
                .map(|&wet| if wet == 1 { 2.0 * MIN_WATER_DEPTH } else { 0.0 })
                .collect(),
        };

        let (node_elevations, road_nodes, road_segments) = raw_roads(self.roads);

        RawCity {
            city_name: self.manifest.city.name,
            generated_at: self.manifest.exported_at_utc,
            sea_level: self.water.sea_level,
            elev_grid,
            res_grid,
            forest_grid: self.vegetation,
            node_elevations,
            road_nodes,
            road_segments,
            transit_lines: self
                .transit
                .lines
                .into_iter()
                .map(|line| RawTransitLine {
                    id: line.source_id.to_string(),
                    name: line.name,
                    transport_type: line.transport_type,
                    color: line.color,
                    stops: line
                        .stops
                        .into_iter()
                        .map(|stop| RawTransitStop {
                            node_id: stop.source_id.to_string(),
                            position: stop.position.into(),
                            name: stop.name.unwrap_or_default(),
                            name_derived: stop.name_derived.unwrap_or(false),
                        })
                        .collect(),
                    route: line.route.iter().map(u32::to_string).collect(),
                })
                .collect(),
            buildings: self
                .buildings
                .buildings
                .into_iter()
                .map(|b| RawBuilding {
                    id: b.source_id.to_string(),
                    name: b.name,
                    item_class: b.item_class,
                    service_type: b.service_type,
                    footprint: b.footprint.into_iter().map(Vec3::from).collect(),
                })
                .collect(),
            districts: self
                .districts
                .districts
                .into_iter()
                .map(|d| District {
                    id: d.source_id.to_string(),
                    name: d.name,
                    position: d.label_position.into(),
                    boundary: None,
                })
                .collect(),
            park_areas: self
                .parks
                .parks
                .into_iter()
                .map(|p| RawParkArea {
                    id: p.source_id.to_string(),
                    name: p.name,
                    position: p.label_position.into(),
                    park_type: p.park_type.unwrap_or_default(),
                })
                .collect(),
        }
    }
}

/// `roads.json` onto the raw road collections: elevations (all nodes, in
/// order), positioned nodes and unclassified segments.
fn raw_roads(
    roads: RoadsModule,
) -> (
    Vec<(String, NodeElevation)>,
    Vec<RawRoadNode>,
    Vec<RawRoadSegment>,
) {
    let node_elevations = roads
        .nodes
        .iter()
        .map(|node| {
            (
                node.source_id.to_string(),
                NodeElevation {
                    elev: f64::from(node.elevation),
                    underground: node.underground,
                },
            )
        })
        .collect();
    let road_nodes = roads
        .nodes
        .into_iter()
        .map(|node| RawRoadNode {
            id: node.source_id.to_string(),
            position: node.position.into(),
        })
        .collect();
    let road_segments = roads
        .segments
        .into_iter()
        .map(|seg| RawRoadSegment {
            id: seg.source_id.to_string(),
            start_node_id: seg.start_node_source_id.to_string(),
            end_node_id: seg.end_node_source_id.to_string(),
            item_class: seg.item_class,
            width: seg.width,
            name: seg.name.filter(|name| !name.is_empty()),
            points: seg.points.into_iter().map(Vec3::from).collect(),
        })
        .collect();
    (node_elevations, road_nodes, road_segments)
}

/// With an area grid present, every area of the matching JSON module must have a
/// `sourceId` a grid byte can hold (1–255; 0 means "no area"), and every non-zero
/// id slot of the grid (4 ids + 4 alphas per cell) must name a declared area.
fn check_area_grid(
    file: &str,
    grid: &[u8],
    ids: impl IntoIterator<Item = u32>,
    module: &str,
) -> Result<(), VellumError> {
    let mut known = HashSet::new();
    for id in ids {
        if !(1..=255).contains(&id) {
            return Err(invalid(format!(
                "{module} declares sourceId {id}, which {file} cannot reference (1–255)"
            )));
        }
        known.insert(id);
    }
    for (cell, sample) in grid.chunks_exact(8).enumerate() {
        for &id in &sample[..4] {
            if id != 0 && !known.contains(&u32::from(id)) {
                return Err(invalid(format!(
                    "{file} cell {cell} references id {id}, which {module} does not declare"
                )));
            }
        }
    }
    Ok(())
}

impl From<Position> for Vec3 {
    fn from(p: Position) -> Self {
        Vec3 {
            x: p.x,
            y: p.y,
            z: p.z,
        }
    }
}

impl From<&Vec3> for Position {
    fn from(v: &Vec3) -> Self {
        Position {
            x: v.x,
            y: v.y,
            z: v.z,
        }
    }
}

/// Module ids in the canonical order the writer emits them.
pub(crate) const MODULE_ORDER: [ModuleId; 12] = [
    ModuleId::Terrain,
    ModuleId::Water,
    ModuleId::WaterMask,
    ModuleId::WaterDepth,
    ModuleId::Vegetation,
    ModuleId::Roads,
    ModuleId::Transit,
    ModuleId::Buildings,
    ModuleId::Districts,
    ModuleId::Parks,
    ModuleId::DistrictGrid,
    ModuleId::ParkGrid,
];
