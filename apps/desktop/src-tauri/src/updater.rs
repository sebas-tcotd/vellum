use std::sync::{Mutex, OnceLock};
use tauri::Emitter;
use tauri_plugin_updater::UpdaterExt;

use crate::ipc_contract::UpdatePayload;

static PENDING_UPDATE: OnceLock<Mutex<Option<UpdatePayload>>> = OnceLock::new();

fn pending_update() -> &'static Mutex<Option<UpdatePayload>> {
    PENDING_UPDATE.get_or_init(|| Mutex::new(None))
}

/// Returns and clears an update notification that arrived before the UI listener mounted.
///
/// # Remarks
/// Mutates the process-wide pending-update slot: the first caller after an update was
/// detected consumes it, so subsequent calls return `None` until another check finds a
/// new version.
///
/// # Errors
/// Never fails — returns `Option`, not `Result`, because there is no failure mode to
/// report to the frontend (an unavailable pending update and a poisoned lock both
/// collapse to `None`).
#[must_use]
#[tauri::command]
pub fn get_pending_update() -> Option<UpdatePayload> {
    pending_update().lock().ok()?.take()
}

/// Builds the GitHub Release notes URL for a given app version.
///
/// # Remarks
/// `tauri-plugin-updater`'s `Update` struct exposes `download_url` (the binary
/// artifact) but no release-notes URL — the page is built manually from the
/// GitHub Release tag convention (`v[0-9]*`, see `.github/workflows/publish-release.yml`).
/// `version` is plain semver (e.g. `"1.2.0"`) and must be prefixed with `v`.
fn release_notes_url(version: &str) -> String {
    format!("https://github.com/sebas-tcotd/vellum/releases/tag/v{version}")
}

/// Checks for a new Vellum release in the background and, if found, emits
/// `vellum://update-available`.
///
/// # Remarks
/// Best-effort, silent and read-only: network failures or the absence of a new
/// release never surface an error to the user — this is the only network
/// operation the app performs (NFR14). It deliberately never installs anything:
/// the download/restart is always an explicit user action via
/// [`install_update`], so an update can never discard an open map without
/// consent.
pub async fn check_for_updates(app: &tauri::AppHandle) {
    let Ok(updater) = app.updater() else {
        return;
    };
    let Ok(Some(update)) = updater.check().await else {
        return;
    };

    let payload = UpdatePayload {
        version: update.version.clone(),
        url: release_notes_url(&update.version),
    };
    if let Ok(mut pending) = pending_update().lock() {
        *pending = Some(payload.clone());
    }
    let _ = app.emit("vellum://update-available", payload);
}

/// Downloads and installs the pending update, then restarts the app.
///
/// # Remarks
/// Re-runs `check()` instead of holding the `Update` handle from
/// `check_for_updates` in a static — an extra HTTP round trip on an explicit
/// click, in exchange for no cross-thread global state.
/// ponytail: re-check on click; cache the handle only if the round trip is ever felt.
///
/// On success this never returns — `restart()` tears the process down. Because
/// it runs off the main thread, the exit travels through `RunEvent::Exit`, so
/// the export-session cleanup registered in `run()` still runs.
///
/// # Errors
/// Returns a human-readable message if the updater is unavailable, no update is
/// offered any more, or the download/install fails (e.g. a Windows MSI install
/// declined at the UAC prompt) — the frontend surfaces it on the update toast
/// instead of failing silently.
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|error| error.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No update is available any more.".to_string())?;

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|error| error.to_string())?;

    app.restart();
}

#[cfg(test)]
mod tests {
    use super::{get_pending_update, pending_update, release_notes_url};
    use crate::ipc_contract::UpdatePayload;

    #[test]
    fn release_notes_url_prefixes_version_with_v() {
        assert_eq!(
            release_notes_url("1.2.0"),
            "https://github.com/sebas-tcotd/vellum/releases/tag/v1.2.0"
        );
    }

    /// Single test covering the full pending-update lifecycle — `PENDING_UPDATE` is a
    /// process-wide static, so a second test touching it in parallel would race.
    #[test]
    fn get_pending_update_returns_and_clears_the_stored_payload() {
        assert_eq!(get_pending_update(), None, "starts empty");

        let payload = UpdatePayload {
            version: "1.2.0".to_string(),
            url: "https://example.com/v1.2.0".to_string(),
        };
        if let Ok(mut pending) = pending_update().lock() {
            *pending = Some(payload.clone());
        }

        assert_eq!(get_pending_update(), Some(payload), "first read returns it");
        assert_eq!(get_pending_update(), None, "second read finds it cleared");
    }
}
