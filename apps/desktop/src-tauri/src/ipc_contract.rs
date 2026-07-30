// Internal module — Auxiliary IPC structs that are not core domain entities.
// Events will be emitted in Stories 2.x (parse progress) and 7.x (update checker).
#![allow(dead_code)]
use serde::{Deserialize, Serialize};

/// Payload structure for the `vellum://progress` event emitted during the file parsing phase.
///
/// **CRITICAL RULE (IPC Contract):** This struct is an exact mirror of the `ProgressPayload`
/// interface defined in `@vellum/core/ipc-contract.ts`. It serializes to `camelCase` JSON.
/// Any structural modification here MUST be symmetrically applied to the TypeScript
/// contract within the same commit.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    /// A localized or generic description of the current parsing operation.
    /// **UI Interaction:** The frontend uses this string to update the loading screen status.
    pub current_step: String,
    /// Normalized progress percentage, strictly bounded between 0.0 and 100.0.
    pub percent: f32,
}

/// Payload structure for the `vellum://update-available` event emitted by the background update checker.
///
/// **CRITICAL RULE (IPC Contract):** This struct is an exact mirror of the `UpdatePayload`
/// interface defined in `@vellum/core/ipc-contract.ts`. It serializes to `camelCase` JSON.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePayload {
    /// The semantic version string of the newly available release (e.g., `"1.2.0"`).
    pub version: String,
    /// The URL pointing to the release notes or the direct download page.
    pub url: String,
}

/// Payload structure for the `vellum://parse-warnings` event emitted when DLC or mod assets
/// are not recognized and rendered with a generic fallback representation.
///
/// **CRITICAL RULE (IPC Contract):** This struct is an exact mirror of the `ParseWarningsPayload`
/// interface defined in `@vellum/core/ipc-contract.ts`. It serializes to `camelCase` JSON.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ParseWarningsPayload {
    /// List of human-readable warning messages for each unrecognized asset.
    pub warnings: Vec<String>,
}

// ─── Tiled export session (mirrors ExportBeginMetadata/ExportSession/AppendAck/
// ExportReceipt in `@vellum/core/types/export-pipeline.ts`) ────────────────────

/// The subset of `ExportRequest` the Rust session actually needs: the base
/// filename used to name the committed file. Extra JSON fields (`area`,
/// `background`, `presentation`, ...) are ignored by serde's default behavior.
///
/// **CRITICAL RULE:** Must remain synchronized with `ExportRequest` in
/// `@vellum/core/types/export-pipeline.ts`. Deserializes from `camelCase`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginExportRequest {
    /// Base filename supplied by the caller, sanitized before use.
    pub file_name: String,
}

/// Inbound payload for `begin_export`.
///
/// **CRITICAL RULE:** Must remain synchronized with `ExportBeginMetadata` in
/// `@vellum/core/types/export-pipeline.ts`. Deserializes from `camelCase`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginExport {
    /// Route requested — only `"tiled-png"` is accepted by the Rust session manager.
    pub mode: String,
    /// Snapshot identifier associated with this operation (unused by 6.2C, kept
    /// for parity with the TypeScript contract).
    pub snapshot_id: String,
    /// Request fields the session needs — see [`BeginExportRequest`].
    pub request: BeginExportRequest,
    /// Exact output width in pixels.
    pub output_width: u32,
    /// Exact output height in pixels.
    pub output_height: u32,
    /// Number of chunks the caller promises to append (informational in 6.2C).
    pub expected_tiles: u32,
}

/// Outbound payload returned by `begin_export`.
///
/// **CRITICAL RULE:** Must remain synchronized with `ExportSession` in
/// `@vellum/core/types/export-pipeline.ts`. Serializes to `camelCase`.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportSessionResponse {
    /// Non-reusable operation identifier — 32 lowercase hex characters.
    pub session_id: String,
    /// Route accepted by this session — always `"tiled-png"`.
    pub mode: String,
    /// Maximum encoded bytes accepted in one chunk.
    pub max_chunk_bytes: u64,
    /// Maximum number of chunks allowed in flight — always `1`.
    pub max_in_flight: u8,
}

/// Outbound payload returned by `append_export_chunk`.
///
/// **CRITICAL RULE:** Must remain synchronized with `AppendAck` in
/// `@vellum/core/types/export-pipeline.ts`. Serializes to `camelCase`.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppendAckResponse {
    /// Session that accepted the chunk.
    pub session_id: String,
    /// Sequence accepted by the session.
    pub sequence: u64,
    /// Number of encoded bytes accepted.
    pub accepted_bytes: u64,
    /// Number of accepted output units — always `1` in 6.2C.
    pub completed_units: u32,
}

/// Outbound payload returned by `finish_export`.
///
/// **CRITICAL RULE:** Must remain synchronized with `ExportReceipt` in
/// `@vellum/core/types/export-pipeline.ts`. Serializes to `camelCase`.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportReceiptResponse {
    /// Absolute path to the published file.
    pub file_path: String,
    /// Absolute path to the containing folder.
    pub folder_path: String,
}
