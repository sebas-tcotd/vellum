use crate::city_data::{District, Vec3};

use super::super::utils::{attr_f64, attr_str};

// ─── DistrictBuilder ─────────────────────────────────────────────────────────

/// Accumulates district XML events into finished `District` values.
#[derive(Default)]
pub(crate) struct DistrictBuilder {
    in_dist: bool,
    current_id: String,
    current_name: String,
    current_position: Option<Vec3>,

    pub(crate) districts: Vec<District>,
}

impl DistrictBuilder {
    pub(crate) fn handle_start(&mut self, e: &quick_xml::events::BytesStart<'_>) {
        let local = e.name().local_name();
        if local.as_ref() == b"Dist" {
            self.in_dist = true;
            self.current_id = attr_str(e, b"id").unwrap_or_default();
            self.current_name = attr_str(e, b"name").unwrap_or_default();
            self.current_position = None;
        }
    }

    pub(crate) fn handle_empty(&mut self, e: &quick_xml::events::BytesStart<'_>) {
        let local = e.name().local_name();
        if matches!(local.as_ref(), b"p" | b"P") && self.in_dist && self.current_position.is_none()
        {
            self.current_position = Some(Vec3 {
                x: attr_f64(e, b"x").unwrap_or(0.0),
                y: attr_f64(e, b"y").unwrap_or(0.0),
                z: attr_f64(e, b"z").unwrap_or(0.0),
            });
        }
    }

    pub(crate) fn handle_end(&mut self, local: &[u8]) {
        if local == b"Dist" && self.in_dist {
            let position = self.current_position.take().unwrap_or(Vec3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            });
            self.districts.push(District {
                id: std::mem::take(&mut self.current_id),
                name: std::mem::take(&mut self.current_name),
                position,
            });
            self.in_dist = false;
        }
    }
}
