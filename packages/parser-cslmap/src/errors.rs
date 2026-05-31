use serde::{Deserialize, Serialize};

/// Mirror of `VellumError` in `src-tauri/src/errors.rs`.
/// Both enums must remain structurally identical so serde produces the same JSON.
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
    fn serializes_pascalcase_type_tag() {
        let err = VellumError::InvalidFile {
            reason: "bad file".to_string(),
        };
        let json = serde_json::to_value(&err).expect("serialization must not fail");
        assert_eq!(json["type"], "InvalidFile");
        assert_eq!(json["reason"], "bad file");
    }

    #[test]
    fn partial_parse_serializes_warnings() {
        let err = VellumError::PartialParse {
            warnings: vec!["w1".to_string()],
        };
        let json = serde_json::to_value(&err).expect("serialization must not fail");
        assert_eq!(json["type"], "PartialParse");
        assert_eq!(json["warnings"][0], "w1");
    }
}
