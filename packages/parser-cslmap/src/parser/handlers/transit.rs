use crate::city_data::{PathSegment, TransitLine, TransitStop, Vec3};
use std::collections::{HashMap, VecDeque};

use super::super::utils::{attr_str, rgba_to_hex};

pub fn parse_transit_mode(s: &str) -> crate::city_data::TransitMode {
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

// ─── TransitBuilder ──────────────────────────────────────────────────────────

/// Accumulates transit XML events into finished `TransitLine` values.
/// Requires a shared reference to `node_position_index` and
/// `transit_route_by_nodes` produced by `RoadBuilder`.
#[derive(Default)]
pub(crate) struct TransitBuilder {
    in_trans: bool,
    current_id: String,
    current_name: String,
    current_mode: String,
    current_color: String,
    current_stops: Vec<TransitStop>,

    pub(crate) transit_lines: Vec<TransitLine>,
}

impl TransitBuilder {
    fn in_transit(&self) -> bool {
        self.in_trans
    }

    pub(crate) fn handle_start(&mut self, e: &quick_xml::events::BytesStart<'_>) {
        let local = e.name().local_name();
        if local.as_ref() == b"Trans" {
            if self.in_trans {
                eprintln!(
                    "[parser-cslmap] Nested <Trans> start encountered — discarding previous state"
                );
            }
            self.in_trans = true;
            self.current_id = attr_str(e, b"id").unwrap_or_default();
            self.current_name = attr_str(e, b"name").unwrap_or_default();
            self.current_mode = attr_str(e, b"type").unwrap_or_default();
            self.current_color = String::new();
            self.current_stops.clear();
        }
    }

    pub(crate) fn handle_empty(
        &mut self,
        e: &quick_xml::events::BytesStart<'_>,
        node_position_index: &HashMap<String, Vec3>,
    ) {
        if !self.in_transit() {
            return;
        }
        let local = e.name().local_name();
        match local.as_ref() {
            b"color" => {
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
                self.current_color = rgba_to_hex(r, g, b_val, a);
            }
            b"Stop" => {
                let node_id = attr_str(e, b"node").unwrap_or_default();
                let mode = parse_transit_mode(&self.current_mode.clone());
                let position = node_position_index.get(&node_id).cloned().unwrap_or(Vec3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                });
                self.current_stops.push(TransitStop {
                    id: node_id,
                    mode,
                    position,
                    name: String::new(),
                });
            }
            _ => {}
        }
    }

    pub(crate) fn handle_end(
        &mut self,
        local: &[u8],
        transit_route_by_nodes: &mut HashMap<(String, String), VecDeque<Vec<String>>>,
    ) {
        if local != b"Trans" || !self.in_trans {
            return;
        }

        let id = std::mem::take(&mut self.current_id);
        let name = std::mem::take(&mut self.current_name);
        let mode_str = std::mem::take(&mut self.current_mode);
        let raw_color = std::mem::take(&mut self.current_color);
        let color = if raw_color.is_empty() {
            "#FFFFFFFF".to_string()
        } else {
            raw_color
        };
        let mode = parse_transit_mode(&mode_str);

        let stop_ids: Vec<String> = self.current_stops.iter().map(|s| s.id.clone()).collect();
        let n = stop_ids.len();
        let mut all_seg_ids: Vec<String> = Vec::new();
        for i in 0..n {
            let key = (stop_ids[i].clone(), stop_ids[(i + 1) % n].clone());
            if let Some(queue) = transit_route_by_nodes.get_mut(&key) {
                if let Some(leg_segs) = queue.pop_front() {
                    all_seg_ids.extend(leg_segs);
                }
                if queue.is_empty() {
                    transit_route_by_nodes.remove(&key);
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
            stops: std::mem::take(&mut self.current_stops),
            route,
        });
        self.in_trans = false;
    }
}
