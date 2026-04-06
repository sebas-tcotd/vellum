use serde::{Deserialize, Serialize};

/// A strongly-typed error enumeration that crosses the Tauri IPC boundary.
///
/// **CRITICAL RULE (IPC Contract):** This enum is an exact mirror of the TypeScript 
/// discriminated union `VellumError` defined in `@vellum/core/ipc-contract.ts`. 
/// It strictly uses `#[serde(tag = "type")]` to ensure the variants serialize 
/// with a `PascalCase` type tag (e.g., `{"type": "InvalidFile", "reason": "..."}`), 
/// perfectly matching the TypeScript type discriminator. 
/// Never propagate unstructured `String` errors across the IPC boundary.
///
/// **CRITICAL UI INVARIANT:** The string fields within these variants (such as `reason` 
/// or `found`) are exclusively intended for internal backend logging, developer debugging, 
/// and telemetry. They must NEVER be displayed directly to the end-user. The React UI layer 
/// must switch on the `type` discriminant and map it to a localized `i18n` translation key.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum VellumError {
    /// Triggered when the selected file is structurally invalid, corrupted, or cannot be parsed.
    InvalidFile { reason: String },
    /// Triggered when the parsed `.cslmap` file schema version exceeds the capabilities of the current parser.
    UnsupportedVersion { found: String },
    /// Emitted when parsing succeeds overall but encounters non-fatal data anomalies that require reporting.
    PartialParse { warnings: Vec<String> },
    /// Triggered when a raster or vector map export operation fails (e.g., missing permissions, unsupported format).
    ExportFailed { reason: String },
    /// A wrapper for standard filesystem or I/O errors encountered during file access.
    IoError { reason: String },
}

/// Formats the error for backend terminal logging and developer debugging.
///
/// **Usage Note:** Output from this `Display` implementation is strictly for the Rust 
/// standard output or local log files. It must not be sent to the frontend for UI display.
impl std::fmt::Display for VellumError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VellumError::InvalidFile { reason } => write!(f, "Invalid file: {reason}"),
            VellumError::UnsupportedVersion { found } => {
                write!(f, "Unsupported version: {found}")
            }
            VellumError::PartialParse { warnings } => {
                write!(f, "Partial parse with {} warnings", warnings.len())
            }
            VellumError::ExportFailed { reason } => write!(f, "Export failed: {reason}"),
            VellumError::IoError { reason } => write!(f, "IO error: {reason}"),
        }
    }
}

/// Seamlessly converts standard Rust I/O errors into the IPC-compatible `VellumError` union.
impl From<std::io::Error> for VellumError {
    fn from(e: std::io::Error) -> Self {
        VellumError::IoError {
            reason: e.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vellum_error_serializes_pascalcase_type_tag() {
        // AC2: The "type" tag must be PascalCase to match the TypeScript discriminated union
        let err = VellumError::InvalidFile {
            reason: "bad file".to_string(),
        };
        let json = serde_json::to_value(&err).expect("serialization must not fail");
        assert_eq!(
            json["type"], "InvalidFile",
            "tag must be PascalCase, not camelCase"
        );
        assert_eq!(json["reason"], "bad file");
    }

    #[test]
    fn unsupported_version_serializes_correctly() {
        let err = VellumError::UnsupportedVersion {
            found: "0.5".to_string(),
        };
        let json = serde_json::to_value(&err).expect("serialization must not fail");
        assert_eq!(json["type"], "UnsupportedVersion");
        assert_eq!(json["found"], "0.5");
    }

    #[test]
    fn partial_parse_serializes_correctly() {
        let err = VellumError::PartialParse {
            warnings: vec!["w1".to_string(), "w2".to_string()],
        };
        let json = serde_json::to_value(&err).expect("serialization must not fail");
        assert_eq!(json["type"], "PartialParse");
        assert_eq!(json["warnings"][0], "w1");
    }

    #[test]
    fn io_error_from_std_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err = VellumError::from(io_err);
        let json = serde_json::to_value(&err).expect("serialization must not fail");
        assert_eq!(json["type"], "IoError");
        assert!(json["reason"].as_str().unwrap().contains("file not found"));
    }

    #[test]
    fn export_failed_serializes_correctly() {
        let err = VellumError::ExportFailed {
            reason: "no canvas".to_string(),
        };
        let json = serde_json::to_value(&err).expect("serialization must not fail");
        assert_eq!(json["type"], "ExportFailed");
    }

    #[test]
    fn display_impl_covers_all_variants() {
        let cases: Vec<VellumError> = vec![
            VellumError::InvalidFile {
                reason: "r".to_string(),
            },
            VellumError::UnsupportedVersion {
                found: "v".to_string(),
            },
            VellumError::PartialParse { warnings: vec![] },
            VellumError::ExportFailed {
                reason: "r".to_string(),
            },
            VellumError::IoError {
                reason: "r".to_string(),
            },
        ];
        for err in cases {
            let msg = format!("{err}");
            assert!(!msg.is_empty(), "Display must produce non-empty output");
        }
    }
}