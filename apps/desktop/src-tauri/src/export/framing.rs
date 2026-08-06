//! Parses the fixed 76-byte v1 wire frame produced by `export-frame.ts`.
//!
//! Reads every field by explicit offset — never by transmute or struct padding —
//! so the layout stays independent of platform alignment.
use crate::errors::VellumError;

/// ASCII magic identifying a Vellum tiled-export wire frame.
pub const MAGIC: [u8; 4] = *b"VEXP";
/// Wire format version encoded in every frame header.
pub const VERSION: u16 = 1;
/// `kind` value for a PNG tile chunk.
pub const KIND_PNG_TILE: u8 = 1;
/// `kind` value for a UTF-8 SVG text chunk.
///
/// SVG chunks reuse the same fixed 76-byte header rather than introducing a
/// second wire layout (AD-9: one versioned binary transport). The tile and
/// rectangle fields describe raster geometry that a text fragment does not
/// have, so they are *required to be zero* and rejected otherwise — a frame
/// can never carry raster geometry the SVG writer would silently ignore.
pub const KIND_SVG_CHUNK: u8 = 2;
/// Fixed size in bytes of the v1 header, before the encoded PNG payload.
pub const HEADER_BYTES: usize = 76;
/// Size in bytes of the binary session id embedded in the header.
pub const SESSION_ID_BYTES: usize = 16;

/// A rectangle expressed in output pixels, as read from the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PixelRectRaw {
    /// Horizontal pixel origin.
    pub x: u32,
    /// Vertical pixel origin.
    pub y: u32,
    /// Rectangle width in pixels.
    pub width: u32,
    /// Rectangle height in pixels.
    pub height: u32,
}

/// Fields decoded from one wire frame header, before session/sequence validation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrameHeader {
    /// Payload discriminator — [`KIND_PNG_TILE`] or [`KIND_SVG_CHUNK`].
    pub kind: u8,
    /// Raw 16-byte session token embedded in the frame.
    pub session_id: [u8; SESSION_ID_BYTES],
    /// Strictly increasing chunk sequence.
    pub sequence: u64,
    /// Tile column.
    pub tile_x: u32,
    /// Tile row.
    pub tile_y: u32,
    /// Useful output rectangle covered by the encoded bytes.
    pub useful_rect: PixelRectRaw,
    /// Render rectangle represented by the encoded bytes.
    pub render_rect: PixelRectRaw,
}

fn framing_error(reason: &str) -> VellumError {
    VellumError::ExportFailed {
        reason: format!("export frame: {reason}"),
    }
}

fn read_u16_le(bytes: &[u8]) -> u16 {
    u16::from_le_bytes([bytes[0], bytes[1]])
}

fn read_u32_le(bytes: &[u8]) -> u32 {
    u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

fn read_u64_le(bytes: &[u8]) -> u64 {
    u64::from_le_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ])
}

/// Rejects an SVG chunk that carries raster tile/rectangle geometry.
///
/// # Errors
/// Returns `VellumError::ExportFailed` when any raster field is non-zero.
fn reject_raster_geometry(
    tile_x: u32,
    tile_y: u32,
    useful_rect: &PixelRectRaw,
    render_rect: &PixelRectRaw,
) -> Result<(), VellumError> {
    let zeroed = PixelRectRaw {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    };
    if tile_x != 0 || tile_y != 0 || *useful_rect != zeroed || *render_rect != zeroed {
        return Err(framing_error(
            "svg chunk must zero every tile and rectangle field",
        ));
    }
    Ok(())
}

fn read_rect_le(bytes: &[u8]) -> PixelRectRaw {
    PixelRectRaw {
        x: read_u32_le(&bytes[0..4]),
        y: read_u32_le(&bytes[4..8]),
        width: read_u32_le(&bytes[8..12]),
        height: read_u32_le(&bytes[12..16]),
    }
}

/// Parses and structurally validates one wire frame, returning the header and a
/// borrowed slice over the encoded PNG payload.
///
/// # Errors
/// Returns `VellumError::ExportFailed` when the frame is truncated, carries
/// trailing bytes past its declared length, or fails magic/version/kind/reserved
/// validation. Rust is the security authority for this check — the TypeScript
/// encoder's own validation is anticipatory only.
pub fn parse_frame(bytes: &[u8]) -> Result<(FrameHeader, &[u8]), VellumError> {
    if bytes.len() < HEADER_BYTES {
        return Err(framing_error("truncated before the fixed header"));
    }
    if bytes[0..4] != MAGIC {
        return Err(framing_error("magic mismatch"));
    }
    let version = read_u16_le(&bytes[4..6]);
    if version != VERSION {
        return Err(framing_error("unsupported version"));
    }
    let kind = bytes[6];
    if kind != KIND_PNG_TILE && kind != KIND_SVG_CHUNK {
        return Err(framing_error("unsupported kind"));
    }
    let reserved = bytes[7];
    if reserved != 0 {
        return Err(framing_error("reserved byte must be zero"));
    }

    let mut session_id = [0u8; SESSION_ID_BYTES];
    session_id.copy_from_slice(&bytes[8..8 + SESSION_ID_BYTES]);
    let sequence = read_u64_le(&bytes[24..32]);
    let tile_x = read_u32_le(&bytes[32..36]);
    let tile_y = read_u32_le(&bytes[36..40]);
    let useful_rect = read_rect_le(&bytes[40..56]);
    let render_rect = read_rect_le(&bytes[56..72]);
    let encoded_length = read_u32_le(&bytes[72..76]);

    if encoded_length == 0 {
        return Err(framing_error("encoded payload must not be empty"));
    }
    if kind == KIND_SVG_CHUNK {
        reject_raster_geometry(tile_x, tile_y, &useful_rect, &render_rect)?;
    }
    let expected_total = (HEADER_BYTES as u64)
        .checked_add(u64::from(encoded_length))
        .ok_or_else(|| framing_error("declared length overflows"))?;
    let actual_total = bytes.len() as u64;
    if actual_total < expected_total {
        return Err(framing_error("truncated after the header"));
    }
    if actual_total > expected_total {
        return Err(framing_error("trailing bytes past declared length"));
    }

    Ok((
        FrameHeader {
            kind,
            session_id,
            sequence,
            tile_x,
            tile_y,
            useful_rect,
            render_rect,
        },
        &bytes[HEADER_BYTES..],
    ))
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::*;

    /// Hand-derived from the same offset table as the TS fixture in
    /// `export-frame.test.ts` — this is the cross-language layout contract, built
    /// independently on both sides rather than generated from one another.
    fn fixed_vector() -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"VEXP");
        bytes.extend_from_slice(&1u16.to_le_bytes()); // version
        bytes.push(1); // kind
        bytes.push(0); // reserved
        bytes.extend_from_slice(&[
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
            0x0f, 0x10,
        ]); // sessionId
        bytes.extend_from_slice(&5u64.to_le_bytes()); // sequence
        bytes.extend_from_slice(&2u32.to_le_bytes()); // tileX
        bytes.extend_from_slice(&3u32.to_le_bytes()); // tileY
        bytes.extend_from_slice(&0u32.to_le_bytes()); // usefulRect.x
        bytes.extend_from_slice(&0u32.to_le_bytes()); // usefulRect.y
        bytes.extend_from_slice(&100u32.to_le_bytes()); // usefulRect.width
        bytes.extend_from_slice(&50u32.to_le_bytes()); // usefulRect.height
        bytes.extend_from_slice(&0u32.to_le_bytes()); // renderRect.x
        bytes.extend_from_slice(&0u32.to_le_bytes()); // renderRect.y
        bytes.extend_from_slice(&110u32.to_le_bytes()); // renderRect.width
        bytes.extend_from_slice(&60u32.to_le_bytes()); // renderRect.height
        bytes.extend_from_slice(&3u32.to_le_bytes()); // encodedLength
        bytes.extend_from_slice(&[0xaa, 0xbb, 0xcc]); // payload
        assert_eq!(bytes.len(), HEADER_BYTES + 3);
        bytes
    }

    #[test]
    fn parses_the_fixed_vector_shared_with_the_typescript_encoder() {
        let bytes = fixed_vector();
        let (header, payload) = parse_frame(&bytes).expect("valid frame must parse");
        assert_eq!(
            header.session_id,
            [
                0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
                0x0f, 0x10
            ]
        );
        assert_eq!(header.sequence, 5);
        assert_eq!(header.tile_x, 2);
        assert_eq!(header.tile_y, 3);
        assert_eq!(
            header.useful_rect,
            PixelRectRaw {
                x: 0,
                y: 0,
                width: 100,
                height: 50
            }
        );
        assert_eq!(
            header.render_rect,
            PixelRectRaw {
                x: 0,
                y: 0,
                width: 110,
                height: 60
            }
        );
        assert_eq!(payload, &[0xaa, 0xbb, 0xcc]);
    }

    #[test]
    fn rejects_truncated_frame() {
        let bytes = fixed_vector();
        assert!(parse_frame(&bytes[..HEADER_BYTES - 1]).is_err());
        assert!(parse_frame(&bytes[..10]).is_err());
    }

    #[test]
    fn rejects_trailing_bytes() {
        let mut bytes = fixed_vector();
        bytes.push(0xff);
        let err = parse_frame(&bytes).unwrap_err();
        match err {
            VellumError::ExportFailed { reason } => assert!(reason.contains("trailing")),
            other => panic!("expected ExportFailed, got {other:?}"),
        }
    }

    #[test]
    fn rejects_bad_magic() {
        let mut bytes = fixed_vector();
        bytes[0] = 0;
        assert!(parse_frame(&bytes).is_err());
    }

    #[test]
    fn rejects_bad_version() {
        let mut bytes = fixed_vector();
        bytes[4] = 2;
        assert!(parse_frame(&bytes).is_err());
    }

    #[test]
    fn rejects_bad_kind() {
        let mut bytes = fixed_vector();
        bytes[6] = 3;
        assert!(parse_frame(&bytes).is_err());
    }

    /// Same offset table as the PNG vector, kind 2, with every raster field
    /// zeroed — the layout contract for a streaming-svg chunk.
    fn svg_vector(payload: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"VEXP");
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.push(KIND_SVG_CHUNK);
        bytes.push(0);
        bytes.extend_from_slice(&[0u8; SESSION_ID_BYTES]);
        bytes.extend_from_slice(&0u64.to_le_bytes()); // sequence
        bytes.extend_from_slice(&[0u8; 40]); // tileX/tileY + both rects
        bytes.extend_from_slice(&(u32::try_from(payload.len()).unwrap()).to_le_bytes());
        bytes.extend_from_slice(payload);
        assert_eq!(bytes.len(), HEADER_BYTES + payload.len());
        bytes
    }

    #[test]
    fn parses_an_svg_chunk_and_returns_its_kind() {
        let bytes = svg_vector(b"<svg/>");
        let (header, payload) = parse_frame(&bytes).expect("valid svg frame must parse");
        assert_eq!(header.kind, KIND_SVG_CHUNK);
        assert_eq!(header.sequence, 0);
        assert_eq!(payload, b"<svg/>");
    }

    #[test]
    fn rejects_an_svg_chunk_carrying_raster_geometry() {
        // tileX, then each rect field in turn: any non-zero raster field is a
        // frame the SVG writer would have to silently ignore.
        for offset in [32, 36, 40, 48, 56, 64] {
            let mut bytes = svg_vector(b"<svg/>");
            bytes[offset..offset + 4].copy_from_slice(&7u32.to_le_bytes());
            assert!(
                parse_frame(&bytes).is_err(),
                "non-zero raster field at offset {offset} must be rejected"
            );
        }
    }

    #[test]
    fn rejects_nonzero_reserved() {
        let mut bytes = fixed_vector();
        bytes[7] = 1;
        assert!(parse_frame(&bytes).is_err());
    }

    #[test]
    fn rejects_empty_encoded_payload() {
        let mut bytes = fixed_vector();
        bytes.truncate(HEADER_BYTES);
        bytes[72..76].copy_from_slice(&0u32.to_le_bytes());
        assert!(parse_frame(&bytes).is_err());
    }

    #[test]
    fn rejects_declared_length_overflow() {
        let mut bytes = fixed_vector();
        bytes[72..76].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(parse_frame(&bytes).is_err());
    }
}
