//! `SvgWriter` — the streaming-svg counterpart to `TileComposer`.
//!
//! Appends UTF-8 XML fragments to the session's `.part` file as they arrive and
//! never holds the assembled document in memory. Publication stays the
//! session's job (AD-8: only `finish` renames), so this type's single
//! transactional responsibility is refusing to confirm a document that is not
//! a complete, non-empty SVG.
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;

use super::session::{AcceptedTile, TileConsumer};
use crate::errors::VellumError;

/// Closing tag every complete document must end with.
const CLOSING_TAG: &str = "</svg>";
/// Bytes of trailing context retained to check the document terminates cleanly.
const TAIL_BYTES: usize = CLOSING_TAG.len();

/// Streams SVG text chunks into a `.part` file and confirms completeness.
pub struct SvgWriter {
    writer: BufWriter<File>,
    accepted_chunks: u64,
    tail: Vec<u8>,
    /// Trailing bytes of an incomplete multi-byte character, carried into the
    /// next chunk so encoding is validated across the whole document rather
    /// than per fragment.
    utf8_carry: Vec<u8>,
}

fn writer_error(reason: &str) -> VellumError {
    VellumError::ExportFailed {
        reason: format!("svg export writer: {reason}"),
    }
}

impl SvgWriter {
    /// Opens the `.part` file the session already created for this operation.
    ///
    /// # Errors
    /// Returns `VellumError::IoError` when the temp file cannot be opened for
    /// writing.
    pub fn create(part_path: &Path) -> Result<Self, VellumError> {
        let file = File::create(part_path).map_err(|e| VellumError::IoError {
            reason: format!("failed to open svg export temp file: {e}"),
        })?;
        Ok(Self {
            writer: BufWriter::new(file),
            accepted_chunks: 0,
            tail: Vec::with_capacity(TAIL_BYTES),
            utf8_carry: Vec::new(),
        })
    }

    /// Validates the stream is UTF-8, tolerating a character split across a
    /// chunk boundary.
    ///
    /// # Errors
    /// Returns `VellumError::ExportFailed` on a genuine encoding error.
    fn validate_utf8(&mut self, payload: &[u8]) -> Result<(), VellumError> {
        // Every chunk is checked, not just the first: a serializer bug or a
        // corrupted transfer later in the document would otherwise reach the
        // atomic rename. Bytes that merely *end* mid-character are carried
        // forward instead of rejected.
        let mut buffer = std::mem::take(&mut self.utf8_carry);
        buffer.extend_from_slice(payload);
        match std::str::from_utf8(&buffer) {
            Ok(_) => Ok(()),
            Err(error) if error.error_len().is_none() => {
                self.utf8_carry = buffer[error.valid_up_to()..].to_vec();
                Ok(())
            }
            Err(_) => Err(writer_error("chunk is not valid UTF-8")),
        }
    }

    /// Keeps only the last [`TAIL_BYTES`] seen, so completeness is checkable
    /// without ever buffering the document.
    fn remember_tail(&mut self, payload: &[u8]) {
        let take = payload.len().min(TAIL_BYTES);
        self.tail
            .extend_from_slice(&payload[payload.len() - take..]);
        if self.tail.len() > TAIL_BYTES {
            let excess = self.tail.len() - TAIL_BYTES;
            self.tail.drain(0..excess);
        }
    }
}

impl TileConsumer for SvgWriter {
    /// Validates the fragment is UTF-8 and appends it verbatim.
    ///
    /// # Errors
    /// Returns `VellumError::ExportFailed` for a non-UTF-8 payload and
    /// `VellumError::IoError` when the write fails.
    fn accept(&mut self, _tile: &AcceptedTile, payload: &[u8]) -> Result<(), VellumError> {
        self.validate_utf8(payload)?;
        self.writer
            .write_all(payload)
            .map_err(|e| VellumError::IoError {
                reason: format!("svg export write failed: {e}"),
            })?;
        self.remember_tail(payload);
        self.accepted_chunks += 1;
        Ok(())
    }

    /// Flushes and confirms the document terminates with a closing `</svg>`.
    ///
    /// # Errors
    /// Returns `VellumError::ExportFailed` when no chunk was accepted or the
    /// document is truncated, and `VellumError::IoError` when the flush fails.
    fn finish(&mut self) -> Result<(), VellumError> {
        if self.accepted_chunks == 0 {
            return Err(writer_error("no chunk was appended"));
        }
        if !self.utf8_carry.is_empty() {
            return Err(writer_error("document ends mid-character"));
        }
        self.writer.flush().map_err(|e| VellumError::IoError {
            reason: format!("svg export flush failed: {e}"),
        })?;
        if self.tail != CLOSING_TAG.as_bytes() {
            // Truncation is the failure mode a streaming writer actually has —
            // the serializer never emits free-form markup, and every embedded
            // string is escaped before it leaves TypeScript.
            return Err(writer_error("document does not end with a closing svg tag"));
        }
        Ok(())
    }
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_part(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is before UNIX_EPOCH")
            .as_nanos();
        std::env::temp_dir().join(format!(
            ".vellum-svg-writer-{label}-{}-{nanos}.part",
            std::process::id()
        ))
    }

    fn zero_tile() -> AcceptedTile {
        AcceptedTile {
            tile_x: 0,
            tile_y: 0,
            useful_rect: super::super::framing::PixelRectRaw {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
            },
            render_rect: super::super::framing::PixelRectRaw {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
            },
            encoded_len: 0,
        }
    }

    #[test]
    fn writes_chunks_in_order_and_confirms_a_complete_document() {
        let path = temp_part("complete");
        let mut writer = SvgWriter::create(&path).unwrap();
        writer.accept(&zero_tile(), b"<svg><g>").unwrap();
        writer.accept(&zero_tile(), b"</g></svg>").unwrap();
        writer.finish().unwrap();

        let written = std::fs::read_to_string(&path).unwrap();
        assert_eq!(written, "<svg><g></g></svg>");
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn finish_rejects_a_truncated_document() {
        let path = temp_part("truncated");
        let mut writer = SvgWriter::create(&path).unwrap();
        writer.accept(&zero_tile(), b"<svg><g>").unwrap();
        assert!(writer.finish().is_err());
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn finish_rejects_a_document_with_no_chunks() {
        let path = temp_part("empty");
        let mut writer = SvgWriter::create(&path).unwrap();
        assert!(writer.finish().is_err());
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn accepts_a_multi_byte_character_split_across_two_chunks() {
        let path = temp_part("split-utf8");
        let mut writer = SvgWriter::create(&path).unwrap();
        // "ñ" is 0xC3 0xB1 — the split lands between its two bytes.
        writer.accept(&zero_tile(), b"<svg id=\"\xc3").unwrap();
        writer.accept(&zero_tile(), b"\xb1\"></svg>").unwrap();
        writer.finish().unwrap();
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "<svg id=\"ñ\"></svg>"
        );
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn rejects_invalid_utf8_in_a_later_chunk() {
        let path = temp_part("late-bad-utf8");
        let mut writer = SvgWriter::create(&path).unwrap();
        writer.accept(&zero_tile(), b"<svg>").unwrap();
        // 0xFF can never begin a UTF-8 sequence.
        assert!(writer.accept(&zero_tile(), b"\xff\xfe").is_err());
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn finish_rejects_a_document_ending_mid_character() {
        let path = temp_part("truncated-utf8");
        let mut writer = SvgWriter::create(&path).unwrap();
        writer.accept(&zero_tile(), b"<svg></svg>\xc3").unwrap();
        assert!(writer.finish().is_err());
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn tail_tracking_survives_chunks_shorter_than_the_closing_tag() {
        let path = temp_part("short-chunks");
        let mut writer = SvgWriter::create(&path).unwrap();
        for byte in b"<svg></svg>" {
            writer.accept(&zero_tile(), &[*byte]).unwrap();
        }
        writer.finish().unwrap();
        std::fs::remove_file(&path).unwrap();
    }
}
