use crate::city_data::CityData;
use crate::errors::VellumError;
use crate::export::session::ExportSessionManager;
use crate::ipc_contract::{
    AppendAckResponse, BeginExport, ExportReceiptResponse, ExportSessionResponse,
};
use parser_cslmap::parser::parse_cslmap_file;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::ipc::InvokeBody;
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
    /// Explicit long-edge resolution for full-map exports.
    pub target_long_edge: Option<u32>,
    /// Background rendering behavior (e.g., `"white"`, `"dark"`, `"transparent"`).
    pub background: String,
    /// Desired base filename provided by the user (without extension).
    pub file_name: String,
}

/// PNG payload with the binary raster produced by the isolated WebGL surface.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPngOptions {
    /// Shared, validated export configuration.
    #[serde(flatten)]
    pub export: ExportOptions,
    /// Encoded PNG bytes. This is binary IPC data, never a base64 data URL.
    pub png_bytes: Vec<u8>,
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

/// Combines built-in and user theme files into a single ordered list.
///
/// **CRITICAL RULE:** Built-in entries MUST come before user entries — the TypeScript
/// `loadThemes()` loader (`packages/theme-engine/src/loader.ts`) relies on this order for
/// its "last id wins" override semantics: a user `.vellumstyle` with the same id as a
/// built-in one is expected to silently take precedence. Changing this order would flip
/// that precedence.
fn combine_theme_dirs(
    resource_themes_dir: &std::path::Path,
    user_dir: &std::path::Path,
) -> Vec<RawThemeFile> {
    let mut themes = read_theme_dir(resource_themes_dir, ThemeSource::BuiltIn);
    themes.extend(read_theme_dir(user_dir, ThemeSource::User));
    themes
}

/// Resolves the bundled themes directory under `resource_dir`.
///
/// **CRITICAL RULE:** In a packaged app, `resource_dir()` already points at the
/// platform resource root (e.g. macOS `Contents/Resources`), and `tauri.conf.json`'s
/// `bundle.resources` glob (`resources/themes/*`) is flattened into it — so the themes
/// live directly at `resource_dir/themes`. In an unbundled `cargo run`/`tauri dev`
/// session, Tauri copies resources into `target/debug/resources/` instead (preserving
/// the `resources/` prefix), while `resource_dir()` there resolves to `target/debug/`
/// itself — one directory short. Try the packaged layout first, fall back to the dev
/// layout so both `pnpm dev` and a real installed build find the same 5 built-in themes.
fn resolve_builtin_themes_dir(resource_dir: &std::path::Path) -> std::path::PathBuf {
    let packaged = resource_dir.join("themes");
    if packaged.is_dir() {
        return packaged;
    }
    let dev_fallback = resource_dir.join("resources").join("themes");
    if !dev_fallback.is_dir() {
        eprintln!(
            "[resolve_builtin_themes_dir] Neither {} nor {} exist — no built-in themes will load. \
             Corrupted install or unexpected resource layout.",
            packaged.display(),
            dev_fallback.display()
        );
    }
    dev_fallback
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
    let builtin_dir = resolve_builtin_themes_dir(&resource_dir);
    let user_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| VellumError::IoError {
            reason: format!("app_data_dir unavailable: {e}"),
        })?
        .join("themes");
    let _ = std::fs::create_dir_all(&user_dir); // best-effort; empty/missing is not fatal
    Ok(combine_theme_dirs(&builtin_dir, &user_dir))
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

fn validate_png_options(options: &ExportOptions) -> Result<(), VellumError> {
    let valid_format = matches!(options.format.as_str(), "png-1x" | "png-2x" | "png-4x");
    let valid_area = matches!(options.area.as_str(), "viewport" | "full-map");
    let valid_target = match options.area.as_str() {
        "viewport" => options.target_long_edge.is_none(),
        "full-map" => matches!(options.target_long_edge, Some(6000 | 12000 | 16000 | 20000)),
        _ => false,
    };
    let valid = valid_format
        && valid_area
        && valid_target
        && matches!(
            options.background.as_str(),
            "white" | "dark" | "transparent"
        );
    if valid && is_safe_export_name(&options.file_name) {
        Ok(())
    } else {
        Err(VellumError::ExportFailed {
            reason: "Invalid PNG export options".into(),
        })
    }
}

pub(crate) fn is_safe_export_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 160
        && !name.contains(['/', '\\', '\0'])
        && !name.ends_with('.')
        && !name.to_lowercase().ends_with(".png")
        && !name.to_lowercase().ends_with(".svg")
}

fn export_destination(
    app: &tauri::AppHandle,
    name: &str,
) -> Result<std::path::PathBuf, VellumError> {
    app.path()
        .download_dir()
        .map(|dir| dir.join(format!("{name}.png")))
        .map_err(|error| VellumError::IoError {
            reason: format!("download directory unavailable: {error}"),
        })
}

fn write_png_atomic(path: &std::path::Path, bytes: &[u8]) -> Result<(), VellumError> {
    let temporary = path.with_extension("png.part");
    std::fs::write(&temporary, bytes).map_err(|error| VellumError::IoError {
        reason: format!("PNG write failed: {error}"),
    })?;
    std::fs::rename(&temporary, path).map_err(|error| VellumError::IoError {
        reason: format!("PNG finalize failed: {error}"),
    })
}

fn persist_png(
    app: &tauri::AppHandle,
    options: &ExportPngOptions,
) -> Result<ExportResult, VellumError> {
    validate_png_options(&options.export)?;
    if options.png_bytes.is_empty() {
        return Err(VellumError::ExportFailed {
            reason: "Empty PNG payload".into(),
        });
    }
    let path = export_destination(app, &options.export.file_name)?;
    write_png_atomic(&path, &options.png_bytes)?;
    let folder = path.parent().ok_or_else(|| VellumError::IoError {
        reason: "PNG destination has no parent directory".into(),
    })?;
    Ok(ExportResult {
        file_path: path.to_string_lossy().into_owned(),
        folder_path: folder.to_string_lossy().into_owned(),
    })
}

/// Exports a rasterized PNG to the user's Downloads directory.
///
/// # Errors
/// Returns `VellumError::ExportFailed` for invalid PNG input and `IoError` for
/// directory resolution, writing, or finalization failures.
#[tauri::command]
pub async fn export_png(
    options: ExportPngOptions,
    app_handle: tauri::AppHandle,
) -> Result<ExportResult, VellumError> {
    tokio::task::spawn_blocking(move || persist_png(&app_handle, &options))
        .await
        .map_err(|error| VellumError::IoError {
            reason: format!("PNG task failed: {error}"),
        })?
}

/// Reveals an already-created export folder in the host operating system.
///
/// # Errors
/// Returns `VellumError::IoError` when the path is not a directory or the host
/// OS refuses to launch its file manager.
#[tauri::command]
pub async fn open_export_folder(folder_path: String) -> Result<(), VellumError> {
    tokio::task::spawn_blocking(move || reveal_folder(&folder_path))
        .await
        .map_err(|error| VellumError::IoError {
            reason: format!("Folder task failed: {error}"),
        })?
}

fn reveal_folder(folder_path: &str) -> Result<(), VellumError> {
    let path = std::path::Path::new(folder_path);
    if !path.is_dir() {
        return Err(VellumError::IoError {
            reason: "Export folder does not exist".into(),
        });
    }
    let mut command = folder_reveal_command(path);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| VellumError::IoError {
            reason: format!("Folder reveal failed: {error}"),
        })
}

#[cfg(target_os = "macos")]
fn folder_reveal_command(path: &std::path::Path) -> std::process::Command {
    let mut command = std::process::Command::new("open");
    command.arg(path);
    command
}

#[cfg(target_os = "windows")]
fn folder_reveal_command(path: &std::path::Path) -> std::process::Command {
    let mut command = std::process::Command::new("explorer");
    command.arg(path);
    command
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn folder_reveal_command(path: &std::path::Path) -> std::process::Command {
    let mut command = std::process::Command::new("xdg-open");
    command.arg(path);
    command
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

// ─── Tiled export session (story 6.2C) ────────────────────────────────────────
// Transactional boundary consumed by the tiled exporters landing in 6.2D–6.2F.
// Legacy `export_png` above is untouched and remains the only active/default
// route; this session cannot publish a real composited PNG until 6.2F wires a
// production `TileConsumer`.

/// Opens a transactional tiled-export session: validates the request, creates a
/// `.part` placeholder in the user's Downloads directory, and returns an opaque
/// session handle.
///
/// # Errors
/// - `VellumError::ExportFailed` — unsupported mode, invalid output dimensions,
///   or an unsafe file name.
/// - `VellumError::IoError` — Downloads cannot be resolved, or the `.part` file
///   cannot be created.
#[tauri::command]
pub async fn begin_export(
    metadata: BeginExport,
    state: tauri::State<'_, Arc<ExportSessionManager>>,
    app_handle: tauri::AppHandle,
) -> Result<ExportSessionResponse, VellumError> {
    let manager = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let downloads_dir = app_handle
            .path()
            .download_dir()
            .map_err(|e| VellumError::IoError {
                reason: format!("download directory unavailable: {e}"),
            })?;
        manager.begin(&metadata, &downloads_dir)
    })
    .await
    .map_err(|e| VellumError::IoError {
        reason: format!("export begin task failed: {e}"),
    })?
}

/// Accepts one raw binary export frame (see `export/framing.rs` for the wire
/// layout) and returns an acknowledgement once it is validated and recorded.
///
/// # Errors
/// Returns `VellumError::ExportFailed` for a non-raw body or any framing,
/// session, sequence, rectangle, or budget validation failure — see
/// `ExportSessionManager::append`.
#[tauri::command]
pub async fn append_export_chunk(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, Arc<ExportSessionManager>>,
) -> Result<AppendAckResponse, VellumError> {
    let bytes: Vec<u8> = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(_) => {
            return Err(VellumError::ExportFailed {
                reason: "append_export_chunk requires a raw binary body".to_string(),
            });
        }
    };
    let manager = state.inner().clone();
    tokio::task::spawn_blocking(move || manager.append(&bytes))
        .await
        .map_err(|e| VellumError::IoError {
            reason: format!("export append task failed: {e}"),
        })?
}

/// Confirms full tile coverage and atomically publishes the committed file.
///
/// # Errors
/// Returns a typed `VellumError` when the session is unknown or not active, the
/// consumer reports incomplete coverage, or the final rename fails.
#[tauri::command]
pub async fn finish_export(
    session_id: String,
    state: tauri::State<'_, Arc<ExportSessionManager>>,
) -> Result<ExportReceiptResponse, VellumError> {
    let manager = state.inner().clone();
    tokio::task::spawn_blocking(move || manager.finish(&session_id))
        .await
        .map_err(|e| VellumError::IoError {
            reason: format!("export finish task failed: {e}"),
        })?
}

/// Abandons a tiled-export session idempotently, removing its `.part` file if
/// one exists. Never removes an already-committed file.
///
/// # Errors
/// This command does not fail — it always returns `Ok(())`.
#[tauri::command]
pub async fn cancel_export(
    session_id: String,
    state: tauri::State<'_, Arc<ExportSessionManager>>,
) -> Result<(), VellumError> {
    let manager = state.inner().clone();
    tokio::task::spawn_blocking(move || manager.cancel(&session_id))
        .await
        .map_err(|e| VellumError::IoError {
            reason: format!("export cancel task failed: {e}"),
        })?
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::*;

    /// A temp dir unique per call (pid + nanosecond timestamp) — a fixed literal name
    /// would risk collisions if tests ever run concurrently across processes or if two
    /// tests reused the same label.
    fn unique_temp_dir(label: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock is before UNIX_EPOCH")
            .as_nanos();
        std::env::temp_dir().join(format!("vellum_{label}_{}_{nanos}", std::process::id()))
    }

    #[test]
    fn read_theme_dir_reads_all_vellumstyle_files_verbatim() {
        let dir = unique_temp_dir("themes_read_test");
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
        let dir = unique_temp_dir("nonexistent_theme_dir");
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

    #[test]
    fn combine_theme_dirs_lists_built_in_before_user() {
        let resource_dir = unique_temp_dir("combine_builtin");
        let user_dir = unique_temp_dir("combine_user");
        std::fs::create_dir_all(&resource_dir).unwrap();
        std::fs::create_dir_all(&user_dir).unwrap();
        std::fs::write(
            resource_dir.join("day.vellumstyle"),
            r#"{"schemaVersion":1,"name":"Day"}"#,
        )
        .unwrap();
        std::fs::write(
            user_dir.join("day.vellumstyle"),
            r#"{"schemaVersion":1,"name":"Custom Day"}"#,
        )
        .unwrap();

        let themes = combine_theme_dirs(&resource_dir, &user_dir);

        assert_eq!(themes.len(), 2, "both same-id files are returned verbatim");
        assert_eq!(
            themes[0].source,
            ThemeSource::BuiltIn,
            "built-in entries must be listed first — loadThemes()'s override semantics depend on it"
        );
        assert_eq!(themes[1].source, ThemeSource::User);

        std::fs::remove_dir_all(&resource_dir).unwrap();
        std::fs::remove_dir_all(&user_dir).unwrap();
    }

    #[test]
    fn png_options_reject_non_png_formats_and_unsafe_names() {
        let valid = ExportOptions {
            format: "png-4x".into(),
            area: "full-map".into(),
            target_long_edge: Some(6000),
            background: "transparent".into(),
            file_name: "Altavento".into(),
        };
        assert!(validate_png_options(&valid).is_ok());
        let invalid_format = ExportOptions {
            format: "svg".into(),
            ..valid
        };
        assert!(validate_png_options(&invalid_format).is_err());
        let invalid_name = ExportOptions {
            format: "png-1x".into(),
            file_name: "../../map.png".into(),
            area: "viewport".into(),
            target_long_edge: None,
            background: "white".into(),
        };
        assert!(validate_png_options(&invalid_name).is_err());
    }

    #[test]
    fn write_png_atomic_creates_the_final_file() {
        let dir = unique_temp_dir("png_write_test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("map.png");
        write_png_atomic(&path, &[137, 80, 78, 71]).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), vec![137, 80, 78, 71]);
        assert!(!path.with_extension("png.part").exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
