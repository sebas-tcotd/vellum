// apps/desktop/src-tauri/src/errors.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum VellumError {
    InvalidFile {
        reason: String,
    },
    UnsupportedVersion {
        found: String,
    },
    PartialParse {
        warnings: Vec<String>,
    },
    ExportFailed {
        reason: String,
    },
    IoError {
        reason: String,
    },
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
