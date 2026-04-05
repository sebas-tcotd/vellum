// apps/desktop/src-tauri/src/errors.rs
use serde::{Deserialize, Serialize};

/// Error tipado que cruza el boundary IPC. Mirror del union discriminado TypeScript `VellumError`.
///
/// Serializa con `#[serde(tag = "type")]` en `PascalCase` para coincidir con el discriminante
/// TypeScript. Nunca propagar errores como `String` libre por el IPC.
/// El campo `reason` es para logs/debug — nunca mostrarlo directamente al usuario.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum VellumError {
    InvalidFile { reason: String },
    UnsupportedVersion { found: String },
    PartialParse { warnings: Vec<String> },
    ExportFailed { reason: String },
    IoError { reason: String },
}

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
        // AC2: el tag "type" debe ser PascalCase para coincidir con el discriminated union TypeScript
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
