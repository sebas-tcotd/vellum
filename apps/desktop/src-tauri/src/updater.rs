use std::sync::{Mutex, OnceLock};
use tauri::Emitter;
use tauri_plugin_store::StoreExt;
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
/// `vellum://update-available` and optionally auto-installs it.
///
/// # Remarks
/// Best-effort and silent: network failures or the absence of a new release
/// never surface an error to the user — this is the only network operation
/// the app performs (NFR14). If the `autoUpdateEnabled` preference is set,
/// the update is downloaded, installed, and the app is restarted; a failure
/// in that path is logged but does not prevent the toast (emitted regardless)
/// from informing the user of the available version.
pub async fn check_for_updates(app: &tauri::AppHandle) {
    eprintln!("updater: check_for_updates started");
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => {
            eprintln!("updater: app.updater() failed: {error}");
            return;
        }
    };
    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            eprintln!("updater: check() ok, no update available");
            return;
        }
        Err(error) => {
            eprintln!("updater: check() failed: {error}");
            return;
        }
    };

    let payload = UpdatePayload {
        version: update.version.clone(),
        url: release_notes_url(&update.version),
    };
    if let Ok(mut pending) = pending_update().lock() {
        *pending = Some(payload.clone());
    }
    let _ = app.emit("vellum://update-available", payload);

    let auto_update_enabled = app
        .store("preferences.json")
        .ok()
        .and_then(|store| store.get("autoUpdateEnabled"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    if auto_update_enabled {
        if let Err(error) = update
            .download_and_install(|_chunk, _total| {}, || {})
            .await
        {
            eprintln!("updater: auto-install failed: {error}");
            return;
        }
        app.restart();
    }
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
