use tauri::Emitter;
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::UpdaterExt;

use crate::ipc_contract::UpdatePayload;

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
    let _ = app.emit("vellum://update-available", payload);

    let auto_update_enabled = app
        .store("preferences.json")
        .ok()
        .and_then(|store| store.get("autoUpdateEnabled"))
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    if auto_update_enabled {
        if let Err(error) = update.download_and_install(|_chunk, _total| {}, || {}).await {
            eprintln!("updater: auto-install failed: {error}");
            return;
        }
        app.restart();
    }
}

#[cfg(test)]
mod tests {
    use super::release_notes_url;

    #[test]
    fn release_notes_url_prefixes_version_with_v() {
        assert_eq!(
            release_notes_url("1.2.0"),
            "https://github.com/sebas-tcotd/vellum/releases/tag/v1.2.0"
        );
    }
}
