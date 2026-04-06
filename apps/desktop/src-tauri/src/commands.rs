use crate::city_data::CityData;
use crate::errors::VellumError;
use serde::{Deserialize, Serialize};

// ─── Export types (mirrors of ExportOptions/ExportResult in ipc-contract.ts) ─

/// Inbound payload configuration for export commands crossing the IPC boundary.
///
/// **CRITICAL RULE:** This struct must remain perfectly synchronized with `ExportOptions`
/// in `@vellum/core/ipc-contract.ts`. It serializes from `camelCase` JSON.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    /// Target export format and density (e.g., `"png-1x"`, `"png-2x"`, `"png-4x"`, `"svg"`).
    pub format: String,
    /// Spatial area to capture (e.g., `"viewport"`, `"full-map"`).
    pub area: String,
    /// Background rendering behavior (e.g., `"white"`, `"dark"`, `"transparent"`).
    pub background: String,
    /// Desired base filename provided by the user (without extension).
    pub file_name: String,
}

/// Outbound payload returned upon successful completion of an export command.
///
/// **CRITICAL RULE:** Must remain synchronized with `ExportResult` in `ipc-contract.ts`.
/// Serializes to `camelCase` for the frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    /// Absolute file system path to the generated asset.
    pub file_path: String,
    /// Absolute path to the directory containing the asset.
    pub folder_path: String,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// Parses a `.cslmap` file and returns the complete immutable `CityData` domain model.
///
/// **Architectural Context:** /// This is a Tauri IPC endpoint (`#[tauri::command]`). It executes asynchronously off
/// the main thread, ensuring the React UI remains fully responsive (≥30fps) during heavy
/// XML parsing operations, satisfying the strict NFR budget for file loading.
///
/// **Future Implementation (Story 2.x):** /// Currently implemented as a stub. Will be fully implemented using the `quick-xml` crate
/// for high-performance, allocation-efficient parsing.
///
/// # Errors
/// Returns a `VellumError` (serialized to TS) if the file cannot be found, read, or if
/// the XML schema is invalid. The frontend MUST map this error to an i18n key rather
/// than displaying the raw reason.
#[tauri::command]
pub async fn parse_cslmap(file_path: String) -> Result<CityData, VellumError> {
    // TODO(story-2.3): implementar parser real con quick-xml respetando el budget de <100ms
    Err(VellumError::IoError {
        reason: format!("Parser not yet implemented. File: {file_path}"),
    })
}

/// Exports the current map rendering state to a rasterized PNG image.
///
/// **Future Implementation (Story 6.2):** /// Currently a stub. Will handle offscreen rasterization based on the provided `ExportOptions`.
///
/// # Errors
/// Returns a `VellumError::ExportFailed` if the operation is unsupported or if filesystem
/// permissions prevent saving the output.
#[tauri::command]
pub async fn export_png(_options: ExportOptions) -> Result<ExportResult, VellumError> {
    // TODO(story-6.2): implementar exportación PNG
    Err(VellumError::ExportFailed {
        reason: "PNG export not yet implemented".to_string(),
    })
}

/// Exports the current map rendering state to a scalable vector graphic (SVG).
///
/// **Future Implementation (Story 6.3):** /// Currently a stub. Will generate mathematical vector outputs representing the `CityData` geometry.
///
/// # Errors
/// Returns a `VellumError::ExportFailed` if the operation is unsupported or fails.
#[tauri::command]
pub async fn export_svg(_options: ExportOptions) -> Result<ExportResult, VellumError> {
    // TODO(story-6.3): implementar exportación SVG
    Err(VellumError::ExportFailed {
        reason: "SVG export not yet implemented".to_string(),
    })
}
