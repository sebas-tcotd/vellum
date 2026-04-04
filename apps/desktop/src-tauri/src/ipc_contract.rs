// apps/desktop/src-tauri/src/ipc_contract.rs
// Módulo interno — structs auxiliares IPC que no son tipos de dominio
// Los eventos se emiten en Stories 2.x (parse progress) y 7.x (update checker)
#![allow(dead_code)]
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub current_step: String,
    pub percent: f32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePayload {
    pub version: String,
    pub url: String,
}
