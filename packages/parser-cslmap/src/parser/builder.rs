use super::handlers::{roads, transit};
use super::terrain::{grid, texture, vectorizer};
use super::types::{ParsedSeg, TextElement};
use super::utils::{attr_f64, attr_str, rgba_to_hex};
use crate::city_data::{
    Building, CityData, District, ForestCell, MapBounds, PathSegment, RoadNode, RoadSegment,
    TransitLine, TransitStop, Vec3,
};
use crate::dlc_fallback;
use crate::errors::VellumError;
use crate::types::transit::normalize_debug_segs;
use std::collections::{HashMap, VecDeque};

// ─── Builder ─────────────────────────────────────────────────────────────────

#[derive(Default)]
#[allow(clippy::struct_excessive_bools)]
pub(crate) struct CityDataBuilder {
    // Output data
    city_name: String,
    generated_at: String,
    sea_level: f64,
    // Raw terrain grids (row-major, 1081×1081). Populated during Ter CSV parse;
    // vectorized into TerrainPolygon/TerrainBand in build().
    elev_grid: Vec<f64>,
    res_grid: Vec<f64>,
    road_nodes: Vec<RoadNode>,
    road_segments: Vec<RoadSegment>,
    transit_lines: Vec<TransitLine>,
    buildings: Vec<Building>,
    forest_cells: Vec<ForestCell>,
    districts: Vec<District>,
    pub(crate) warnings: Vec<String>,
    // Virtual transit connector segs (e.g. "Bus Line", "Tram Line"), keyed by (sn, en).
    // Each entry holds a queue of road-segment-ID lists — one per connector seg with that node pair.
    // Queued because two different transit lines can share the same stop pair.
    transit_route_by_nodes: HashMap<(String, String), VecDeque<Vec<String>>>,

    // Bounds tracking (derived from node positions)
    min_x: f64,
    max_x: f64,
    min_z: f64,
    max_z: f64,
    has_nodes: bool,

    // Node lookup index: built during Nodes parsing, used for transit stop positions
    node_position_index: HashMap<String, Vec3>,

    // Node parsing state: Node start → wait for Pos child
    in_node: bool,
    current_node_id: String,

    // Segment parsing state
    current_seg: Option<ParsedSeg>,
    in_seg_points: bool, // inside Seg>Points
    in_seg_path: bool,   // inside Seg>Path
    in_seg_segs: bool,   // inside Seg>Path>Segs

    // Transit parsing state
    in_trans: bool,
    current_trans_id: String,
    current_trans_name: String,
    current_trans_mode: String,
    current_trans_color: String,
    current_trans_stops: Vec<TransitStop>,
    current_trans_routes: Vec<PathSegment>,
    current_route_seg_ids: Vec<String>,

    // Building parsing state
    in_buil: bool,
    current_buil_id: String,
    current_buil_name: String,
    current_buil_icls: String,
    in_buil_points: bool,
    current_buil_footprint: Vec<Vec3>,

    // District parsing state
    forest_row: usize,

    in_dist: bool,
    current_dist_id: String,
    current_dist_name: String,
    current_dist_position: Option<Vec3>,

    // Pending text content for simple text elements
    pending_text: String,
    // Tag whose text content we're currently accumulating
    text_element: TextElement,
}

impl CityDataBuilder {
    fn in_seg(&self) -> bool {
        self.current_seg.is_some()
    }

    fn in_transit(&self) -> bool {
        self.in_trans
    }

    #[allow(
        clippy::too_many_lines,
        clippy::unnecessary_wraps,
        clippy::match_same_arms
    )]
    pub(crate) fn handle_start(
        &mut self,
        e: &quick_xml::events::BytesStart<'_>,
    ) -> Result<(), VellumError> {
        let local = e.name().local_name();
        self.pending_text.clear();
        self.text_element = TextElement::None;

        match local.as_ref() {
            // Root element — ignore, no attributes to parse
            b"CSLExportXML" => {}

            // Simple text elements — set flag, accumulate in handle_text
            b"City" => {
                self.text_element = TextElement::City;
            }
            b"Generated" => {
                self.text_element = TextElement::Generated;
            }
            b"SeaLevel" => {
                self.text_element = TextElement::SeaLevel;
            }

            // Node: start tag has id; Pos child provides coordinates
            b"Node" => {
                self.in_node = true;
                self.current_node_id = attr_str(e, b"id").unwrap_or_default();
            }

            // Road segment
            b"Seg" => {
                if self.current_seg.is_some() {
                    eprintln!("[parser-cslmap] Nested <Seg> start encountered — discarding previous state");
                    self.current_seg = None;
                    self.in_seg_points = false;
                    self.in_seg_path = false;
                    self.in_seg_segs = false;
                }
                let id = attr_str(e, b"id").unwrap_or_default();
                let sn = attr_str(e, b"sn").unwrap_or_default();
                let en = attr_str(e, b"en").unwrap_or_default();
                if sn.is_empty() || en.is_empty() {
                    eprintln!("[parser-cslmap] <Seg id='{id}'> missing required attrs sn/en");
                }
                self.current_seg = Some(ParsedSeg {
                    id,
                    start_node_id: sn,
                    end_node_id: en,
                    item_class: attr_str(e, b"icls").unwrap_or_default(),
                    width: attr_f64(e, b"width").unwrap_or(0.0),
                    path_segs: Vec::new(),
                    points: Vec::new(),
                });
            }
            b"Points" if self.in_seg() => {
                self.in_seg_points = true;
            }
            b"Path" if self.in_seg() => {
                self.in_seg_path = true;
            }
            b"Segs" if self.in_seg_path => {
                self.in_seg_segs = true;
            }
            b"Sg" if self.in_seg_segs => {
                self.text_element = TextElement::Sg;
            }

            // Terrain text block
            b"Ter" => {
                self.text_element = TextElement::Ter;
            }

            // Forest text block
            b"Forest" => {
                self.text_element = TextElement::Forest;
            }

            // Transit line
            b"Trans" => {
                if self.in_trans {
                    eprintln!("[parser-cslmap] Nested <Trans> start encountered — discarding previous state");
                }
                self.in_trans = true;
                self.current_trans_id = attr_str(e, b"id").unwrap_or_default();
                self.current_trans_name = attr_str(e, b"name").unwrap_or_default();
                self.current_trans_mode = attr_str(e, b"type").unwrap_or_default();
                self.current_trans_color = String::new();
                self.current_trans_stops.clear();
                self.current_trans_routes.clear();
                self.current_route_seg_ids.clear();
            }

            // Building
            b"Buil" => {
                self.in_buil = true;
                self.current_buil_id = attr_str(e, b"id").unwrap_or_default();
                self.current_buil_name = attr_str(e, b"name").unwrap_or_default();
                self.current_buil_icls = attr_str(e, b"icls").unwrap_or_default();
                self.current_buil_footprint.clear();
            }
            b"Points" if self.in_buil => {
                self.in_buil_points = true;
            }

            // District
            b"Dist" => {
                self.in_dist = true;
                self.current_dist_id = attr_str(e, b"id").unwrap_or_default();
                self.current_dist_name = attr_str(e, b"name").unwrap_or_default();
                self.current_dist_position = None;
            }

            _ => {}
        }

        Ok(())
    }

    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn handle_empty(
        &mut self,
        e: &quick_xml::events::BytesStart<'_>,
    ) -> Result<(), VellumError> {
        let local = e.name().local_name();

        match local.as_ref() {
            // Node position (child of Node start element)
            b"Pos" if self.in_node => {
                let x = attr_f64(e, b"x").unwrap_or(0.0);
                let y = attr_f64(e, b"y").unwrap_or(0.0);
                let z = attr_f64(e, b"z").unwrap_or(0.0);
                let position = Vec3 { x, y, z };
                self.node_position_index
                    .insert(self.current_node_id.clone(), position.clone());
                self.road_nodes.push(RoadNode {
                    id: self.current_node_id.clone(),
                    position,
                });
                // Track bounds
                if self.has_nodes {
                    if x < self.min_x {
                        self.min_x = x;
                    }
                    if x > self.max_x {
                        self.max_x = x;
                    }
                    if z < self.min_z {
                        self.min_z = z;
                    }
                    if z > self.max_z {
                        self.max_z = z;
                    }
                } else {
                    self.min_x = x;
                    self.max_x = x;
                    self.min_z = z;
                    self.max_z = z;
                    self.has_nodes = true;
                }
            }

            // Road segment points (bezier control points)
            b"p" if self.in_seg_points => {
                if let Some(ref mut seg) = self.current_seg {
                    seg.points.push(Vec3 {
                        x: attr_f64(e, b"x").unwrap_or(0.0),
                        y: attr_f64(e, b"y").unwrap_or(0.0),
                        z: attr_f64(e, b"z").unwrap_or(0.0),
                    });
                }
            }

            // Transit line color element: <color a="255" r="44" g="85" b="191" />
            b"color" if self.in_transit() => {
                let a = attr_str(e, b"a")
                    .and_then(|s| s.parse::<u8>().ok())
                    .unwrap_or(255);
                let r = attr_str(e, b"r")
                    .and_then(|s| s.parse::<u8>().ok())
                    .unwrap_or(0);
                let g = attr_str(e, b"g")
                    .and_then(|s| s.parse::<u8>().ok())
                    .unwrap_or(0);
                let b_val = attr_str(e, b"b")
                    .and_then(|s| s.parse::<u8>().ok())
                    .unwrap_or(0);
                self.current_trans_color = rgba_to_hex(r, g, b_val, a);
            }

            // Transit stop: <Stop node="3560" />
            b"Stop" if self.in_transit() => {
                let node_id = attr_str(e, b"node").unwrap_or_default();
                let mode = transit::parse_transit_mode(&self.current_trans_mode.clone());
                let position = self
                    .node_position_index
                    .get(&node_id)
                    .cloned()
                    .unwrap_or(Vec3 {
                        x: 0.0,
                        y: 0.0,
                        z: 0.0,
                    });
                self.current_trans_stops.push(TransitStop {
                    id: node_id,
                    mode,
                    position,
                    name: String::new(),
                });
            }

            // Building footprint points: <p x y z /> inside Buil>Points
            b"p" if self.in_buil_points => {
                self.current_buil_footprint.push(Vec3 {
                    x: attr_f64(e, b"x").unwrap_or(0.0),
                    y: attr_f64(e, b"y").unwrap_or(0.0),
                    z: attr_f64(e, b"z").unwrap_or(0.0),
                });
            }

            // District position: single <p x y z /> inside Dist (cslmap only exports one point)
            b"p" if self.in_dist && self.current_dist_position.is_none() => {
                self.current_dist_position = Some(Vec3 {
                    x: attr_f64(e, b"x").unwrap_or(0.0),
                    y: attr_f64(e, b"y").unwrap_or(0.0),
                    z: attr_f64(e, b"z").unwrap_or(0.0),
                });
            }

            _ => {}
        }

        Ok(())
    }

    pub(crate) fn handle_text(&mut self, text: &str) {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return;
        }
        match self.text_element {
            TextElement::City => {
                self.city_name.push_str(trimmed);
            }
            TextElement::Generated => {
                self.generated_at.push_str(trimmed);
            }
            TextElement::SeaLevel => {
                // Accumulate in case text arrives split across events; parsed at End
                self.pending_text.push_str(trimmed);
            }
            TextElement::Sg => {
                // Segment ID inside Seg>Path>Segs
                if let Some(ref mut seg) = self.current_seg {
                    seg.path_segs.push(trimmed.to_string());
                }
            }
            TextElement::Ter => {
                // Terrain CSV — may arrive in chunks; accumulate then parse on End
                // (parse on end so we have the complete sea_level)
                // Buffer is flushed in handle_end for Ter
                self.pending_text.push_str(trimmed);
            }
            TextElement::Forest => {
                self.pending_text.push_str(trimmed);
            }
            TextElement::None => {}
        }
    }

    #[allow(clippy::too_many_lines)]
    pub(crate) fn handle_end(&mut self, e: &quick_xml::events::BytesEnd<'_>) {
        let local = e.name().local_name();
        self.text_element = TextElement::None;

        match local.as_ref() {
            b"Node" => {
                self.in_node = false;
                self.current_node_id.clear();
            }

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

            b"Points" if self.in_seg_points => {
                self.in_seg_points = false;
            }
            b"Points" if self.in_buil_points => {
                self.in_buil_points = false;
            }

            b"Segs" if self.in_seg_segs => {
                self.in_seg_segs = false;
            }
            b"Path" if self.in_seg_path => {
                self.in_seg_path = false;
            }

            b"Seg" => {
                // Always reset sub-element state even if Seg was malformed
                self.in_seg_points = false;
                self.in_seg_path = false;
                self.in_seg_segs = false;

                if let Some(seg) = self.current_seg.take() {
                    // AC3 + Gotcha 6: transit virtual connector segs (e.g. "Bus Line",
                    // "Tram Line") carry route geometry — extract and skip road_segments.
                    if seg.item_class.ends_with(" Line") {
                        let mut segs = seg.path_segs;
                        normalize_debug_segs(&mut segs); // AC5 + Gotcha 4
                        self.transit_route_by_nodes
                            .entry((seg.start_node_id, seg.end_node_id))
                            .or_default()
                            .push_back(segs);
                        return;
                    }

                    // AC4 + Gotcha 7: fallback for unknown DLC ItemClass
                    if !dlc_fallback::is_known_item_class(&seg.item_class) {
                        let hierarchy = dlc_fallback::classify_by_width(seg.width);
                        self.warnings.push(format!(
                            "Unknown ItemClass '{}' (width {:.1}) classified as {:?}",
                            seg.item_class, seg.width, hierarchy
                        ));
                    }

                    self.road_segments.push(RoadSegment {
                        id: seg.id,
                        start_node_id: seg.start_node_id,
                        end_node_id: seg.end_node_id,
                        way_type: roads::way_type_from_item_class(&seg.item_class),
                        item_class: seg.item_class,
                        width: seg.width,
                        points: seg.points,
                    });
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
                    grid::parse_forest_csv(&csv, self.forest_row, &mut self.forest_cells);
                    self.forest_row += 1;
                }
            }

            b"Trans" => {
                let id = std::mem::take(&mut self.current_trans_id);
                let name = std::mem::take(&mut self.current_trans_name);
                let mode_str = std::mem::take(&mut self.current_trans_mode);
                let raw_color = std::mem::take(&mut self.current_trans_color);
                // Default to opaque white when <color> element is absent
                let color = if raw_color.is_empty() {
                    "#FFFFFFFF".to_string()
                } else {
                    raw_color
                };
                let mode = transit::parse_transit_mode(&mode_str);

                // Reconstruct the full route by looking up each consecutive stop pair.
                // Each Bus Line virtual seg connects two adjacent stops and carries the
                // road segment IDs for that leg. Circular routes close from last→first stop.
                let stop_ids: Vec<String> = self
                    .current_trans_stops
                    .iter()
                    .map(|s| s.id.clone())
                    .collect();
                let n = stop_ids.len();
                let mut all_seg_ids: Vec<String> = Vec::new();
                for i in 0..n {
                    let key = (stop_ids[i].clone(), stop_ids[(i + 1) % n].clone());
                    if let Some(queue) = self.transit_route_by_nodes.get_mut(&key) {
                        if let Some(leg_segs) = queue.pop_front() {
                            all_seg_ids.extend(leg_segs);
                        }
                        if queue.is_empty() {
                            self.transit_route_by_nodes.remove(&key);
                        }
                    }
                }
                let route = if all_seg_ids.is_empty() {
                    Vec::new()
                } else {
                    vec![PathSegment {
                        segment_ids: all_seg_ids,
                    }]
                };

                self.transit_lines.push(TransitLine {
                    id,
                    name,
                    mode,
                    color,
                    stops: std::mem::take(&mut self.current_trans_stops),
                    route,
                });
                self.in_trans = false;
            }

            b"Buil" if self.in_buil => {
                let footprint = std::mem::take(&mut self.current_buil_footprint);
                let position = if let Some(first) = footprint.first() {
                    first.clone()
                } else {
                    eprintln!(
                        "[parser-cslmap] Building id='{}' has empty footprint — position defaulting to origin",
                        self.current_buil_id
                    );
                    Vec3 {
                        x: 0.0,
                        y: 0.0,
                        z: 0.0,
                    }
                };
                self.buildings.push(Building {
                    id: std::mem::take(&mut self.current_buil_id),
                    name: std::mem::take(&mut self.current_buil_name),
                    position,
                    item_class: std::mem::take(&mut self.current_buil_icls),
                    footprint,
                });
                self.in_buil = false;
            }

            b"Dist" if self.in_dist => {
                let position = self.current_dist_position.take().unwrap_or(Vec3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                });
                self.districts.push(District {
                    id: std::mem::take(&mut self.current_dist_id),
                    name: std::mem::take(&mut self.current_dist_name),
                    position,
                });
                self.in_dist = false;
            }

            _ => {}
        }
    }

    #[allow(clippy::unnecessary_wraps)]
    pub(crate) fn build(mut self) -> Result<CityData, VellumError> {
        // Bounds derived from node positions; fall back to CS1 map limits if no nodes
        let bounds = if self.has_nodes {
            MapBounds {
                min_x: self.min_x,
                max_x: self.max_x,
                min_z: self.min_z,
                max_z: self.max_z,
                sea_level: self.sea_level,
            }
        } else {
            MapBounds {
                min_x: -8640.0,
                max_x: 8640.0,
                min_z: -8640.0,
                max_z: 8640.0,
                sea_level: self.sea_level,
            }
        };

        // Unknown DLC assets: log to stderr; Story 2.5 will surface these as UI warnings.
        for w in &self.warnings {
            eprintln!("[parser-cslmap] DLC warning: {w}");
        }

        let sea_level = self.sea_level;

        // Pad incomplete grids to the expected 1081×1081 size so contour-isobands
        // receives exactly the right number of values. Padded cells have elev=0
        // (below any real sea level) and are treated as ocean.
        let expected_len = TERRAIN_GRID_SIZE * TERRAIN_GRID_SIZE;
        if self.elev_grid.len() < expected_len {
            if !self.elev_grid.is_empty() {
                eprintln!(
                    "[parser-cslmap] Terrain grid has {} entries, expected {}; padding with zeros",
                    self.elev_grid.len(),
                    expected_len
                );
            }
            self.elev_grid.resize(expected_len, 0.0);
            self.res_grid.resize(expected_len, 0.0);
        }

        let land_polygon =
            vectorizer::vectorize_land_polygon(&self.elev_grid, &self.res_grid, sea_level);
        let inland_water_polygons =
            vectorizer::vectorize_inland_water(&self.elev_grid, &self.res_grid, sea_level);
        // terrain_bands: O(N × num_bands) — deferred; returned empty until a dedicated
        // optimization pass (chunked Marching Squares or pre-bucketed elevation grid).
        let contour_lines = vectorizer::vectorize_contour_lines(&self.elev_grid, sea_level, 3000.0);
        let terrain_texture =
            texture::generate_terrain_texture(&self.elev_grid, &self.res_grid, sea_level)?;

        Ok(CityData {
            city_name: self.city_name,
            file_name: String::new(),
            generated_at: self.generated_at,
            bounds,
            land_polygon,
            inland_water_polygons,
            contour_lines,
            terrain_texture,
            road_nodes: self.road_nodes,
            road_segments: self.road_segments,
            transit_lines: self.transit_lines,
            buildings: self.buildings,
            forest_cells: self.forest_cells,
            districts: self.districts,
        })
    }
}

const TERRAIN_GRID_SIZE: usize = 1081;
