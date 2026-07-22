use crate::city_data::CityData;
use crate::errors::VellumError;
use parser_cslmap::parser::parse_cslmap_file;
use serde::{Deserialize, Serialize};
use tauri::Manager;

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
/// Parses a `.cslmap` file and returns the complete immutable `CityData` domain model.
/// Runs the CPU-bound XML parsing on a blocking thread to avoid stalling the Tauri async runtime.
#[tauri::command]
pub async fn parse_cslmap(
    file_path: String,
    allow_partial: bool,
    app_handle: tauri::AppHandle,
) -> Result<CityData, VellumError> {
    tokio::task::spawn_blocking(move || parse_cslmap_file(&file_path, &app_handle, allow_partial))
        .await
        .map_err(|e| VellumError::IoError {
            reason: format!("Parser task failed: {e}"),
        })?
}

// ─── Theme loading ───────────────────────────────────────────────────────────

/// Origin of a `.vellumstyle` file.
///
/// **CRITICAL RULE:** Serializes via `kebab-case` to exactly `"built-in"` / `"user"`,
/// matching the `'built-in' | 'user'` literal union of `RawThemeFile['source']` in
/// `@vellum/core/ipc-contract.ts` — a plain `String` field here would let Rust produce
/// values the TypeScript side can't type-check against.
#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeSource {
    /// Bundled with the app under `resources/themes`.
    BuiltIn,
    /// Installed by the user under `{app_data_dir}/themes`.
    User,
}

/// A single `.vellumstyle` file read from disk, passed verbatim to the TS theme-engine.
///
/// **CRITICAL RULE:** Must remain synchronized with `RawThemeFile` in `ipc-contract.ts`.
/// Serializes to `camelCase`. Content is NOT validated here — that is the theme-engine's job.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawThemeFile {
    /// Stable identifier — the filename without the `.vellumstyle` extension.
    pub id: String,
    /// Origin of the file: bundled or user-installed.
    pub source: ThemeSource,
    /// The raw, unparsed JSON contents of the file.
    pub raw_json: String,
}

/// Reads a single `.vellumstyle` file into a `RawThemeFile`, or `None` if it should be skipped.
/// Non-`.vellumstyle` files, files without a valid stem, and unreadable/non-UTF-8 files are skipped.
fn read_theme_file(path: &std::path::Path, source: ThemeSource) -> Option<RawThemeFile> {
    if path.extension().and_then(|e| e.to_str()) != Some("vellumstyle") {
        return None;
    }
    let id = path.file_stem().and_then(|s| s.to_str())?.to_string();
    match std::fs::read_to_string(path) {
        Ok(raw_json) => Some(RawThemeFile {
            id,
            source,
            raw_json,
        }),
        Err(e) => {
            eprintln!("[load_themes] skipping {}: {e}", path.display());
            None
        }
    }
}

/// Reads every `.vellumstyle` file in `dir`, tagging each with `source`.
/// A missing or unreadable directory yields an empty list (never fatal).
fn read_theme_dir(dir: &std::path::Path, source: ThemeSource) -> Vec<RawThemeFile> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| read_theme_file(&entry.path(), source))
        .collect()
}

/// Synchronous body of `load_themes` — reads both theme directories from disk.
/// Run on a blocking thread via `spawn_blocking`; never call directly from async code.
fn load_themes_blocking(app_handle: &tauri::AppHandle) -> Result<Vec<RawThemeFile>, VellumError> {
    let resource_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| VellumError::IoError {
            reason: format!("resource_dir unavailable: {e}"),
        })?;
    let user_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| VellumError::IoError {
            reason: format!("app_data_dir unavailable: {e}"),
        })?
        .join("themes");
    let _ = std::fs::create_dir_all(&user_dir); // best-effort; empty/missing is not fatal
    let mut themes = read_theme_dir(&resource_dir.join("themes"), ThemeSource::BuiltIn);
    themes.extend(read_theme_dir(&user_dir, ThemeSource::User));
    Ok(themes)
}

/// Loads all bundled and user `.vellumstyle` files as raw JSON strings.
///
/// Reads two directories: the bundled `resources/themes` (5 built-in themes) and the
/// user's `{app_data_dir}/themes` (third-party themes, created if missing). Files are
/// returned verbatim — content validation happens in the TypeScript theme-engine.
/// Unreadable or non-UTF-8 files are skipped individually without aborting the load.
/// Runs the directory reads on a blocking thread (same pattern as `parse_cslmap`) to avoid
/// stalling the Tokio async runtime on filesystem I/O.
///
/// # Errors
/// - `VellumError::IoError` — if the resource or app-data base directory cannot be resolved.
#[tauri::command]
pub async fn load_themes(app_handle: tauri::AppHandle) -> Result<Vec<RawThemeFile>, VellumError> {
    tokio::task::spawn_blocking(move || load_themes_blocking(&app_handle))
        .await
        .map_err(|e| VellumError::IoError {
            reason: format!("Theme loading task failed: {e}"),
        })?
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

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn read_theme_dir_reads_all_vellumstyle_files_verbatim() {
        let dir = std::env::temp_dir().join("vellum_themes_read_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("day.vellumstyle"),
            r#"{"schemaVersion":1,"name":"Day"}"#,
        )
        .unwrap();
        std::fs::write(
            dir.join("transit.vellumstyle"),
            r#"{"schemaVersion":1,"name":"Transit"}"#,
        )
        .unwrap();
        // A "corrupt" (invalid JSON) but readable file is still returned — content
        // validation is the TypeScript theme-engine's job, not Rust's.
        std::fs::write(dir.join("broken.vellumstyle"), "{ not valid json").unwrap();
        std::fs::write(dir.join("ignore.txt"), "not a theme").unwrap();

        let mut themes = read_theme_dir(&dir, ThemeSource::BuiltIn);
        themes.sort_by(|a, b| a.id.cmp(&b.id));

        assert_eq!(
            themes.len(),
            3,
            "reads all 3 .vellumstyle files, ignores .txt"
        );
        assert_eq!(themes[0].id, "broken");
        assert_eq!(themes[0].source, ThemeSource::BuiltIn);
        assert!(themes.iter().any(|t| t.raw_json.contains("Day")));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_theme_dir_missing_dir_yields_empty() {
        let dir = std::env::temp_dir().join("vellum_nonexistent_theme_dir_xyz");
        assert!(read_theme_dir(&dir, ThemeSource::User).is_empty());
    }

    #[test]
    fn theme_source_serializes_kebab_case() {
        let built_in =
            serde_json::to_value(ThemeSource::BuiltIn).expect("serialization must not fail");
        assert_eq!(built_in, "built-in");
        let user = serde_json::to_value(ThemeSource::User).expect("serialization must not fail");
        assert_eq!(user, "user");
    }
}
