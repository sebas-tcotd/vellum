use crate::city_data::{ParkArea, ParkType, Vec3};

use super::super::types::TextElement;
use super::super::utils::{attr_f64, attr_str};

#[derive(Default)]
pub(crate) struct ParkBuilder {
    in_park: bool,
    current_id: String,
    current_name: String,
    current_position: Option<Vec3>,
    in_type_text: bool,
    current_park_type: String,

    pub(crate) park_areas: Vec<ParkArea>,
}

impl ParkBuilder {
    pub(crate) fn handle_start(
        &mut self,
        e: &quick_xml::events::BytesStart<'_>,
    ) -> Option<TextElement> {
        let local = e.name().local_name();
        if local.as_ref() == b"Park" {
            self.in_park = true;
            self.current_id = attr_str(e, b"id").unwrap_or_default();
            self.current_name = attr_str(e, b"name").unwrap_or_default();
            self.current_position = None;
            self.current_park_type.clear();
        } else if matches!(local.as_ref(), b"P" | b"p") && self.in_park {
            self.capture_position(e);
        } else if local.as_ref() == b"type" && self.in_park {
            self.in_type_text = true;
            self.current_park_type.clear();
            return Some(TextElement::ParkType);
        }
        None
    }

    pub(crate) fn handle_empty(&mut self, e: &quick_xml::events::BytesStart<'_>) {
        self.capture_position(e);
    }

    pub(crate) fn handle_text(&mut self, text: &str) {
        if self.in_type_text {
            self.current_park_type.push_str(text.trim());
        }
    }

    pub(crate) fn handle_end(&mut self, local: &[u8]) {
        if local == b"type" && self.in_park {
            self.in_type_text = false;
        } else if local == b"Park" && self.in_park {
            self.finish_park();
            self.in_park = false;
        }
    }

    fn finish_park(&mut self) {
        let Some(position) = self.current_position.take() else {
            eprintln!(
                "[vellum] Skipping park area '{}' because it has no position",
                self.current_name
            );
            return;
        };

        let park_type = park_type_from_xml(&self.current_park_type);
        if is_placeholder_park(&self.current_id, &self.current_name, &park_type) {
            return;
        }

        self.park_areas.push(ParkArea {
            id: std::mem::take(&mut self.current_id),
            name: std::mem::take(&mut self.current_name),
            position,
            park_type,
        });
    }

    fn capture_position(&mut self, e: &quick_xml::events::BytesStart<'_>) {
        let local = e.name().local_name();
        if !matches!(local.as_ref(), b"P" | b"p")
            || !self.in_park
            || self.current_position.is_some()
        {
            return;
        }

        let (Some(x), Some(y), Some(z)) = (attr_f64(e, b"x"), attr_f64(e, b"y"), attr_f64(e, b"z"))
        else {
            return;
        };
        self.current_position = Some(Vec3 { x, y, z });
    }
}

fn park_type_from_xml(value: &str) -> ParkType {
    match value {
        "Generic" => ParkType::Generic,
        "University" => ParkType::University,
        "TradeSchool" => ParkType::TradeSchool,
        "Industry" => ParkType::Industry,
        "Forestry" => ParkType::Forestry,
        _ => ParkType::None,
    }
}

fn is_placeholder_park(id: &str, name: &str, park_type: &ParkType) -> bool {
    id == "0" && name == "AREA_PATTERN[None]:0" && matches!(park_type, ParkType::None)
}
