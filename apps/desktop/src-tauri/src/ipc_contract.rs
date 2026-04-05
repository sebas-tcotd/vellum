// apps/desktop/src-tauri/src/ipc_contract.rs
// Módulo interno — structs auxiliares IPC que no son tipos de dominio
// Los eventos se emiten en Stories 2.x (parse progress) y 7.x (update checker)
#![allow(dead_code)]
use serde::Serialize;

/// Payload del evento `vellum://progress` emitido durante el parseo del archivo.
/// Mirror de `ProgressPayload` en `ipc-contract.ts`.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    /// Descripción del paso actual del parseo (para mostrar en la UI).
    pub current_step: String,
    /// Progreso de 0.0 a 100.0.
    pub percent: f32,
}

/// Payload del evento `vellum://update-available` emitido por el update checker.
/// Mirror de `UpdatePayload` en `ipc-contract.ts`.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePayload {
    /// Número de versión disponible (p.ej. `"1.2.0"`).
    pub version: String,
    /// URL de las release notes para mostrar al usuario.
    pub url: String,
}
