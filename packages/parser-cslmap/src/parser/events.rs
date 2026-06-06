/// Tauri event payload for parse progress (`vellum://progress`).
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProgressPayload {
    pub(crate) current_step: String,
    pub(crate) percent: f32,
}

/// Tauri event payload for parse warnings (`vellum://parse-warnings`).
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ParseWarningsPayload {
    pub(crate) warnings: Vec<String>,
}
