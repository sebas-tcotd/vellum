use crate::city_data::Vec3;

/// Intermediate road segment with raw parsed fields before classification.
#[derive(Default)]
pub(crate) struct ParsedSeg {
    pub(crate) id: String,
    pub(crate) start_node_id: String,
    pub(crate) end_node_id: String,
    pub(crate) item_class: String,
    pub(crate) width: f64,
    pub(crate) path_segs: Vec<String>,
    pub(crate) points: Vec<Vec3>,
}

#[derive(Default, PartialEq)]
pub(crate) enum TextElement {
    #[default]
    None,
    City,
    SeaLevel,
    Generated,
    Sg,     // segment ID inside Seg>Path>Segs
    Ter,    // terrain CSV
    Forest, // forest density CSV
}
