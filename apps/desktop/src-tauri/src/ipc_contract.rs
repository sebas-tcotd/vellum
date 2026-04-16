// Internal module — Auxiliary IPC structs that are not core domain entities.
// Events will be emitted in Stories 2.x (parse progress) and 7.x (update checker).
#![allow(dead_code)]
use serde::Serialize;

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
