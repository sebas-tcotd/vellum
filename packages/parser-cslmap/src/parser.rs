use std::collections::{HashMap, VecDeque};

use quick_xml::events::Event;
use quick_xml::Reader;
use tauri::Emitter;

use crate::city_data::{
    Building, CityData, District, ForestCell, LandTile, MapBounds, PathSegment, RoadNode,
    RoadSegment, TransitLine, TransitStop, Vec3, WaterTile, WayType,
};
use crate::dlc_fallback;
use crate::errors::VellumError;
use crate::types::transit::normalize_debug_segs;

// ─── Progress payload (mirrors ipc_contract.rs in src-tauri) ──────────────────

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    current_step: String,
    percent: f32,
}

// ─── Parse warnings payload (mirrors ipc_contract.rs in src-tauri) ────────────

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ParseWarningsPayload {
    warnings: Vec<String>,
}

// ─── Public API ───────────────────────────────────────────────────────────────

/// Reads a `.cslmap` file from disk, strips the UTF-8 BOM, emits Tauri progress
/// and parse-warnings events, and runs the XML parser.
///
/// When `allow_partial` is false (normal mode), recoverable section errors produce
/// `VellumError::PartialParse`. When true (lenient mode), those errors are swallowed
/// and the parser returns whatever data was successfully built.
///
/// # Errors
/// Returns `VellumError::IoError` if the file cannot be read.
/// Returns `VellumError::InvalidFile` for XML that is entirely unreadable.
/// Returns `VellumError::PartialParse` for XML valid at root level but with damaged sections.
pub fn parse_cslmap_file(
    path: &str,
    app_handle: &tauri::AppHandle,
    allow_partial: bool,
) -> Result<CityData, VellumError> {
    emit_progress(app_handle, "reading", 0.0);

    let bytes = std::fs::read(path).map_err(|e| VellumError::IoError {
        reason: e.to_string(),
    })?;

    // Strip UTF-8 BOM (EF BB BF) — present in real .cslmap files (Gotcha 3)
    let content = if bytes.starts_with(b"\xEF\xBB\xBF") {
        &bytes[3..]
    } else {
        &bytes[..]
    };

    let total_len = content.len();
    let result = parse_inner_with_progress(content, total_len, app_handle, allow_partial)?;

    emit_progress(app_handle, "done", 100.0);
    Ok(result)
}

/// Pure parsing function (no AppHandle, no allow_partial): used directly by unit tests.
///
/// # Errors
/// Returns `VellumError::InvalidFile` for completely unreadable XML.
/// Returns `VellumError::PartialParse` for XML valid at root but with damaged sections.
pub fn parse_cslmap_bytes(content: &[u8]) -> Result<CityData, VellumError> {
    let content = if content.starts_with(b"\xEF\xBB\xBF") {
        &content[3..]
    } else {
        content
    };
    parse_inner(content, false)
}

/// Lenient variant of `parse_cslmap_bytes` for testing partial-parse mode.
/// Swallows recoverable section errors and returns whatever data was built.
pub fn parse_cslmap_bytes_lenient(content: &[u8]) -> Result<CityData, VellumError> {
    let content = if content.starts_with(b"\xEF\xBB\xBF") {
        &content[3..]
    } else {
        content
    };
    parse_inner(content, true)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

fn emit_progress(app_handle: &tauri::AppHandle, step: &str, percent: f32) {
    if let Err(e) = app_handle.emit(
        "vellum://progress",
        ProgressPayload {
            current_step: step.to_string(),
            percent,
        },
    ) {
        eprintln!("[parser-cslmap] Failed to emit progress event: {e}");
    }
}

fn parse_inner_with_progress(
    content: &[u8],
    total_len: usize,
    app_handle: &tauri::AppHandle,
    allow_partial: bool,
) -> Result<CityData, VellumError> {
    let mut reader = Reader::from_reader(content);
    reader.config_mut().trim_text(true);

    let mut builder = CityDataBuilder::default();
    let mut buf = Vec::new();
    let mut last_pct: i32 = -1;
    let mut has_parsed_root = false;
    let mut partial_errors: Vec<String> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                has_parsed_root = true;
                if let Err(err) = builder.handle_start(e) {
                    if allow_partial {
                        partial_errors.push(err.to_string());
                    } else {
                        return Err(VellumError::PartialParse {
                            warnings: vec![err.to_string()],
                        });
                    }
                }
            }
            Ok(Event::Empty(ref e)) => {
                has_parsed_root = true;
                if let Err(err) = builder.handle_empty(e) {
                    if allow_partial {
                        partial_errors.push(err.to_string());
                    } else {
                        return Err(VellumError::PartialParse {
                            warnings: vec![err.to_string()],
                        });
                    }
                }
            }
            Ok(Event::Text(ref e)) => {
                match e.unescape() {
                    Ok(text) => builder.handle_text(&text),
                    Err(err) => {
                        let msg = format!(
                            "XML text error at position {}: {err}",
                            reader.buffer_position()
                        );
                        if allow_partial {
                            partial_errors.push(msg);
                        } else if has_parsed_root {
                            return Err(VellumError::PartialParse {
                                warnings: vec![msg],
                            });
                        } else {
                            return Err(VellumError::InvalidFile { reason: msg });
                        }
                    }
                }
            }
            Ok(Event::End(ref e)) => builder.handle_end(e),
            Ok(Event::Eof) => break,
            Err(e) => {
                let msg = format!(
                    "XML parse error at position {}: {e}",
                    reader.buffer_position()
                );
                if allow_partial {
                    // Stop parsing but continue to build with what we have
                    partial_errors.push(msg);
                    break;
                } else if has_parsed_root {
                    return Err(VellumError::PartialParse { warnings: vec![msg] });
                } else {
                    return Err(VellumError::InvalidFile { reason: msg });
                }
            }
            _ => {}
        }
        buf.clear();

        // Real progress based on byte position in the stream
        if total_len > 0 {
            let pct = (reader.buffer_position() as f64 / total_len as f64 * 100.0) as i32;
            if pct > last_pct {
                last_pct = pct;
                emit_progress(app_handle, "parsing", pct as f32);
            }
        }
    }

    // Emit DLC warnings event (before consuming builder)
    let warnings_to_emit = builder.warnings.clone();
    if !warnings_to_emit.is_empty() {
        if let Err(e) = app_handle.emit(
            "vellum://parse-warnings",
            ParseWarningsPayload {
                warnings: warnings_to_emit,
            },
        ) {
            eprintln!("[parser-cslmap] Failed to emit parse-warnings: {e}");
        }
    }

    let _ = partial_errors; // already captured in PartialParse path or logged via eprintln
    builder.build()
}

// ─── Attribute helpers ────────────────────────────────────────────────────────

fn attr_str(e: &quick_xml::events::BytesStart, name: &[u8]) -> Option<String> {
    e.attributes().find_map(|a| {
        let a = match a {
            Ok(attr) => attr,
            Err(e) => {
                eprintln!("[parser-cslmap] Malformed attribute in XML: {e}");
                return None;
            }
        };
        if a.key.local_name().as_ref() == name {
            a.unescape_value().ok().map(|v| v.into_owned())
        } else {
            None
        }
    })
}

fn attr_f64(e: &quick_xml::events::BytesStart, name: &[u8]) -> Option<f64> {
    attr_str(e, name)
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|v| v.is_finite())
}

// ─── Transit mode classifier ──────────────────────────────────────────────────

fn parse_transit_mode(s: &str) -> crate::city_data::TransitMode {
    use crate::city_data::TransitMode;
    match s {
        "Bus" => TransitMode::Bus,
        "Tram" => TransitMode::Tram,
        "Train" => TransitMode::Train,
        "Metro" => TransitMode::Metro,
        "CableCar" => TransitMode::CableCar,
        "Monorail" => TransitMode::Monorail,
        "Ferry" => TransitMode::Ferry,
        "Blimp" => TransitMode::Blimp,
        "Trolleybus" => TransitMode::Trolleybus,
        _ => TransitMode::Unknown,
    }
}

// Converts RGBA components to an 8-digit hex color string (e.g. "#FF6600FF").
fn rgba_to_hex(r: u8, g: u8, b: u8, a: u8) -> String {
    format!("#{r:02X}{g:02X}{b:02X}{a:02X}")
}

// ─── WayType derivation ───────────────────────────────────────────────────────

/// Derives WayType flags from an item_class string.
/// Strips `[Deprecated]` prefix (AC2 / Gotcha 5) before matching.
/// Returns a non-empty Vec — unknown items get `[None]`.
fn way_type_from_item_class(item_class: &str) -> Vec<WayType> {
    let s = item_class.trim_start_matches("[Deprecated]");

    if s.contains("Pedestrian") {
        return vec![WayType::Pedestrian];
    }
    if s.contains("Bicycle") {
        return vec![WayType::Bicycle];
    }

    let mut types = Vec::new();

    if s.contains("Highway") {
        types.push(WayType::Highway);
    } else if s.contains("Road") || s.contains("Alley") || s.contains("Gravel") {
        types.push(WayType::Road);
    }

    if s.contains("Elevated") {
        types.push(WayType::Elevated);
    }
    if s.contains("Underground") {
        types.push(WayType::Underground);
    }
    if s.contains("Bridge") {
        types.push(WayType::Bridge);
    }
    if s.contains("Tunnel") {
        types.push(WayType::Tunnel);
    }

    if types.is_empty() {
        types.push(WayType::None);
    }

    types
}

// ─── Terrain CSV parsing ──────────────────────────────────────────────────────

/// Parses the CSLExportXML terrain CSV format: `"elev:res,elev:res,..."`
/// Grid is 1081×1081, covering ±8640 world units (16 units per cell).
/// Tiles with raw elevation ≤ sea_level_raw are water; the rest are land.
fn parse_terrain_csv(
    csv: &str,
    sea_level_raw: f64,
    land_tiles: &mut Vec<LandTile>,
    water_tiles: &mut Vec<WaterTile>,
) {
    const GRID_SIZE: usize = 1081;
    const CELL_SIZE: f64 = 16.0;
    const MAP_ORIGIN: f64 = -8640.0;

    for (idx, entry) in csv.split(',').enumerate() {
        let entry = entry.trim();
        if entry.is_empty() {
            continue;
        }
        let row = idx / GRID_SIZE;
        if row >= GRID_SIZE {
            eprintln!("[parser-cslmap] Terrain grid overflow at index {idx}; extra data ignored");
            break;
        }
        let col = idx % GRID_SIZE;
        let x = MAP_ORIGIN + col as f64 * CELL_SIZE;
        let z = MAP_ORIGIN + row as f64 * CELL_SIZE;

        // Parse "elev:res" pair
        let mut parts = entry.splitn(2, ':');
        let raw_elev: f64 = parts
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0);
        let raw_res: f64 = parts
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0);

        if raw_elev <= sea_level_raw {
            // Water tile: depth approximated as (sea_level - elevation) normalized
            let depth = (sea_level_raw - raw_elev).max(0.0);
            water_tiles.push(WaterTile { depth, x, z });
        } else {
            // Land tile: store raw elevation and resolution
            land_tiles.push(LandTile {
                elevation: raw_elev,
                resolution: raw_res as u32,
                x,
                z,
            });
        }
    }
}

/// Parses the CSLExportXML forest CSV format: comma-separated integer density values.
/// Grid matches terrain at 1/8 resolution: 135×135 cells approx.
fn parse_forest_csv(csv: &str, forest_cells: &mut Vec<ForestCell>) {
    const TERRAIN_GRID: usize = 1081;
    const FOREST_DIVISOR: usize = 8;
    let forest_grid = (TERRAIN_GRID + FOREST_DIVISOR - 1) / FOREST_DIVISOR; // ≈136
    const CELL_SIZE: f64 = 16.0 * 8.0; // 128 world units per forest cell
    const MAP_ORIGIN: f64 = -8640.0;

    for (idx, val) in csv.split(',').enumerate() {
        let density_raw: u32 = val.trim().parse().unwrap_or(0);
        if density_raw == 0 {
            continue;
        }
        let col = idx % forest_grid;
        let row = idx / forest_grid;
        let x = MAP_ORIGIN + col as f64 * CELL_SIZE;
        let z = MAP_ORIGIN + row as f64 * CELL_SIZE;
        let density = f64::from(density_raw) / 255.0;
        forest_cells.push(ForestCell { x, z, density });
    }
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/// Intermediate road segment with raw parsed fields before classification.
#[derive(Default)]
struct ParsedSeg {
    id: String,
    start_node_id: String,
    end_node_id: String,
    item_class: String,
    width: f64,
    path_segs: Vec<String>,
    points: Vec<Vec3>,
}

#[derive(Default)]
struct CityDataBuilder {
    // Output data
    city_name: String,
    generated_at: String,
    sea_level: f64,
    land_tiles: Vec<LandTile>,
    water_tiles: Vec<WaterTile>,
    road_nodes: Vec<RoadNode>,
    road_segments: Vec<RoadSegment>,
    transit_lines: Vec<TransitLine>,
    buildings: Vec<Building>,
    forest_cells: Vec<ForestCell>,
    districts: Vec<District>,
    warnings: Vec<String>,
    // bus routes from Bus Line segs, assigned to transit lines in order
    bus_routes: VecDeque<Vec<String>>,

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
    in_seg_points: bool,        // inside Seg>Points
    in_seg_path: bool,          // inside Seg>Path
    in_seg_segs: bool,          // inside Seg>Path>Segs

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
    in_dist: bool,
    current_dist_id: String,
    current_dist_name: String,
    current_dist_boundary: Vec<Vec3>,

    // Pending text content for simple text elements
    pending_text: String,
    // Tag whose text content we're currently accumulating
    text_element: TextElement,
}

#[derive(Default, PartialEq)]
enum TextElement {
    #[default]
    None,
    City,
    SeaLevel,
    Generated,
    Sg,     // segment ID inside Seg>Path>Segs
    Ter,    // terrain CSV
    Forest, // forest density CSV
}

impl CityDataBuilder {
    fn in_seg(&self) -> bool {
        self.current_seg.is_some()
    }

    fn in_transit(&self) -> bool {
        self.in_trans
    }

    #[allow(clippy::too_many_lines)]
    fn handle_start(
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
                self.current_dist_boundary.clear();
            }

            _ => {}
        }

        Ok(())
    }

    fn handle_empty(
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
                if !self.has_nodes {
                    self.min_x = x;
                    self.max_x = x;
                    self.min_z = z;
                    self.max_z = z;
                    self.has_nodes = true;
                } else {
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
                }
            }

            // Road segment points (bezier control points)
            b"P" if self.in_seg_points => {
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
                let mode = parse_transit_mode(&self.current_trans_mode.clone());
                let position = self
                    .node_position_index
                    .get(&node_id)
                    .cloned()
                    .unwrap_or(Vec3 { x: 0.0, y: 0.0, z: 0.0 });
                self.current_trans_stops.push(TransitStop {
                    id: node_id,
                    mode,
                    position,
                    name: String::new(),
                });
            }

            // Building footprint points: <P x y z /> inside Buil>Points
            b"P" if self.in_buil_points => {
                self.current_buil_footprint.push(Vec3 {
                    x: attr_f64(e, b"x").unwrap_or(0.0),
                    y: attr_f64(e, b"y").unwrap_or(0.0),
                    z: attr_f64(e, b"z").unwrap_or(0.0),
                });
            }

            // District boundary points: <P x y z /> directly inside Dist
            b"P" if self.in_dist => {
                self.current_dist_boundary.push(Vec3 {
                    x: attr_f64(e, b"x").unwrap_or(0.0),
                    y: attr_f64(e, b"y").unwrap_or(0.0),
                    z: attr_f64(e, b"z").unwrap_or(0.0),
                });
            }

            _ => {}
        }

        Ok(())
    }

    fn handle_text(&mut self, text: &str) {
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
    fn handle_end(&mut self, e: &quick_xml::events::BytesEnd<'_>) {
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
                    // AC3 + Gotcha 6: Bus Line segments are virtual — extract route, skip road_segments
                    if seg.item_class == "Bus Line" {
                        let mut segs = seg.path_segs;
                        normalize_debug_segs(&mut segs); // AC5 + Gotcha 4
                        self.bus_routes.push_back(segs);
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
                        way_type: way_type_from_item_class(&seg.item_class),
                        item_class: seg.item_class,
                        width: seg.width,
                        points: seg.points,
                    });
                }
            }

            b"Ter" => {
                let csv = std::mem::take(&mut self.pending_text);
                if !csv.is_empty() {
                    parse_terrain_csv(
                        &csv,
                        self.sea_level,
                        &mut self.land_tiles,
                        &mut self.water_tiles,
                    );
                }
            }

            b"Forest" => {
                let csv = std::mem::take(&mut self.pending_text);
                if !csv.is_empty() {
                    parse_forest_csv(&csv, &mut self.forest_cells);
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
                let mode = parse_transit_mode(&mode_str);

                // Pull route from collected bus_routes (assigned by order of appearance)
                let route = if let Some(segs) = self.bus_routes.pop_front() {
                    vec![PathSegment { segment_ids: segs }]
                } else {
                    Vec::new()
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

            b"Buil" => {
                if self.in_buil {
                    let footprint = std::mem::take(&mut self.current_buil_footprint);
                    let position = if let Some(first) = footprint.first() {
                        first.clone()
                    } else {
                        eprintln!(
                            "[parser-cslmap] Building id='{}' has empty footprint — position defaulting to origin",
                            self.current_buil_id
                        );
                        Vec3 { x: 0.0, y: 0.0, z: 0.0 }
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
            }

            b"Dist" => {
                if self.in_dist {
                    self.districts.push(District {
                        id: std::mem::take(&mut self.current_dist_id),
                        name: std::mem::take(&mut self.current_dist_name),
                        boundary: std::mem::take(&mut self.current_dist_boundary),
                    });
                    self.in_dist = false;
                }
            }

            _ => {}
        }
    }

    fn build(self) -> Result<CityData, VellumError> {
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

        Ok(CityData {
            city_name: self.city_name,
            file_name: String::new(),
            generated_at: self.generated_at,
            bounds,
            land_tiles: self.land_tiles,
            water_tiles: self.water_tiles,
            road_nodes: self.road_nodes,
            road_segments: self.road_segments,
            transit_lines: self.transit_lines,
            buildings: self.buildings,
            forest_cells: self.forest_cells,
            districts: self.districts,
        })
    }
}

// ─── Core parse loop (no progress events) ────────────────────────────────────

fn parse_inner(content: &[u8], allow_partial: bool) -> Result<CityData, VellumError> {
    let mut reader = Reader::from_reader(content);
    reader.config_mut().trim_text(true);

    let mut builder = CityDataBuilder::default();
    let mut buf = Vec::new();
    let mut has_parsed_root = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                has_parsed_root = true;
                if let Err(err) = builder.handle_start(e) {
                    if allow_partial {
                        eprintln!("[parser-cslmap] Partial: section start error: {err}");
                    } else {
                        return Err(VellumError::PartialParse {
                            warnings: vec![err.to_string()],
                        });
                    }
                }
            }
            Ok(Event::Empty(ref e)) => {
                has_parsed_root = true;
                if let Err(err) = builder.handle_empty(e) {
                    if allow_partial {
                        eprintln!("[parser-cslmap] Partial: section empty error: {err}");
                    } else {
                        return Err(VellumError::PartialParse {
                            warnings: vec![err.to_string()],
                        });
                    }
                }
            }
            Ok(Event::Text(ref e)) => {
                match e.unescape() {
                    Ok(text) => builder.handle_text(&text),
                    Err(err) => {
                        let msg = format!(
                            "XML text error at position {}: {err}",
                            reader.buffer_position()
                        );
                        if allow_partial {
                            eprintln!("[parser-cslmap] Partial: {msg}");
                        } else if has_parsed_root {
                            return Err(VellumError::PartialParse { warnings: vec![msg] });
                        } else {
                            return Err(VellumError::InvalidFile { reason: msg });
                        }
                    }
                }
            }
            Ok(Event::End(ref e)) => builder.handle_end(e),
            Ok(Event::Eof) => break,
            Err(e) => {
                let msg = format!(
                    "XML parse error at position {}: {e}",
                    reader.buffer_position()
                );
                if allow_partial {
                    eprintln!("[parser-cslmap] Partial: stopping early — {msg}");
                    break;
                } else if has_parsed_root {
                    return Err(VellumError::PartialParse { warnings: vec![msg] });
                } else {
                    return Err(VellumError::InvalidFile { reason: msg });
                }
            }
            _ => {}
        }
        buf.clear();
    }

    builder.build()
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // AC1: minimal-valid.cslmap → valid CityData, no errors, land_tiles > 0
    #[test]
    fn parses_minimal_valid_cslmap() {
        let bytes = include_bytes!("../fixtures/minimal-valid.cslmap");
        let result = parse_cslmap_bytes(bytes);
        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        let city = result.expect("already checked");
        assert!(!city.land_tiles.is_empty(), "expected land tiles");
        assert_eq!(city.city_name, "Test City");
    }

    // AC3 + Gotcha 6: Bus Line excluded from road_segments; transit_lines populated
    #[test]
    fn bus_line_excluded_from_road_segments() {
        let bytes = include_bytes!("../fixtures/with-transit.cslmap");
        let result = parse_cslmap_bytes(bytes);
        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        let city = result.expect("already checked");
        let has_bus_line = city
            .road_segments
            .iter()
            .any(|s| s.item_class == "Bus Line");
        assert!(!has_bus_line, "Bus Line must not appear in road_segments");
        assert!(!city.transit_lines.is_empty(), "expected transit lines");
    }

    // AC5 + Gotcha 4: debug-format fixture → no duplicate leading segment in route
    #[test]
    fn debug_format_has_no_duplicate_leading_segment() {
        let bytes = include_bytes!("../fixtures/with-transit-paths-debug.cslmap");
        let result = parse_cslmap_bytes(bytes);
        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        let city = result.expect("already checked");
        for line in &city.transit_lines {
            for path in &line.route {
                if path.segment_ids.len() >= 2 {
                    assert_ne!(
                        path.segment_ids[0], path.segment_ids[1],
                        "duplicate leading segment must be removed in debug format"
                    );
                }
            }
        }
    }

    // Story 2.5: corrupted.cslmap → PartialParse (XML started valid before error)
    #[test]
    fn corrupted_cslmap_returns_partial_parse_error() {
        let bytes = include_bytes!("../fixtures/corrupted.cslmap");
        let result = parse_cslmap_bytes(bytes);
        assert!(
            matches!(result, Err(VellumError::PartialParse { .. })),
            "expected PartialParse error (XML was partially valid before corruption), got: {result:?}"
        );
    }

    // Story 2.5: XML that fails immediately (no root element processed) → InvalidFile
    #[test]
    fn totally_invalid_file_returns_invalid_file_error() {
        // Quick-xml fails on unclosed tags before any element is opened
        let bytes = b"<unclosed";
        let result = parse_cslmap_bytes(bytes);
        assert!(
            matches!(result, Err(VellumError::InvalidFile { .. })),
            "expected InvalidFile error for XML that fails before root, got: {result:?}"
        );
    }

    // Story 2.5: allow_partial mode on corrupted.cslmap → Ok with partial data
    #[test]
    fn allow_partial_returns_ok_with_partial_data() {
        let bytes = include_bytes!("../fixtures/corrupted.cslmap");
        let result = parse_cslmap_bytes_lenient(bytes);
        assert!(
            result.is_ok(),
            "expected Ok in lenient mode, got: {result:?}"
        );
        let city = result.expect("already checked");
        assert_eq!(
            city.city_name, "Corrupted",
            "city_name should be populated from the valid section before corruption"
        );
    }

    // AC4 + Gotcha 7: unknown DLC assets → Ok with fallback (non-fatal)
    #[test]
    fn unknown_dlc_assets_returns_ok_with_fallback() {
        let bytes = include_bytes!("../fixtures/unknown-dlc-assets.cslmap");
        let result = parse_cslmap_bytes(bytes);
        assert!(
            result.is_ok(),
            "expected Ok (DLC fallback non-fatal), got: {result:?}"
        );
    }

    // AC2 + Gotcha 5: [Deprecated] prefix stripped before WayType classification
    #[test]
    fn deprecated_prefix_stripped_in_way_type() {
        use crate::city_data::WayType;
        let types = way_type_from_item_class("[Deprecated]Basic Road");
        assert!(matches!(types[0], WayType::Road), "expected Road, got {types:?}");

        let types = way_type_from_item_class("[Deprecated]Highway");
        assert!(matches!(types[0], WayType::Highway), "expected Highway, got {types:?}");
    }

    #[test]
    fn way_type_from_item_class_covers_main_cases() {
        use crate::city_data::WayType;
        let cases: &[(&str, WayType)] = &[
            ("Basic Road", WayType::Road),
            ("Medium Road Elevated", WayType::Road),
            ("Highway", WayType::Highway),
            ("Highway Elevated", WayType::Highway),
            ("Pedestrian Way", WayType::Pedestrian),
            ("Bicycle Lane", WayType::Bicycle),
        ];
        for (icls, expected) in cases {
            let types = way_type_from_item_class(icls);
            assert!(
                std::mem::discriminant(&types[0]) == std::mem::discriminant(expected),
                "{icls}: expected {expected:?}, got {types:?}"
            );
        }

        // "Medium Road Elevated" → [Road, Elevated]
        let elevated = way_type_from_item_class("Medium Road Elevated");
        assert!(elevated.iter().any(|t| matches!(t, WayType::Elevated)),
            "expected Elevated flag in {elevated:?}");

        // Truly unknown (no road/highway/pedestrian/bicycle keyword) → [None]
        let unknown = way_type_from_item_class("Electricity Wire");
        assert!(matches!(unknown[0], WayType::None), "expected None, got {unknown:?}");
    }

    // Terrain CSV parsing: land vs water classification
    #[test]
    fn terrain_csv_classifies_land_and_water() {
        let mut land = Vec::new();
        let mut water = Vec::new();
        // sea_level = 100: raw 50 → water, raw 200 → land
        parse_terrain_csv("50:0,200:0", 100.0, &mut land, &mut water);
        assert_eq!(water.len(), 1, "one water tile expected");
        assert_eq!(land.len(), 1, "one land tile expected");
    }

    // Terrain CSV grid overflow guard: entries beyond 1081×1081 are discarded
    #[test]
    fn terrain_csv_overflow_guard() {
        let mut land = Vec::new();
        let mut water = Vec::new();
        // Generate 1081*1081 + 5 entries; all elevation=300 (above sea_level=100)
        let entry = "300:0";
        let total = 1081 * 1081 + 5;
        let csv = std::iter::repeat(entry).take(total).collect::<Vec<_>>().join(",");
        parse_terrain_csv(&csv, 100.0, &mut land, &mut water);
        assert_eq!(land.len(), 1081 * 1081, "overflow entries must be discarded");
    }

    // Color hex conversion — 8-digit format with alpha
    #[test]
    fn rgba_to_hex_formats_correctly() {
        assert_eq!(rgba_to_hex(255, 102, 0, 255), "#FF6600FF");
        assert_eq!(rgba_to_hex(44, 85, 191, 255), "#2C55BFFF");
        assert_eq!(rgba_to_hex(0, 0, 0, 0), "#00000000");
    }

    // parse_cslmap_bytes transparently strips UTF-8 BOM
    #[test]
    fn parse_cslmap_bytes_strips_bom() {
        let mut with_bom: Vec<u8> = b"\xEF\xBB\xBF".to_vec();
        with_bom.extend_from_slice(
            b"<CSLExportXML version=\"4.1\"><City>BomCity</City></CSLExportXML>",
        );
        let result = parse_cslmap_bytes(&with_bom);
        assert!(result.is_ok(), "BOM-prefixed input must parse: {result:?}");
        assert_eq!(result.expect("ok").city_name, "BomCity");
    }

    // Transit line color defaults to #FFFFFFFF when <color> element is absent
    #[test]
    fn transit_line_color_defaults_when_absent() {
        let xml =
            b"<CSLExportXML version=\"4.1\"><Transports><Trans id=\"1\" name=\"Bus 1\" type=\"Bus\"></Trans></Transports></CSLExportXML>";
        let result = parse_cslmap_bytes(xml);
        assert!(result.is_ok(), "expected Ok: {result:?}");
        let city = result.expect("ok");
        assert_eq!(city.transit_lines.len(), 1);
        assert_eq!(city.transit_lines[0].color, "#FFFFFFFF");
    }

    #[test]
    #[ignore] // requires large fixture; run manually with cargo test -- --ignored
    fn perf_10mb_file() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/large-city.cslmap");
        if !std::path::Path::new(path).exists() {
            panic!("Fixture not found: {path}. Create a ~10MB .cslmap file to enable this benchmark.");
        }
        let bytes = std::fs::read(path).expect("read file");
        let start = std::time::Instant::now();
        let _ = parse_cslmap_bytes(&bytes); // BOM stripped internally
        let elapsed = start.elapsed();
        assert!(
            elapsed.as_millis() < 100,
            "Parser took {}ms, expected <100ms",
            elapsed.as_millis()
        );
    }

    #[test]
    #[ignore = "manual only - validates against real .cslmap files in test-maps/"]
    fn validate_real_altavento() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../test-maps/Altavento-20260404-020217.cslmap"
        );
        let bytes = std::fs::read(path).expect("read altavento");
        let result = parse_cslmap_bytes(&bytes); // BOM stripped internally
        assert!(result.is_ok(), "Altavento parse failed: {result:?}");
        let city = result.expect("ok");
        eprintln!("city_name: {:?}", city.city_name);
        eprintln!("road_nodes: {}", city.road_nodes.len());
        eprintln!("road_segments: {}", city.road_segments.len());
        eprintln!("land_tiles: {}", city.land_tiles.len());
        eprintln!("water_tiles: {}", city.water_tiles.len());
        eprintln!("transit_lines: {}", city.transit_lines.len());
        eprintln!("buildings: {}", city.buildings.len());
        eprintln!("districts: {}", city.districts.len());
        assert_eq!(city.city_name, "Altavento");
        assert!(city.road_nodes.len() > 1000, "expected many nodes");
        assert!(city.road_segments.len() > 1000, "expected many segments");
        let has_bus_line = city.road_segments.iter().any(|s| s.item_class == "Bus Line");
        assert!(!has_bus_line, "Bus Line must not be in road_segments");
    }
}
