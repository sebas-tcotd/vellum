use super::handlers::buildings::{BuildingBuilder, RawBuilding};
use super::handlers::districts::DistrictBuilder;
use super::handlers::parks::{park_type_from_xml, ParkBuilder, RawParkArea};
use super::handlers::roads::{
    classify_way_type, unknown_item_class_warnings, BoundsTracker, NodeElevation, RawRoadNode,
    RawRoadSegment, RoadBuilder,
};
use super::handlers::transit::{parse_transit_mode, RawTransitLine, TransitBuilder};
use super::terrain::grid::{FOREST_GRID_SIZE, TERRAIN_GRID_SIZE};
use super::terrain::{grid, texture, vectorizer};
use super::types::TextElement;
use crate::city_data::{
    Building, CityData, CitySource, District, ParkArea, PathSegment, RoadNode, RoadSegment,
    TransitLine, TransitStop, Vec3,
};
use crate::errors::VellumError;
use std::collections::HashMap;

// ─── RawCity ─────────────────────────────────────────────────────────────────

/// Everything a source contributes to a city, before any derivation.
///
/// Both sources end here: the `.cslmap` XML parser (`CityDataBuilder::into_raw`)
/// and the `.vellummap` adapter. `build_city_data` is the single path from this
/// shape to `CityData` — vectorization, `WayType` classification, bounds, forest
/// cells and building anchors are derived there and nowhere else.
#[derive(Debug, Clone, Default)]
pub(crate) struct RawCity {
    pub(crate) city_name: String,
    pub(crate) generated_at: String,
    /// Sea level in metres (scalar reported by the game).
    pub(crate) sea_level: f64,
    /// Terrain heights in raw units (1/64 m), row-major 1081 × 1081. May be shorter
    /// for synthetic inputs; `build_city_data` pads it with zeros.
    pub(crate) elev_grid: Vec<f64>,
    /// Water depth in raw units (1/64 m), aligned with `elev_grid`.
    pub(crate) res_grid: Vec<f64>,
    /// Vegetation density (`m_tree`), row-major 512 × 512, 0–255.
    pub(crate) forest_grid: Vec<u8>,
    pub(crate) road_nodes: Vec<RawRoadNode>,
    /// Elevation per node ID, in source order (later entries win). May name nodes
    /// that have no position.
    pub(crate) node_elevations: Vec<(String, NodeElevation)>,
    pub(crate) road_segments: Vec<RawRoadSegment>,
    pub(crate) transit_lines: Vec<RawTransitLine>,
    pub(crate) buildings: Vec<RawBuilding>,
    pub(crate) districts: Vec<District>,
    pub(crate) park_areas: Vec<RawParkArea>,
}

impl RawCity {
    /// Source-independent warnings (unknown `ItemClass`), in segment order.
    pub(crate) fn warnings(&self) -> Vec<String> {
        unknown_item_class_warnings(&self.road_segments)
    }
}

// ─── Builder ─────────────────────────────────────────────────────────────────

#[derive(Default)]
pub(crate) struct CityDataBuilder {
    // City metadata
    city_name: String,
    generated_at: String,
    sea_level: f64,

    // Raw terrain grids (row-major, 1081×1081). Populated during Ter CSV parse;
    // vectorized into TerrainPolygon/TerrainBand in build().
    elev_grid: Vec<f64>,
    res_grid: Vec<f64>,
    forest_row: usize,
    /// Row-major 512 × 512 density grid, allocated on the first `<Forest>` row.
    forest_grid: Vec<u8>,

    // Pending text content for simple text elements
    pending_text: String,
    text_element: TextElement,

    // Domain sub-builders
    roads: RoadBuilder,
    transit: TransitBuilder,
    buildings: BuildingBuilder,
    districts: DistrictBuilder,
    parks: ParkBuilder,
}

impl CityDataBuilder {
    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn handle_start(
        &mut self,
        e: &quick_xml::events::BytesStart<'_>,
    ) -> Result<(), VellumError> {
        let local = e.name().local_name();
        self.pending_text.clear();
        self.text_element = TextElement::None;

        match local.as_ref() {
            b"CSLExportXML" => {}
            b"City" => self.text_element = TextElement::City,
            b"Generated" => self.text_element = TextElement::Generated,
            b"SeaLevel" => self.text_element = TextElement::SeaLevel,
            b"Ter" => self.text_element = TextElement::Ter,
            b"Forest" => self.text_element = TextElement::Forest,
            _ => {
                if let Some(te) = self.roads.handle_start(e) {
                    self.text_element = te;
                }
                self.transit.handle_start(e);
                self.buildings.handle_start(e);
                self.districts.handle_start(e);
                if let Some(te) = self.parks.handle_start(e) {
                    self.text_element = te;
                }
            }
        }

        Ok(())
    }

    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn handle_empty(
        &mut self,
        e: &quick_xml::events::BytesStart<'_>,
    ) -> Result<(), VellumError> {
        self.roads.handle_empty(e);
        self.transit
            .handle_empty(e, &self.roads.node_position_index);
        self.buildings.handle_empty(e);
        self.districts.handle_empty(e);
        self.parks.handle_empty(e);
        Ok(())
    }

    pub(crate) fn handle_text(&mut self, text: &str) {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return;
        }
        match self.text_element {
            TextElement::City => self.city_name.push_str(trimmed),
            TextElement::Generated => self.generated_at.push_str(trimmed),
            TextElement::SeaLevel | TextElement::Ter | TextElement::Forest => {
                self.pending_text.push_str(trimmed);
            }
            TextElement::Sg => self.roads.handle_text_sg(trimmed),
            TextElement::ParkType => self.parks.handle_text(trimmed),
            TextElement::None => {}
        }
    }

    pub(crate) fn handle_end(&mut self, e: &quick_xml::events::BytesEnd<'_>) {
        let local = e.name().local_name();
        self.text_element = TextElement::None;

        match local.as_ref() {
            b"SeaLevel" => {
                let text = std::mem::take(&mut self.pending_text);
                if let Ok(v) = text.trim().parse::<f64>() {
                    if v.is_finite() {
                        self.sea_level = v;
                    } else {
                        eprintln!("[parser-cslmap] SeaLevel value is not finite: {text:?}");
                    }
                } else if !text.is_empty() {
                    eprintln!("[parser-cslmap] SeaLevel parse failed: {text:?}");
                }
            }
            b"Ter" => {
                let csv = std::mem::take(&mut self.pending_text);
                if !csv.is_empty() {
                    grid::parse_terrain_csv(&csv, &mut self.elev_grid, &mut self.res_grid);
                }
            }
            b"Forest" => {
                let csv = std::mem::take(&mut self.pending_text);
                if !csv.is_empty() {
                    if self.forest_grid.is_empty() {
                        self.forest_grid = vec![0; FOREST_GRID_SIZE * FOREST_GRID_SIZE];
                    }
                    grid::parse_forest_csv(&csv, self.forest_row, &mut self.forest_grid);
                    self.forest_row += 1;
                }
            }
            _ => {
                self.roads.handle_end(local.as_ref());
                self.transit
                    .handle_end(local.as_ref(), &mut self.roads.transit_route_by_nodes);
                self.buildings.handle_end(local.as_ref());
                self.districts.handle_end(local.as_ref());
                self.parks.handle_end(local.as_ref());
            }
        }
    }

    /// Hands over everything parsed so far, before any derivation.
    pub(crate) fn into_raw(mut self) -> RawCity {
        if self.forest_grid.is_empty() {
            self.forest_grid = vec![0; FOREST_GRID_SIZE * FOREST_GRID_SIZE];
        }
        RawCity {
            city_name: self.city_name,
            generated_at: self.generated_at,
            sea_level: self.sea_level,
            elev_grid: self.elev_grid,
            res_grid: self.res_grid,
            forest_grid: self.forest_grid,
            road_nodes: self.roads.road_nodes,
            node_elevations: self.roads.node_elevations,
            road_segments: self.roads.road_segments,
            transit_lines: self.transit.transit_lines,
            buildings: self.buildings.buildings,
            districts: self.districts.districts,
            park_areas: self.parks.park_areas,
        }
    }
}

// ─── build_city_data ─────────────────────────────────────────────────────────

/// The single construction path from a `RawCity` to `CityData`, shared by the
/// `.cslmap` parser and the `.vellummap` adapter.
///
/// # Errors
/// Returns `VellumError::ExportFailed` if the terrain DEM cannot be encoded.
pub(crate) fn build_city_data(mut raw: RawCity) -> Result<CityData, VellumError> {
    for w in raw.warnings() {
        eprintln!("[parser-cslmap] DLC warning: {w}");
    }

    let sea_level = raw.sea_level;

    let expected_len = TERRAIN_GRID_SIZE * TERRAIN_GRID_SIZE;
    if raw.elev_grid.len() < expected_len {
        if !raw.elev_grid.is_empty() {
            eprintln!(
                "[parser-cslmap] Terrain grid has {} entries, expected {}; padding with zeros",
                raw.elev_grid.len(),
                expected_len
            );
        }
        raw.elev_grid.resize(expected_len, 0.0);
    }
    // Padded on its own: a short depth grid must not index out of range.
    if raw.res_grid.len() < expected_len {
        raw.res_grid.resize(expected_len, 0.0);
    }

    let mut bounds = BoundsTracker::default();
    for node in &raw.road_nodes {
        bounds.update(node.position.x, node.position.z);
    }
    let node_elevation: HashMap<&str, NodeElevation> = raw
        .node_elevations
        .iter()
        .map(|(id, elevation)| (id.as_str(), *elevation))
        .collect();
    let bounds = bounds.into_bounds(sea_level);
    let elevation_of = |id: &str| node_elevation.get(id).copied().unwrap_or_default();
    let road_segments: Vec<RoadSegment> = raw
        .road_segments
        .into_iter()
        .map(|seg| RoadSegment {
            way_type: classify_way_type(
                &seg.item_class,
                elevation_of(&seg.start_node_id),
                elevation_of(&seg.end_node_id),
            ),
            id: seg.id,
            start_node_id: seg.start_node_id,
            end_node_id: seg.end_node_id,
            item_class: seg.item_class,
            width: seg.width,
            name: seg.name,
            points: seg.points,
        })
        .collect();
    let road_nodes = raw
        .road_nodes
        .into_iter()
        .map(|node| RoadNode {
            id: node.id,
            position: node.position,
        })
        .collect();

    let land_polygon = vectorizer::vectorize_land_polygon(&raw.elev_grid, &raw.res_grid, sea_level);
    let coastline = vectorizer::coastline_from_land_polygons(&land_polygon, sea_level);
    let inland_water_polygons =
        vectorizer::vectorize_inland_water(&raw.elev_grid, &raw.res_grid, sea_level);
    let contour_lines = vectorizer::vectorize_contour_lines(&raw.elev_grid, sea_level, 3200.0);
    // Same step as the isolines above, so every band edge is a drawn contour.
    let terrain_bands = vectorizer::vectorize_terrain_bands(&raw.elev_grid, sea_level, 3200.0);
    let terrain_dem = texture::generate_terrain_dem(&raw.elev_grid, &raw.res_grid)?;

    Ok(CityData {
        city_name: raw.city_name,
        // The native adapter overrides this after the shared construction.
        source: CitySource::Cslmap,
        file_name: String::new(),
        generated_at: raw.generated_at,
        bounds,
        land_polygon,
        coastline,
        inland_water_polygons,
        contour_lines,
        terrain_bands,
        terrain_dem,
        road_nodes,
        road_segments,
        transit_lines: raw
            .transit_lines
            .into_iter()
            .map(build_transit_line)
            .collect(),
        buildings: raw.buildings.into_iter().map(build_building).collect(),
        forest_cells: grid::forest_cells_from_grid(&raw.forest_grid),
        districts: raw.districts,
        park_areas: raw
            .park_areas
            .into_iter()
            .map(|park| ParkArea {
                park_type: park_type_from_xml(&park.park_type),
                id: park.id,
                name: park.name,
                position: park.position,
                boundary: None,
            })
            .collect(),
    })
}

fn build_transit_line(line: RawTransitLine) -> TransitLine {
    let mode = parse_transit_mode(&line.transport_type);
    let stops = line
        .stops
        .into_iter()
        .map(|stop| TransitStop {
            id: stop.node_id,
            mode: mode.clone(),
            position: stop.position,
            name: stop.name,
            name_derived: stop.name_derived,
        })
        .collect();
    let route = if line.route.is_empty() {
        Vec::new()
    } else {
        vec![PathSegment {
            segment_ids: line.route,
        }]
    };
    TransitLine {
        id: line.id,
        name: line.name,
        mode,
        color: line.color,
        stops,
        route,
    }
}

/// The anchor is the first footprint point — the origin when the footprint is empty.
fn build_building(building: RawBuilding) -> Building {
    let position = if let Some(first) = building.footprint.first() {
        first.clone()
    } else {
        eprintln!(
            "[parser-cslmap] Building id='{}' has empty footprint — position defaulting to origin",
            building.id
        );
        Vec3 {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        }
    };
    Building {
        id: building.id,
        name: building.name,
        position,
        item_class: building.item_class,
        service_type: building.service_type,
        footprint: building.footprint,
    }
}
