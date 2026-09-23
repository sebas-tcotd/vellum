use crate::city_data::Vec3;

use super::super::utils::{attr_f64, attr_str};

/// A building as read from the source. Its anchor `position` is derived from the
/// footprint when `CityData` is built.
#[derive(Debug, Clone)]
pub(crate) struct RawBuilding {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) item_class: String,
    pub(crate) service_type: String,
    pub(crate) footprint: Vec<Vec3>,
}

// ─── BuildingBuilder ─────────────────────────────────────────────────────────

/// Accumulates building XML events into finished `Building` values.
#[derive(Default)]
pub(crate) struct BuildingBuilder {
    in_buil: bool,
    current_id: String,
    current_name: String,
    current_icls: String,
    current_subsrv: String,
    in_points: bool,
    current_footprint: Vec<Vec3>,

    pub(crate) buildings: Vec<RawBuilding>,
}

impl BuildingBuilder {
    pub(crate) fn handle_start(&mut self, e: &quick_xml::events::BytesStart<'_>) {
        let local = e.name().local_name();
        match local.as_ref() {
            b"Buil" => {
                self.in_buil = true;
                self.current_id = attr_str(e, b"id").unwrap_or_default();
                self.current_name = attr_str(e, b"name").unwrap_or_default();
                self.current_icls = attr_str(e, b"icls").unwrap_or_default();
                self.current_subsrv = attr_str(e, b"subsrv").unwrap_or_default();
                self.current_footprint.clear();
            }
            b"Points" if self.in_buil => {
                self.in_points = true;
            }
            _ => {}
        }
    }

    pub(crate) fn handle_empty(&mut self, e: &quick_xml::events::BytesStart<'_>) {
        let local = e.name().local_name();
        if matches!(local.as_ref(), b"p" | b"P") && self.in_points {
            self.current_footprint.push(Vec3 {
                x: attr_f64(e, b"x").unwrap_or(0.0),
                y: attr_f64(e, b"y").unwrap_or(0.0),
                z: attr_f64(e, b"z").unwrap_or(0.0),
            });
        }
    }

    pub(crate) fn handle_end(&mut self, local: &[u8]) {
        match local {
            b"Points" if self.in_points => {
                self.in_points = false;
            }
            b"Buil" if self.in_buil => {
                self.buildings.push(RawBuilding {
                    id: std::mem::take(&mut self.current_id),
                    name: std::mem::take(&mut self.current_name),
                    item_class: std::mem::take(&mut self.current_icls),
                    service_type: std::mem::take(&mut self.current_subsrv),
                    footprint: std::mem::take(&mut self.current_footprint),
                });
                self.in_buil = false;
            }
            _ => {}
        }
    }
}
