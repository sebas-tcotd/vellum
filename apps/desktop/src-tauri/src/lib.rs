#![deny(clippy::unwrap_used)]
#![deny(clippy::expect_used)]
#![warn(clippy::pedantic)]

pub mod commands;
pub mod errors;
pub mod city_data;
mod ipc_contract; // interno — tipos auxiliares IPC no re-exportados

/// Punto de entrada de la aplicación Tauri.
/// Registra los comandos IPC y arranca el event loop. Termina el proceso con código 1 si falla.
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
