// --- Strict Quality Enforcements ---
// Enforce safe error handling by forbidding panics in production code.
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
// Enable pedantic lints for high-quality, idiomatic Rust code.
#![warn(clippy::pedantic)]

pub mod city_data;
pub mod commands;
pub mod errors;
/// Transactional tiled-export session boundary (story 6.2C).
pub mod export;
/// Internal module containing auxiliary IPC payloads not intended for public re-export.
mod ipc_contract;
mod menu;
/// Captures a `.cslmap` path passed on the command line (Windows file
/// association double-click, Story 7.5 AC1).
pub mod startup;
/// Background update checker — Story 7.4. Desktop-only, same as the `tauri-plugin-updater`
/// dependency it wraps (there is no updater on mobile).
#[cfg(desktop)]
pub mod updater;

use export::session::{sweep_stale_temp_files, ExportSessionManager};
use std::sync::Arc;
use tauri::{Emitter, Manager};

/// Key in `preferences.json` that decides whether Vellum may open its one
/// network connection.
#[cfg(desktop)]
const AUTO_UPDATE_PREFERENCE_KEY: &str = "autoUpdateEnabled";

/// Reads the startup update-check preference from `preferences.json`.
///
/// # Remarks
/// Missing key, missing file or an unreadable store all mean `true`: a fresh
/// install checks for updates, which is what a new user expects and what every
/// release before this one did. Only an explicit `false` suppresses the check,
/// and it suppresses the *connection* — not just the toast (Story 1.8 AC4).
///
/// The builder mirrors the frontend's `load('preferences.json', { autoSave:
/// false })` exactly. `StoreBuilder::build` returns an already-registered
/// store as-is, so a mismatched `auto_save` here would silently win over the
/// options the frontend asks for later.
#[cfg(desktop)]
fn startup_update_check_enabled(app: &tauri::AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;

    let Ok(store) = app
        .store_builder("preferences.json")
        .disable_auto_save()
        .build()
    else {
        return true;
    };

    update_check_enabled_from(store.get(AUTO_UPDATE_PREFERENCE_KEY).as_ref())
}

/// Decides the startup check from whatever `preferences.json` held for the key.
///
/// # Remarks
/// Split out from the store plumbing so the policy — and only the policy — is
/// testable: absent, null or a non-boolean all mean `true`, so a hand-edited
/// or half-migrated preferences file can never silently suppress the check.
#[cfg(desktop)]
fn update_check_enabled_from(stored: Option<&serde_json::Value>) -> bool {
    stored.and_then(serde_json::Value::as_bool).unwrap_or(true)
}

/// The main entry point for the Vellum desktop application backend.
///
/// This function initializes the Tauri builder, registers all available IPC
/// command handlers, and starts the native event loop.
///
/// # Lifecycle and Error Handling
/// If the Tauri runtime fails to initialize or encounters a fatal error during
/// execution, this function will log the error to `stderr` and terminate
/// the process with an exit code of `1`.
///
/// # Platform Specifics
/// The `#[cfg_attr(mobile, ...)]` attribute ensures compatibility should the
/// project expand to mobile platforms in the future.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .manage(Arc::new(ExportSessionManager::new()))
        .manage(menu::NativeMenuVisibility::default())
        .invoke_handler(tauri::generate_handler![
            commands::parse_cslmap,
            commands::export_png,
            commands::open_export_folder,
            commands::load_themes,
            commands::begin_export,
            commands::append_export_chunk,
            commands::finish_export,
            commands::cancel_export,
            menu::update_theme_menu,
            menu::update_menu_language,
            menu::toggle_native_menu,
            #[cfg(desktop)]
            updater::get_pending_update,
            #[cfg(desktop)]
            updater::install_update,
            startup::get_startup_file_path,
        ])
        .setup(|app| {
            // Startup sweep: a crashed previous run may have left a `.part` temp
            // file behind. Restricted to the exact Vellum prefix/suffix — see
            // `sweep_stale_temp_files`.
            if let Ok(downloads_dir) = app.path().download_dir() {
                sweep_stale_temp_files(&downloads_dir);
            }

            // A `.cslmap` opened via the Windows file association arrives as a
            // command-line argument, before any window/listener exists — stash
            // it for the frontend to claim once it's ready (Story 7.5 AC1).
            startup::capture_startup_file_path();

            let menu = menu::build_menu(app.handle())?;
            app.set_menu(menu)?;
            app.hide_menu()?;

            app.on_menu_event(move |app_handle, event| {
                let id = event.id().0.as_str();
                if id == "preferences" {
                    let _ = app_handle.emit("vellum://open-preferences", ());
                } else if id == menu::MENU_ID_ABOUT {
                    let _ = app_handle.emit("vellum://open-about", ());
                } else if id == menu::MENU_ID_EXIT {
                    app_handle.exit(0);
                } else if id.starts_with("menu.") {
                    let _ = app_handle.emit(menu::MENU_ACTION_EVENT, id);
                }
            });

            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;

                // The preference is read here, before the spawn, rather than
                // inside the toast handler: "optional update check" has to
                // mean no socket is opened, not a silent check whose result is
                // discarded (Story 1.8 AC4).
                if startup_update_check_enabled(app.handle()) {
                    tauri::async_runtime::spawn({
                        let app_handle = app.handle().clone();
                        async move {
                            updater::check_for_updates(&app_handle).await;
                        }
                    });
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.state::<Arc<ExportSessionManager>>().cleanup_all();
                // Vellum currently owns one application window. Route every
                // native close request through the same process-level exit
                // path as File > Exit so X, Cmd+W/Alt+F4, and native Close
                // cannot leave a hidden or half-closed process behind.
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!());

    match app {
        Ok(app) => app.run(|app_handle, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                app_handle
                    .state::<Arc<ExportSessionManager>>()
                    .cleanup_all();
            }
        }),
        Err(error) => {
            eprintln!("error while running tauri application: {error}");
            std::process::exit(1);
        }
    }
}

#[cfg(all(test, desktop))]
mod tests {
    use super::update_check_enabled_from;
    use serde_json::json;

    #[test]
    fn missing_key_checks_for_updates() {
        assert!(update_check_enabled_from(None));
    }

    #[test]
    fn explicit_false_suppresses_the_connection() {
        assert!(!update_check_enabled_from(Some(&json!(false))));
    }

    #[test]
    fn explicit_true_checks_for_updates() {
        assert!(update_check_enabled_from(Some(&json!(true))));
    }

    #[test]
    fn a_non_boolean_value_never_suppresses_silently() {
        for value in [json!(null), json!("false"), json!(0)] {
            assert!(update_check_enabled_from(Some(&value)));
        }
    }
}
