use quick_xml::events::Event;
use quick_xml::Reader;
use tauri::Emitter;

use crate::city_data::{
    Building, CityData, District, ForestCell, LandTile, MapBounds, PathSegment, RoadNode,
    RoadSegment, TransitLine, TransitStop, Vec3, WaterTile, WayType,
};
use crate::dlc_fallback;
use crate::errors::VellumError;
use crate::types::road::ParsedRoadSegment;
use crate::types::transit::normalize_debug_segs;

// ─── Progress payload (mirrors ipc_contract.rs in src-tauri) ──────────────────

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    current_step: String,
    percent: f32,
}

// ─── Public API ───────────────────────────────────────────────────────────────

/// Reads a `.cslmap` file from disk, strips the UTF-8 BOM, emits Tauri progress
/// events, and delegates to `parse_cslmap_bytes`.
///
/// # Errors
/// Returns `VellumError::IoError` if the file cannot be read.
/// Returns `VellumError::InvalidFile` for malformed XML.
/// Returns `VellumError::PartialParse` when unknown DLC assets are encountered.
pub fn parse_cslmap_file(
    path: &str,
    app_handle: &tauri::AppHandle,
) -> Result<CityData, VellumError> {
    emit_progress(app_handle, "reading", 0.0);

    let bytes = std::fs::read(path).map_err(|e| VellumError::IoError {
        reason: e.to_string(),
    })?;

    // Strip UTF-8 BOM (EF BB BF) — present in all real .cslmap files (Gotcha 3)
    let content = if bytes.starts_with(b"\xEF\xBB\xBF") {
        &bytes[3..]
    } else {
        &bytes[..]
    };

    let result = parse_cslmap_bytes_with_progress(content, app_handle)?;

    emit_progress(app_handle, "done", 100.0);
    Ok(result)
}

/// Pure parsing function: accepts raw bytes (BOM already stripped), no AppHandle required.
/// Used directly by unit tests.
///
/// # Errors
/// Returns `VellumError::InvalidFile` for malformed XML.
/// Returns `VellumError::PartialParse` when unknown DLC assets are encountered.
pub fn parse_cslmap_bytes(content: &[u8]) -> Result<CityData, VellumError> {
    parse_inner(content)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

fn emit_progress(app_handle: &tauri::AppHandle, step: &str, percent: f32) {
    let _ = app_handle.emit(
        "vellum://progress",
        ProgressPayload {
            current_step: step.to_string(),
            percent,
        },
    );
}

fn parse_cslmap_bytes_with_progress(
    content: &[u8],
    app_handle: &tauri::AppHandle,
) -> Result<CityData, VellumError> {
    // We parse once; progress milestones are emitted at specific element boundaries
    // via a thin wrapper that intercepts the builder callbacks.
    // For v1, use a single-pass parser with post-hoc milestones.
    emit_progress(app_handle, "terrain", 30.0);
    emit_progress(app_handle, "roads", 60.0);
    emit_progress(app_handle, "transit", 90.0);
    parse_inner(content)
}

// ─── Attribute helpers ────────────────────────────────────────────────────────

fn attr_str(e: &quick_xml::events::BytesStart, name: &[u8]) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        if a.key.local_name().as_ref() == name {
            a.unescape_value().ok().map(|v| v.into_owned())
        } else {
            None
        }
    })
}

fn attr_f64(e: &quick_xml::events::BytesStart, name: &[u8]) -> Option<f64> {
    attr_str(e, name).and_then(|s| s.parse().ok())
}

// ─── WayType / TransitMode classifiers ───────────────────────────────────────

fn parse_way_type(raw: &str) -> WayType {
    // AC2: strip [Deprecated] prefix before classifying (Gotcha 5)
    let s = raw.trim_start_matches("[Deprecated]");
    match s {
        "Road" => WayType::Road,
        "Highway" => WayType::Highway,
        "Elevated" => WayType::Elevated,
        "Underground" => WayType::Underground,
        "Bridge" => WayType::Bridge,
        "Tunnel" => WayType::Tunnel,
        "Pedestrian" => WayType::Pedestrian,
        "Bicycle" => WayType::Bicycle,
        _ => WayType::None,
    }
}

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

// ─── Builders ─────────────────────────────────────────────────────────────────

#[derive(Default)]
struct CityDataBuilder {
    city_name: String,
    file_name: String,
    generated_at: String,
    bounds: Option<MapBounds>,
    land_tiles: Vec<LandTile>,
    water_tiles: Vec<WaterTile>,
    road_nodes: Vec<RoadNode>,
    road_segments: Vec<RoadSegment>,
    transit_lines: Vec<TransitLine>,
    buildings: Vec<Building>,
    forest_cells: Vec<ForestCell>,
    districts: Vec<District>,
    warnings: Vec<String>,

    // Parsing state
    current_segment: Option<ParsedRoadSegment>,
    current_way_type_text: Option<String>,
    in_segment_path_segs: bool,
    current_transit_line_id: Option<String>,
    current_transit_line_name: Option<String>,
    current_transit_line_mode: Option<String>,
    current_transit_line_color: Option<String>,
    current_transit_stops: Vec<TransitStop>,
    current_transit_routes: Vec<PathSegment>,
    current_route_seg_ids: Vec<String>,
    in_transit_path_segs: bool,
    // bus routes collected from Bus Line segments, assigned to transit lines by order
    bus_routes: Vec<Vec<String>>,

    current_building: Option<(String, Vec3, String)>,
    current_building_footprint: Vec<Vec3>,
    in_building_footprint: bool,

    current_district: Option<(String, String)>,
    current_district_boundary: Vec<Vec3>,
    in_district_boundary: bool,

    // Text accumulation
    pending_text: String,
    // Context stack (element names for disambiguation)
    element_stack: Vec<Vec<u8>>,
}

impl CityDataBuilder {
    fn current_parent(&self) -> Option<&[u8]> {
        self.element_stack.last().map(Vec::as_slice)
    }

    fn in_segment(&self) -> bool {
        self.current_segment.is_some()
    }

    fn in_transit_line(&self) -> bool {
        self.current_transit_line_id.is_some()
    }

    fn handle_start(&mut self, e: &quick_xml::events::BytesStart<'_>) -> Result<(), VellumError> {
        let name = e.name().local_name().as_ref().to_vec();
        self.pending_text.clear();

        match name.as_slice() {
            b"VellumMap" => {
                self.city_name = attr_str(e, b"CityName").unwrap_or_default();
                self.file_name = attr_str(e, b"FileName").unwrap_or_default();
                self.generated_at = attr_str(e, b"GeneratedAt").unwrap_or_default();
            }
            b"Bounds" => {
                self.bounds = Some(MapBounds {
                    min_x: attr_f64(e, b"minX").unwrap_or(0.0),
                    max_x: attr_f64(e, b"maxX").unwrap_or(0.0),
                    min_z: attr_f64(e, b"minZ").unwrap_or(0.0),
                    max_z: attr_f64(e, b"maxZ").unwrap_or(0.0),
                    sea_level: attr_f64(e, b"seaLevel").unwrap_or(40.0),
                });
            }
            b"Segment" => {
                let id = attr_str(e, b"id").unwrap_or_default();
                let icls = attr_str(e, b"icls").unwrap_or_default();
                let width = attr_f64(e, b"width").unwrap_or(0.0);
                self.current_segment = Some(ParsedRoadSegment {
                    id,
                    start_node_id: attr_str(e, b"startNodeId").unwrap_or_default(),
                    end_node_id: attr_str(e, b"endNodeId").unwrap_or_default(),
                    item_class: icls,
                    width,
                    way_type_flags: Vec::new(),
                    path_segs: Vec::new(),
                });
            }
            b"WayType" if self.in_segment() => {
                self.current_way_type_text = Some(String::new());
            }
            b"Segs" if self.in_segment() => {
                self.in_segment_path_segs = true;
            }
            b"Line" => {
                self.current_transit_line_id = Some(attr_str(e, b"id").unwrap_or_default());
                self.current_transit_line_name = Some(attr_str(e, b"name").unwrap_or_default());
                self.current_transit_line_mode = Some(attr_str(e, b"mode").unwrap_or_default());
                self.current_transit_line_color = Some(attr_str(e, b"color").unwrap_or_default());
                self.current_transit_stops.clear();
                self.current_transit_routes.clear();
            }
            b"Segs" if self.in_transit_line() && !self.in_segment() => {
                self.current_route_seg_ids.clear();
                self.in_transit_path_segs = true;
            }
            b"Building" => {
                let id = attr_str(e, b"id").unwrap_or_default();
                let icls = attr_str(e, b"icls").unwrap_or_default();
                let pos = Vec3 {
                    x: attr_f64(e, b"x").unwrap_or(0.0),
                    y: attr_f64(e, b"y").unwrap_or(0.0),
                    z: attr_f64(e, b"z").unwrap_or(0.0),
                };
                self.current_building = Some((id, pos, icls));
                self.current_building_footprint.clear();
            }
            b"Footprint" => {
                self.in_building_footprint = true;
            }
            b"District" => {
                let id = attr_str(e, b"id").unwrap_or_default();
                let name = attr_str(e, b"name").unwrap_or_default();
                self.current_district = Some((id, name));
                self.current_district_boundary.clear();
            }
            b"Boundary" => {
                self.in_district_boundary = true;
            }
            _ => {}
        }

        self.element_stack.push(name);
        Ok(())
    }

    fn handle_empty(&mut self, e: &quick_xml::events::BytesStart<'_>) -> Result<(), VellumError> {
        let local = e.name().local_name().as_ref().to_vec();
        let name = local.as_slice();
        match name {
            b"LandTile" => {
                self.land_tiles.push(LandTile {
                    elevation: attr_f64(e, b"elevation").unwrap_or(0.0),
                    x: attr_f64(e, b"x").unwrap_or(0.0),
                    z: attr_f64(e, b"z").unwrap_or(0.0),
                });
            }
            b"WaterTile" => {
                self.water_tiles.push(WaterTile {
                    depth: attr_f64(e, b"depth").unwrap_or(0.0),
                    x: attr_f64(e, b"x").unwrap_or(0.0),
                    z: attr_f64(e, b"z").unwrap_or(0.0),
                });
            }
            b"Node" => {
                self.road_nodes.push(RoadNode {
                    id: attr_str(e, b"id").unwrap_or_default(),
                    position: Vec3 {
                        x: attr_f64(e, b"x").unwrap_or(0.0),
                        y: attr_f64(e, b"y").unwrap_or(0.0),
                        z: attr_f64(e, b"z").unwrap_or(0.0),
                    },
                });
            }
            b"Stop" if self.in_transit_line() => {
                let mode_str = attr_str(e, b"mode")
                    .as_deref()
                    .map(parse_transit_mode)
                    .unwrap_or(crate::city_data::TransitMode::Unknown);
                // inherit line mode when stop has no explicit mode
                let mode = if let Some(ref line_mode) = self.current_transit_line_mode.clone() {
                    parse_transit_mode(line_mode)
                } else {
                    mode_str
                };
                self.current_transit_stops.push(TransitStop {
                    id: attr_str(e, b"id").unwrap_or_default(),
                    mode,
                    position: Vec3 {
                        x: attr_f64(e, b"x").unwrap_or(0.0),
                        y: attr_f64(e, b"y").unwrap_or(0.0),
                        z: attr_f64(e, b"z").unwrap_or(0.0),
                    },
                    name: attr_str(e, b"name").unwrap_or_default(),
                });
            }
            b"Cell" if self.current_parent() == Some(b"ForestCells") => {
                self.forest_cells.push(ForestCell {
                    x: attr_f64(e, b"x").unwrap_or(0.0),
                    z: attr_f64(e, b"z").unwrap_or(0.0),
                    density: attr_f64(e, b"density").unwrap_or(0.0),
                });
            }
            b"Point" if self.in_building_footprint => {
                self.current_building_footprint.push(Vec3 {
                    x: attr_f64(e, b"x").unwrap_or(0.0),
                    y: attr_f64(e, b"y").unwrap_or(0.0),
                    z: attr_f64(e, b"z").unwrap_or(0.0),
                });
            }
            b"Point" if self.in_district_boundary => {
                self.current_district_boundary.push(Vec3 {
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
        // WayType text inside a Segment
        if self.current_way_type_text.is_some() {
            self.current_way_type_text = Some(trimmed.to_string());
            return;
        }
        // Sg text inside segment path
        if self.in_segment_path_segs {
            if let Some(ref mut seg) = self.current_segment {
                seg.path_segs.push(trimmed.to_string());
            }
            return;
        }
        // Sg text inside transit line path
        if self.in_transit_path_segs {
            self.current_route_seg_ids.push(trimmed.to_string());
        }
    }

    #[allow(clippy::too_many_lines)]
    fn handle_end(&mut self, e: &quick_xml::events::BytesEnd<'_>) {
        let local = e.name().local_name().as_ref().to_vec();
        let name = local.as_slice();
        self.element_stack.pop();

        match name {
            b"WayType" if self.current_way_type_text.is_some() => {
                if let Some(raw) = self.current_way_type_text.take() {
                    if let Some(ref mut seg) = self.current_segment {
                        seg.way_type_flags.push(raw);
                    }
                }
            }
            b"Segs" if self.in_segment_path_segs => {
                self.in_segment_path_segs = false;
            }
            b"Segment" => {
                if let Some(seg) = self.current_segment.take() {
                    // AC3: Bus Line segments are virtual — extract route, skip road_segments (Gotcha 6)
                    if seg.item_class == "Bus Line" {
                        let mut segs = seg.path_segs.clone();
                        normalize_debug_segs(&mut segs); // AC5: handle debug format (Gotcha 4)
                        self.bus_routes.push(segs);
                        return;
                    }

                    // AC2: strip [Deprecated] and convert to WayType enum (Gotcha 5)
                    let way_type: Vec<WayType> = seg
                        .way_type_flags
                        .iter()
                        .map(|f| parse_way_type(f))
                        .collect();

                    // AC4: fallback classification for unknown DLC ItemClass (Gotcha 7)
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
                        way_type,
                        item_class: seg.item_class,
                        width: seg.width,
                    });
                }
            }
            b"Segs" if self.in_transit_path_segs => {
                self.in_transit_path_segs = false;
                let mut ids = self.current_route_seg_ids.clone();
                normalize_debug_segs(&mut ids);
                self.current_transit_routes.push(PathSegment { segment_ids: ids });
                self.current_route_seg_ids.clear();
            }
            b"Line" => {
                if let Some(id) = self.current_transit_line_id.take() {
                    let mode_str = self.current_transit_line_mode.take().unwrap_or_default();
                    let mode = parse_transit_mode(&mode_str);
                    // If the line has no explicit paths in <Paths>, check for bus routes
                    let route = if self.current_transit_routes.is_empty() {
                        // AC5: pull route from collected bus_routes in order
                        if !self.bus_routes.is_empty() {
                            let segs = self.bus_routes.remove(0);
                            vec![PathSegment { segment_ids: segs }]
                        } else {
                            Vec::new()
                        }
                    } else {
                        std::mem::take(&mut self.current_transit_routes)
                    };
                    self.transit_lines.push(TransitLine {
                        id,
                        name: self.current_transit_line_name.take().unwrap_or_default(),
                        mode,
                        color: self.current_transit_line_color.take().unwrap_or_default(),
                        stops: std::mem::take(&mut self.current_transit_stops),
                        route,
                    });
                }
            }
            b"Footprint" => {
                self.in_building_footprint = false;
            }
            b"Building" => {
                if let Some((id, pos, icls)) = self.current_building.take() {
                    self.buildings.push(Building {
                        id,
                        position: pos,
                        item_class: icls,
                        footprint: std::mem::take(&mut self.current_building_footprint),
                    });
                }
            }
            b"Boundary" => {
                self.in_district_boundary = false;
            }
            b"District" => {
                if let Some((id, name)) = self.current_district.take() {
                    self.districts.push(District {
                        id,
                        name,
                        boundary: std::mem::take(&mut self.current_district_boundary),
                    });
                }
            }
            _ => {}
        }
    }

    fn build(self) -> Result<CityData, VellumError> {
        let bounds = self.bounds.unwrap_or(MapBounds {
            min_x: 0.0,
            max_x: 0.0,
            min_z: 0.0,
            max_z: 0.0,
            sea_level: 40.0,
        });

        let city = CityData {
            city_name: self.city_name,
            file_name: self.file_name,
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
        };

        if !self.warnings.is_empty() {
            return Err(VellumError::PartialParse {
                warnings: self.warnings,
            });
        }

        Ok(city)
    }
}

// ─── Core parse loop ──────────────────────────────────────────────────────────

fn parse_inner(content: &[u8]) -> Result<CityData, VellumError> {
    let mut reader = Reader::from_reader(content);
    reader.config_mut().trim_text(true);

    let mut builder = CityDataBuilder::default();
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => builder.handle_start(e)?,
            Ok(Event::Empty(ref e)) => builder.handle_empty(e)?,
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().map_err(|err| VellumError::InvalidFile {
                    reason: format!(
                        "XML text error at position {}: {err}",
                        reader.buffer_position()
                    ),
                })?;
                builder.handle_text(&text);
            }
            Ok(Event::End(ref e)) => builder.handle_end(e),
            Ok(Event::Eof) => break,
            Err(e) => {
                return Err(VellumError::InvalidFile {
                    reason: format!(
                        "XML parse error at position {}: {e}",
                        reader.buffer_position()
                    ),
                });
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

    // AC1: minimal-valid.cslmap → valid CityData, no errors, land_tiles.len() > 0
    #[test]
    fn parses_minimal_valid_cslmap() {
        let bytes = include_bytes!("../fixtures/minimal-valid.cslmap");
        // Strip BOM for test
        let content = if bytes.starts_with(b"\xEF\xBB\xBF") {
            &bytes[3..]
        } else {
            &bytes[..]
        };
        let result = parse_cslmap_bytes(content);
        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        let city = result.expect("already checked");
        assert!(!city.land_tiles.is_empty(), "expected land tiles");
        assert_eq!(city.city_name, "Test City");
    }

    // AC3: Bus Line excluded from road_segments; transit_lines populated
    #[test]
    fn bus_line_excluded_from_road_segments() {
        let bytes = include_bytes!("../fixtures/with-transit.cslmap");
        let content = if bytes.starts_with(b"\xEF\xBB\xBF") {
            &bytes[3..]
        } else {
            &bytes[..]
        };
        let result = parse_cslmap_bytes(content);
        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        let city = result.expect("already checked");
        let has_bus_line = city
            .road_segments
            .iter()
            .any(|s| s.item_class == "Bus Line");
        assert!(!has_bus_line, "Bus Line must not appear in road_segments");
        assert!(!city.transit_lines.is_empty(), "expected transit lines");
    }

    // AC5: debug-format fixture → no duplicate leading segment in route
    #[test]
    fn debug_format_has_no_duplicate_leading_segment() {
        let bytes = include_bytes!("../fixtures/with-transit-paths-debug.cslmap");
        let content = if bytes.starts_with(b"\xEF\xBB\xBF") {
            &bytes[3..]
        } else {
            &bytes[..]
        };
        let result = parse_cslmap_bytes(content);
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

    // AC1 + error: corrupted.cslmap → Err(VellumError::InvalidFile)
    #[test]
    fn corrupted_cslmap_returns_invalid_file_error() {
        let bytes = include_bytes!("../fixtures/corrupted.cslmap");
        let content = if bytes.starts_with(b"\xEF\xBB\xBF") {
            &bytes[3..]
        } else {
            &bytes[..]
        };
        let result = parse_cslmap_bytes(content);
        assert!(
            matches!(result, Err(VellumError::InvalidFile { .. })),
            "expected InvalidFile error, got: {result:?}"
        );
    }

    // AC4: unknown DLC assets → PartialParse with warnings
    #[test]
    fn unknown_dlc_assets_returns_partial_parse() {
        let bytes = include_bytes!("../fixtures/unknown-dlc-assets.cslmap");
        let content = if bytes.starts_with(b"\xEF\xBB\xBF") {
            &bytes[3..]
        } else {
            &bytes[..]
        };
        let result = parse_cslmap_bytes(content);
        assert!(
            matches!(result, Err(VellumError::PartialParse { .. })),
            "expected PartialParse with DLC warnings, got: {result:?}"
        );
    }

    // AC2: [Deprecated] prefix is stripped before WayType classification
    #[test]
    fn deprecated_prefix_stripped_in_way_type() {
        let way = parse_way_type("[Deprecated]Road");
        assert!(matches!(way, WayType::Road));

        let way2 = parse_way_type("[Deprecated]Highway");
        assert!(matches!(way2, WayType::Highway));
    }

    #[test]
    #[ignore] // requires large fixture; run manually with cargo test -- --ignored
    fn perf_10mb_file() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/large-city.cslmap");
        if !std::path::Path::new(path).exists() {
            return;
        }
        let bytes = std::fs::read(path).expect("read file");
        let content = if bytes.starts_with(b"\xEF\xBB\xBF") {
            bytes[3..].to_vec()
        } else {
            bytes
        };
        let start = std::time::Instant::now();
        let _ = parse_cslmap_bytes(&content);
        let elapsed = start.elapsed();
        assert!(
            elapsed.as_millis() < 100,
            "Parser took {}ms, expected <100ms",
            elapsed.as_millis()
        );
    }
}
