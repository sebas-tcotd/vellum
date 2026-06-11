use crate::city_data::{MapBounds, RoadNode, RoadSegment, Vec3};
use crate::dlc_fallback;
use crate::types::transit::normalize_debug_segs;
use std::collections::{HashMap, VecDeque};

use super::super::types::{ParsedSeg, TextElement};
use super::super::utils::{attr_f64, attr_str};

/// Derives `WayType` flags from an `item_class` string.
/// Strips `[Deprecated]` prefix (AC2 / Gotcha 5) before matching.
/// Returns a non-empty Vec — unknown items get `[None]`.
pub fn way_type_from_item_class(item_class: &str) -> Vec<crate::city_data::WayType> {
    use crate::city_data::WayType;
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

// ─── BoundsTracker ───────────────────────────────────────────────────────────

#[derive(Default)]
pub(crate) struct BoundsTracker {
    min_x: f64,
    max_x: f64,
    min_z: f64,
    max_z: f64,
    has_nodes: bool,
}

impl BoundsTracker {
    pub(crate) fn update(&mut self, x: f64, z: f64) {
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

    pub(crate) fn into_bounds(self, sea_level: f64) -> MapBounds {
        if self.has_nodes {
            MapBounds {
                min_x: self.min_x,
                max_x: self.max_x,
                min_z: self.min_z,
                max_z: self.max_z,
                sea_level,
            }
        } else {
            MapBounds {
                min_x: -8640.0,
                max_x: 8640.0,
                min_z: -8640.0,
                max_z: 8640.0,
                sea_level,
            }
        }
    }
}

// ─── RoadBuilder ─────────────────────────────────────────────────────────────

/// Accumulates node and segment XML events into `road_nodes`, `road_segments`,
/// and `node_position_index` (shared with transit for stop resolution).
#[derive(Default)]
#[allow(clippy::struct_excessive_bools)]
pub(crate) struct RoadBuilder {
    in_node: bool,
    current_node_id: String,

    current_seg: Option<ParsedSeg>,
    in_seg_points: bool,
    in_seg_path: bool,
    in_seg_segs: bool,

    pub(crate) bounds: BoundsTracker,
    pub(crate) node_position_index: HashMap<String, Vec3>,
    pub(crate) road_nodes: Vec<RoadNode>,
    pub(crate) road_segments: Vec<RoadSegment>,
    pub(crate) warnings: Vec<String>,

    // Virtual transit connector segs keyed by (sn, en); consumed by TransitBuilder.
    pub(crate) transit_route_by_nodes: HashMap<(String, String), VecDeque<Vec<String>>>,
}

impl RoadBuilder {
    fn in_seg(&self) -> bool {
        self.current_seg.is_some()
    }

    pub(crate) fn handle_start(
        &mut self,
        e: &quick_xml::events::BytesStart<'_>,
    ) -> Option<TextElement> {
        let local = e.name().local_name();
        match local.as_ref() {
            b"Node" => {
                self.in_node = true;
                self.current_node_id = attr_str(e, b"id").unwrap_or_default();
            }
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
                return Some(TextElement::Sg);
            }
            _ => {}
        }
        None
    }

    pub(crate) fn handle_empty(&mut self, e: &quick_xml::events::BytesStart<'_>) {
        let local = e.name().local_name();
        match local.as_ref() {
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
                self.bounds.update(x, z);
            }
            b"p" | b"P" if self.in_seg_points => {
                if let Some(ref mut seg) = self.current_seg {
                    seg.points.push(Vec3 {
                        x: attr_f64(e, b"x").unwrap_or(0.0),
                        y: attr_f64(e, b"y").unwrap_or(0.0),
                        z: attr_f64(e, b"z").unwrap_or(0.0),
                    });
                }
            }
            _ => {}
        }
    }

    pub(crate) fn handle_text_sg(&mut self, trimmed: &str) {
        if trimmed == "0" {
            return;
        }
        if let Some(ref mut seg) = self.current_seg {
            seg.path_segs.push(trimmed.to_string());
        }
    }

    pub(crate) fn handle_end(&mut self, local: &[u8]) {
        match local {
            b"Node" => {
                self.in_node = false;
                self.current_node_id.clear();
            }
            b"Points" if self.in_seg_points => {
                self.in_seg_points = false;
            }
            b"Segs" if self.in_seg_segs => {
                self.in_seg_segs = false;
            }
            b"Path" if self.in_seg_path => {
                self.in_seg_path = false;
            }
            b"Seg" => {
                self.in_seg_points = false;
                self.in_seg_path = false;
                self.in_seg_segs = false;

                if let Some(seg) = self.current_seg.take() {
                    if seg.item_class.ends_with(" Line") {
                        let mut segs = seg.path_segs;
                        normalize_debug_segs(&mut segs);
                        self.transit_route_by_nodes
                            .entry((seg.start_node_id, seg.end_node_id))
                            .or_default()
                            .push_back(segs);
                        return;
                    }

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
            _ => {}
        }
    }
}
