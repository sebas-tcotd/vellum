// apps/desktop/src-tauri/src/commands.rs
use crate::city_data::CityData;
use crate::errors::VellumError;
use serde::{Deserialize, Serialize};

// ─── Export types (mirror de ExportOptions/ExportResult en ipc-contract.ts) ─

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub format: String,     // 'png-1x' | 'png-2x' | 'png-4x' | 'svg'
    pub area: String,       // 'viewport' | 'full-map'
    pub background: String, // 'white' | 'dark' | 'transparent'
    pub file_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub file_path: String,
    pub folder_path: String,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// Parsea un archivo .cslmap y retorna el modelo `CityData`.
/// Story 2.x implementará el parsing real — aquí es stub.
///
/// # Errors
/// Retorna un `VellumError` si el archivo no existe, no se puede leer,
/// o si el formato del archivo es inválido.
#[tauri::command]
pub async fn parse_cslmap(file_path: String) -> Result<CityData, VellumError> {
    // TODO(story-2.3): implementar parser real con quick-xml
    Err(VellumError::IoError {
        reason: format!("Parser not yet implemented. File: {file_path}"),
    })
}

/// Exporta el mapa actual como PNG en la resolución indicada.
/// Story 6.2 implementará la exportación real — aquí es stub.
/// 
/// # Errors
/// Retorna un `VellumError` si la exportación para PNG aún no ha sido implementada.
#[tauri::command]
pub async fn export_png(_options: ExportOptions) -> Result<ExportResult, VellumError> {
    // TODO(story-6.2): implementar exportación PNG
    Err(VellumError::ExportFailed {
        reason: "PNG export not yet implemented".to_string(),
    })
}

/// Exporta el mapa actual como SVG vectorial.
/// Story 6.3 implementará la exportación real — aquí es stub.
///
/// # Errors
/// Retorna un `VellumError` si la exportación para SVG aún no ha sido implementada.
#[tauri::command]
pub async fn export_svg(_options: ExportOptions) -> Result<ExportResult, VellumError> {
    // TODO(story-6.3): implementar exportación SVG
    Err(VellumError::ExportFailed {
        reason: "SVG export not yet implemented".to_string(),
    })
}
