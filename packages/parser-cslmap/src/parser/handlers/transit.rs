use crate::city_data::Vec3;
use std::collections::{HashMap, VecDeque};

use super::super::utils::{attr_str, rgba_to_hex};

/// Maps the game's `TransportType` name, and the class level of the line's
/// prefab when the source has it, to a [`TransitMode`].
///
/// `class_level` is `ItemClass.Level` as an integer (`0` = `Level1`), written
/// by Bridge from `transit` 1.2. It only splits the transport types the game
/// shares between a city line and an intercity one: `Ship` (`0` passenger
/// ship, `1` ferry), `Airplane` (`0` passenger plane, `1` blimp) and `Bus`
/// (`2` intercity bus). Without a level, or with one not listed here, the
/// mapping is the one older sources always had: `Ferry`, `Blimp` and `Bus`.
///
/// [`TransitMode`]: crate::city_data::TransitMode
pub fn parse_transit_mode(s: &str, class_level: Option<u32>) -> crate::city_data::TransitMode {
    use crate::city_data::TransitMode;
    match (s, class_level) {
        ("Ship", Some(0)) => TransitMode::PassengerShip,
        ("Airplane", Some(0)) => TransitMode::Airplane,
        ("Bus", Some(2)) => TransitMode::IntercityBus,
        ("Bus", _) => TransitMode::Bus,
        ("EvacuationBus", _) => TransitMode::EvacuationBus,
        ("Tram", _) => TransitMode::Tram,
        ("Train", _) => TransitMode::Train,
        ("Metro", _) => TransitMode::Metro,
        ("CableCar", _) => TransitMode::CableCar,
        ("Monorail", _) => TransitMode::Monorail,
        ("Ferry" | "Ship", _) => TransitMode::Ferry,
        ("Blimp" | "Airplane", _) => TransitMode::Blimp,
        ("Trolleybus", _) => TransitMode::Trolleybus,
        ("Pedestrian", _) => TransitMode::WalkingTour,
        ("TouristBus", _) => TransitMode::SightseeingBus,
        ("HotAirBalloon", _) => TransitMode::HotAirBalloon,
        ("Helicopter", _) => TransitMode::Helicopter,
        ("Taxi", _) => TransitMode::Taxi,
        _ => TransitMode::Unknown,
    }
}

// ─── Raw transit ─────────────────────────────────────────────────────────────

/// A transit stop as read from the source: its node, resolved position and name
/// (empty when the source has none).
#[derive(Debug, Clone)]
pub(crate) struct RawTransitStop {
    pub(crate) node_id: String,
    pub(crate) position: Vec3,
    pub(crate) name: String,
    /// `true` when `name` was derived from the street (native documents only).
    pub(crate) name_derived: bool,
    /// `sourceId` of the stop's station building (native documents, transit 1.1).
    pub(crate) station_id: Option<String>,
}

/// A transit line as read from the source. `transport_type` is the game's raw
/// `TransportType` name; it is mapped to `TransitMode` when `CityData` is built.
/// `route` is the ordered list of segment IDs of the whole line.
#[derive(Debug, Clone)]
pub(crate) struct RawTransitLine {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) transport_type: String,
    /// `ItemClass.Level` of the line's prefab (native documents, transit 1.2).
    pub(crate) class_level: Option<u32>,
    pub(crate) color: String,
    pub(crate) stops: Vec<RawTransitStop>,
    pub(crate) route: Vec<String>,
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
    current_stops: Vec<RawTransitStop>,

    pub(crate) transit_lines: Vec<RawTransitLine>,
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
                let position = node_position_index.get(&node_id).cloned().unwrap_or(Vec3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                });
                self.current_stops.push(RawTransitStop {
                    node_id,
                    position,
                    name: String::new(),
                    name_derived: false,
                    station_id: None,
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
        let stop_ids: Vec<String> = self
            .current_stops
            .iter()
            .map(|s| s.node_id.clone())
            .collect();
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
        self.transit_lines.push(RawTransitLine {
            id,
            name,
            transport_type: mode_str,
            class_level: None,
            color,
            stops: std::mem::take(&mut self.current_stops),
            route: all_seg_ids,
        });
        self.in_trans = false;
    }
}

#[cfg(test)]
mod tests {
    use super::parse_transit_mode;
    use crate::city_data::TransitMode;

    #[test]
    fn tour_transport_types_map_to_tour_modes() {
        assert!(matches!(
            parse_transit_mode("Pedestrian", None),
            TransitMode::WalkingTour
        ));
        assert!(matches!(
            parse_transit_mode("TouristBus", None),
            TransitMode::SightseeingBus
        ));
        assert!(matches!(
            parse_transit_mode("HotAirBalloon", None),
            TransitMode::HotAirBalloon
        ));
    }

    #[test]
    fn unrecognized_transport_type_falls_back_to_unknown() {
        assert!(matches!(
            parse_transit_mode("Post", None),
            TransitMode::Unknown
        ));
    }

    #[test]
    fn airplane_transit_mode_maps_to_blimp() {
        // Without a class level (`.cslmap`, `transit` before 1.2) nothing changes.
        assert!(matches!(
            parse_transit_mode("Airplane", None),
            TransitMode::Blimp
        ));
        assert!(matches!(
            parse_transit_mode("Ship", None),
            TransitMode::Ferry
        ));
        assert!(matches!(parse_transit_mode("Bus", None), TransitMode::Bus));
    }

    #[test]
    fn class_level_splits_city_and_intercity_lines() {
        let cases = [
            ("Ship", 0, "PassengerShip"),
            ("Ship", 1, "Ferry"),
            ("Airplane", 0, "Airplane"),
            ("Airplane", 1, "Blimp"),
            ("Bus", 0, "Bus"),
            ("Bus", 2, "IntercityBus"),
            ("Metro", 0, "Metro"),
        ];
        for (transport_type, level, want) in cases {
            let mode = parse_transit_mode(transport_type, Some(level));
            assert_eq!(format!("{mode:?}"), want, "{transport_type} level {level}");
        }
    }

    #[test]
    fn unexpected_class_level_keeps_the_old_mapping() {
        for level in [3, 4, 255] {
            assert!(matches!(
                parse_transit_mode("Ship", Some(level)),
                TransitMode::Ferry
            ));
            assert!(matches!(
                parse_transit_mode("Airplane", Some(level)),
                TransitMode::Blimp
            ));
        }
        assert!(matches!(
            parse_transit_mode("Bus", Some(1)),
            TransitMode::Bus
        ));
    }

    #[test]
    fn out_of_scale_transport_types_are_their_own_modes() {
        assert!(matches!(
            parse_transit_mode("Helicopter", None),
            TransitMode::Helicopter
        ));
        assert!(matches!(
            parse_transit_mode("EvacuationBus", None),
            TransitMode::EvacuationBus
        ));
        assert!(matches!(
            parse_transit_mode("Taxi", None),
            TransitMode::Taxi
        ));
        assert!(matches!(
            parse_transit_mode("EvacuationBus", Some(0)),
            TransitMode::EvacuationBus
        ));
    }
}
