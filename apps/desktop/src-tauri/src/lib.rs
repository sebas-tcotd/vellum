// --- Strict Quality Enforcements ---
// Enforce safe error handling by forbidding panics in production code.
#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
// Enable pedantic lints for high-quality, idiomatic Rust code.
#![warn(clippy::pedantic)]

pub mod city_data;
pub mod commands;
pub mod errors;
/// Internal module containing auxiliary IPC payloads not intended for public re-export.
mod ipc_contract;

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
    if let Err(error) = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::parse_cslmap,
            commands::export_png,
            commands::export_svg,
        ])
        .run(tauri::generate_context!())
    {
        eprintln!("error while running tauri application: {error}");
        std::process::exit(1);
    }
}
