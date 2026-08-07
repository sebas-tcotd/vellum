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

use export::session::{sweep_stale_temp_files, ExportSessionManager};
use std::sync::Arc;
#[cfg(not(target_os = "macos"))]
use tauri::menu::SubmenuBuilder;
use tauri::menu::{MenuItemBuilder, MenuItemKind};
use tauri::{Emitter, Manager};

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
        .manage(Arc::new(ExportSessionManager::new()))
        .invoke_handler(tauri::generate_handler![
            commands::parse_cslmap,
            commands::export_png,
            commands::open_export_folder,
            commands::load_themes,
            commands::begin_export,
            commands::append_export_chunk,
            commands::finish_export,
            commands::cancel_export,
        ])
        .setup(|app| {
            // Startup sweep: a crashed previous run may have left a `.part` temp
            // file behind. Restricted to the exact Vellum prefix/suffix — see
            // `sweep_stale_temp_files`.
            if let Ok(downloads_dir) = app.path().download_dir() {
                sweep_stale_temp_files(&downloads_dir);
            }

            // Menu::default() preserves the platform-standard submenus (Edit,
            // Window, and on macOS the app submenu) — building from scratch
            // would drop Edit and break copy/paste in text inputs.
            let menu = tauri::menu::Menu::default(app.handle())?;
            let preferences_item = MenuItemBuilder::with_id("preferences", "Preferences...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;
            #[cfg(target_os = "macos")]
            if let Some(MenuItemKind::Submenu(app_submenu)) = menu
                .items()?
                .into_iter()
                .find(|item| matches!(item, MenuItemKind::Submenu(_)))
            {
                app_submenu.insert(&preferences_item, 1)?;
            }
            #[cfg(not(target_os = "macos"))]
            {
                let preferences_menu = SubmenuBuilder::new(app, "Vellum")
                    .item(&preferences_item)
                    .build()?;
                menu.prepend(&preferences_menu)?;
            }
            app.set_menu(menu)?;

            app.on_menu_event(move |app_handle, event| {
                if event.id().0.as_str() == "preferences" {
                    let _ = app_handle.emit("vellum://open-preferences", ());
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.state::<Arc<ExportSessionManager>>().cleanup_all();
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
