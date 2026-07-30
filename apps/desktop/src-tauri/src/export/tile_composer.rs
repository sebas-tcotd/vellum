//! Incremental PNG compositor for the tiled export pipeline (story 6.2F).
//!
//! Decodes one PNG tile chunk at a time, crops its overscan margin down to
//! `usefulRect`, and accumulates cropped rows in a single scanline band sized
//! to one row of tiles. Once a band is fully covered left-to-right it is
//! streamed straight into the `.part` file via a [`png::StreamWriter`] and
//! discarded — the process never holds a framebuffer proportional to the
//! whole output, only to one band.
use std::fs::File;
use std::io::{BufWriter, Cursor, Write};
use std::path::Path;

use super::framing::PixelRectRaw;
use super::session::{AcceptedTile, TileConsumer};
use crate::errors::VellumError;

/// Bytes per pixel for the 8-bit RGBA color type this compositor requires.
const BYTES_PER_PIXEL: usize = 4;

/// Per-tile decoded RGBA budget. Mirrors `MAX_TILE_RGBA_BYTES` in
/// `packages/renderer-webgl/src/export/tile-planner.ts`, which already
/// constrains the planner's `renderRect` to this size — Rust re-checks it
/// independently (defense in depth) since a compromised/buggy caller could
/// otherwise declare a `renderRect` whose claimed dimensions force a huge
/// decode allocation before this module ever sees the real PNG bytes.
const MAX_TILE_RGBA_BYTES: u64 = 32 * 1024 * 1024;

fn compose_error(reason: &str) -> VellumError {
    VellumError::ExportFailed {
        reason: format!("tile composition: {reason}"),
    }
}

fn write_error(reason: &str) -> VellumError {
    VellumError::IoError {
        reason: format!("tile composition write: {reason}"),
    }
}

/// Streams tile chunks into the final PNG. Owns the only in-flight writer
/// for a session and the current scanline band — no other buffer grows with
/// the number of tiles or the total output area.
///
/// Generic over the sink so tests can inject a fallible [`Write`] and assert
/// real writer/encoder failure handling without touching the filesystem;
/// production always uses [`TileComposer::create`], which targets the
/// session's `.part` file.
pub struct TileComposer<W: Write + Send + 'static = BufWriter<File>> {
    output_width: u32,
    output_height: u32,
    writer: Option<png::StreamWriter<'static, W>>,
    /// Working buffer for the row of tiles currently being assembled.
    /// Empty between bands; sized to `band_height * output_width * 4` while one
    /// is in progress.
    band: Vec<u8>,
    band_height: u32,
    /// Next expected x within the current band (0 when a band has not started).
    cursor_x: u32,
    /// Rows already flushed to the writer.
    cursor_y: u32,
    /// Set once a write to the encoder has failed — the encoder state is then
    /// irrecoverable, so every subsequent call fails closed instead of
    /// permitting a retry over a partially-written stream.
    failed: bool,
}

impl TileComposer<BufWriter<File>> {
    /// Opens `part_path` for streaming and writes the PNG header for an
    /// `output_width x output_height` RGBA8 image.
    ///
    /// # Errors
    /// Returns `VellumError::IoError` when the file cannot be opened, or
    /// `VellumError::ExportFailed` when the encoder cannot write its header.
    pub fn create(
        output_width: u32,
        output_height: u32,
        part_path: &Path,
    ) -> Result<Self, VellumError> {
        let file = File::create(part_path).map_err(|e| VellumError::IoError {
            reason: format!("failed to open export temp file for streaming: {e}"),
        })?;
        Self::from_writer(output_width, output_height, BufWriter::new(file))
    }
}

impl<W: Write + Send + 'static> TileComposer<W> {
    /// Writes the PNG header to `sink` and wraps it in a streaming encoder.
    /// Split out from [`TileComposer::create`] so tests can target an
    /// in-memory or fallible sink instead of a real file.
    ///
    /// # Errors
    /// Returns `VellumError::ExportFailed` when the encoder cannot write its
    /// header or start the stream (including a `sink` that fails immediately).
    fn from_writer(output_width: u32, output_height: u32, sink: W) -> Result<Self, VellumError> {
        let mut encoder = png::Encoder::new(sink, output_width, output_height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let writer = encoder
            .write_header()
            .map_err(|e| compose_error(&format!("failed to write PNG header: {e}")))?;
        let stream = writer
            .into_stream_writer()
            .map_err(|e| compose_error(&format!("failed to start PNG stream: {e}")))?;
        Ok(Self {
            output_width,
            output_height,
            writer: Some(stream),
            band: Vec::new(),
            band_height: 0,
            cursor_x: 0,
            cursor_y: 0,
            failed: false,
        })
    }

    /// Starts a new band on the tile that opens it, or validates that `tile`
    /// continues the band already in progress. Never mutates `cursor_x` —
    /// only allocates/keeps `self.band` sized for this row of tiles.
    fn admit_into_band(&mut self, tile: &AcceptedTile) -> Result<(), VellumError> {
        if self.band.is_empty() {
            if tile.useful_rect.y != self.cursor_y || tile.useful_rect.x != 0 {
                return Err(compose_error(
                    "tile coverage gap: expected the next band to start at (0, next row)",
                ));
            }
            self.band_height = tile.useful_rect.height;
            let band_len_bytes = u64::from(self.band_height)
                .checked_mul(u64::from(self.output_width))
                .and_then(|n| n.checked_mul(BYTES_PER_PIXEL as u64))
                .ok_or_else(|| compose_error("band size overflows"))?;
            // The band spans one row of tiles at the declared output width —
            // bounded independently of the session's encoded-byte budget,
            // since this buffer holds decoded (uncompressed) RGBA bytes.
            if band_len_bytes > super::session::MAX_SESSION_BYTES {
                return Err(compose_error(
                    "scanline band exceeds the session memory budget",
                ));
            }
            let band_len = usize::try_from(band_len_bytes)
                .map_err(|_| compose_error("band size exceeds addressable memory"))?;
            // Baseline signal (6.2A): the working buffer never grows past one
            // band, unlike a full framebuffer that scales with output area.
            eprintln!(
                "[export] tile composer band buffer: {band_len} bytes (band_height={}, output_width={})",
                self.band_height, self.output_width
            );
            self.band = vec![0u8; band_len];
            Ok(())
        } else if tile.useful_rect.y != self.cursor_y || tile.useful_rect.height != self.band_height
        {
            Err(compose_error(
                "tile coverage gap: tile does not match the current band's row/height",
            ))
        } else if tile.useful_rect.x != self.cursor_x {
            Err(compose_error(
                "tile coverage gap or overlap: tile does not continue the current band",
            ))
        } else {
            Ok(())
        }
    }

    fn flush_band(&mut self) -> Result<(), VellumError> {
        let writer = self
            .writer
            .as_mut()
            .ok_or_else(|| compose_error("writer already finalized"))?;
        if let Err(e) = writer.write_all(&self.band) {
            self.failed = true;
            return Err(write_error(&format!("failed writing PNG scanlines: {e}")));
        }
        // Push the compressed band out to the sink now instead of letting it
        // sit in the encoder's internal zlib buffer — keeps actual on-disk
        // progress close to `cursor_y` and surfaces a write failure as soon
        // as this band is done, not only when the whole stream is finished.
        if let Err(e) = writer.flush() {
            self.failed = true;
            return Err(write_error(&format!("failed flushing PNG scanlines: {e}")));
        }
        self.cursor_y += self.band_height;
        self.cursor_x = 0;
        self.band = Vec::new();
        self.band_height = 0;
        Ok(())
    }
}

impl<W: Write + Send + 'static> TileConsumer for TileComposer<W> {
    fn accept(&mut self, tile: &AcceptedTile, payload: &[u8]) -> Result<(), VellumError> {
        if self.failed {
            return Err(compose_error(
                "composer already failed; session must be abandoned",
            ));
        }

        let render_area_bytes = u64::from(tile.render_rect.width)
            .checked_mul(u64::from(tile.render_rect.height))
            .and_then(|px| px.checked_mul(BYTES_PER_PIXEL as u64))
            .ok_or_else(|| compose_error("renderRect pixel area overflows"))?;
        if render_area_bytes > MAX_TILE_RGBA_BYTES {
            return Err(compose_error(
                "renderRect exceeds the per-tile decoded RGBA budget",
            ));
        }

        let decoded = decode_tile_png(payload, tile.render_rect)?;
        let (crop_x, crop_y) = crop_offset(tile)?;
        let (crop_w, crop_h) = (tile.useful_rect.width, tile.useful_rect.height);

        self.admit_into_band(tile)?;

        let next_cursor_x = self
            .cursor_x
            .checked_add(crop_w)
            .ok_or_else(|| compose_error("band cursor overflows"))?;
        if next_cursor_x > self.output_width {
            return Err(compose_error("tile coverage exceeds declared output width"));
        }

        copy_cropped_rows(
            &decoded,
            tile.render_rect.width,
            crop_x,
            crop_y,
            crop_w,
            crop_h,
            &mut self.band,
            self.output_width,
            self.cursor_x,
        )?;

        self.cursor_x = next_cursor_x;
        if self.cursor_x == self.output_width {
            self.flush_band()?;
        }
        Ok(())
    }

    fn finish(&mut self) -> Result<(), VellumError> {
        if self.failed {
            return Err(compose_error("composer already failed"));
        }
        if self.cursor_x != 0 || self.cursor_y != self.output_height {
            return Err(compose_error(
                "incomplete tile coverage: output rows are not fully covered",
            ));
        }
        let writer = self
            .writer
            .take()
            .ok_or_else(|| compose_error("composer already finished"))?;
        writer.finish().map_err(|e| {
            self.failed = true;
            write_error(&format!("failed finalizing PNG stream: {e}"))
        })
    }

    fn is_poisoned(&self) -> bool {
        self.failed
    }
}

/// Computes `usefulRect`'s offset within `renderRect`'s decoded pixel grid.
/// Both rectangles share the same output coordinate frame, so this is a
/// plain subtraction — guarded here in case a caller bypasses the session's
/// own containment check.
fn crop_offset(tile: &AcceptedTile) -> Result<(u32, u32), VellumError> {
    let crop_x = tile
        .useful_rect
        .x
        .checked_sub(tile.render_rect.x)
        .ok_or_else(|| compose_error("usefulRect is not contained within renderRect"))?;
    let crop_y = tile
        .useful_rect
        .y
        .checked_sub(tile.render_rect.y)
        .ok_or_else(|| compose_error("usefulRect is not contained within renderRect"))?;
    Ok((crop_x, crop_y))
}

/// Decodes a single tile's PNG payload, validating that it is 8-bit RGBA and
/// matches the render rectangle's declared dimensions exactly.
fn decode_tile_png(payload: &[u8], render_rect: PixelRectRaw) -> Result<Vec<u8>, VellumError> {
    let decoder = png::Decoder::new(Cursor::new(payload));
    let mut reader = decoder
        .read_info()
        .map_err(|e| compose_error(&format!("invalid PNG chunk: {e}")))?;

    let (width, height, color_type, bit_depth) = {
        let info = reader.info();
        (info.width, info.height, info.color_type, info.bit_depth)
    };
    if color_type != png::ColorType::Rgba || bit_depth != png::BitDepth::Eight {
        return Err(compose_error("tile PNG must be 8-bit RGBA"));
    }
    if width != render_rect.width || height != render_rect.height {
        return Err(compose_error("tile PNG dimensions do not match renderRect"));
    }

    let buffer_size = reader
        .output_buffer_size()
        .ok_or_else(|| compose_error("unable to determine PNG buffer size"))?;
    let mut buf = vec![0u8; buffer_size];
    reader
        .next_frame(&mut buf)
        .map_err(|e| compose_error(&format!("failed to decode tile PNG: {e}")))?;
    Ok(buf)
}

/// Copies the `crop_w x crop_h` region starting at `(crop_x, crop_y)` in
/// `decoded` (a `decoded_width`-wide RGBA8 buffer) into `band` at row 0,
/// column `dest_x` — `band` is `output_width` wide.
#[allow(clippy::too_many_arguments)]
fn copy_cropped_rows(
    decoded: &[u8],
    decoded_width: u32,
    crop_x: u32,
    crop_y: u32,
    crop_w: u32,
    crop_h: u32,
    band: &mut [u8],
    output_width: u32,
    dest_x: u32,
) -> Result<(), VellumError> {
    let row_bytes = crop_w as usize * BYTES_PER_PIXEL;
    for row in 0..crop_h {
        let src_start =
            ((crop_y + row) as usize * decoded_width as usize + crop_x as usize) * BYTES_PER_PIXEL;
        let src_end = src_start + row_bytes;
        let src = decoded
            .get(src_start..src_end)
            .ok_or_else(|| compose_error("cropped region falls outside the decoded tile"))?;

        let dest_start = (row as usize * output_width as usize + dest_x as usize) * BYTES_PER_PIXEL;
        let dest_end = dest_start + row_bytes;
        let dest = band
            .get_mut(dest_start..dest_end)
            .ok_or_else(|| compose_error("cropped region falls outside the output band"))?;
        dest.copy_from_slice(src);
    }
    Ok(())
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is before UNIX_EPOCH")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "vellum_tile_composer_{label}_{}_{nanos}.part",
            std::process::id()
        ))
    }

    /// Encodes a small in-memory RGBA8 PNG for use as a synthetic tile payload.
    fn encode_png(width: u32, height: u32, pixels: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut out, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().expect("header must encode");
            writer.write_image_data(pixels).expect("data must encode");
        }
        out
    }

    fn decode_final_png(path: &Path) -> (u32, u32, Vec<u8>) {
        let file = File::open(path).expect("final PNG must be readable");
        let decoder = png::Decoder::new(std::io::BufReader::new(file));
        let mut reader = decoder
            .read_info()
            .expect("final PNG must have valid header");
        let (width, height) = (reader.info().width, reader.info().height);
        let mut buf = vec![0u8; reader.output_buffer_size().unwrap()];
        reader.next_frame(&mut buf).expect("final PNG must decode");
        (width, height, buf)
    }

    fn tile(
        tile_x: u32,
        tile_y: u32,
        useful: (u32, u32, u32, u32),
        render: (u32, u32, u32, u32),
    ) -> AcceptedTile {
        AcceptedTile {
            tile_x,
            tile_y,
            useful_rect: PixelRectRaw {
                x: useful.0,
                y: useful.1,
                width: useful.2,
                height: useful.3,
            },
            render_rect: PixelRectRaw {
                x: render.0,
                y: render.1,
                width: render.2,
                height: render.3,
            },
            encoded_len: 0,
        }
    }

    fn solid_pixels(width: u32, height: u32, rgba: [u8; 4]) -> Vec<u8> {
        let mut out = Vec::with_capacity((width * height) as usize * 4);
        for _ in 0..(width * height) {
            out.extend_from_slice(&rgba);
        }
        out
    }

    #[test]
    fn single_tile_with_overscan_crops_exactly_to_useful_rect() {
        // 3x3 render for a 2x2 output: the top-left 2x2 useful region is
        // red, the bottom/right overscan border is a different color that
        // must never appear in the final output. (`useful_rect` and
        // `render_rect` share one output coordinate frame and `render_rect`
        // can never start before an edge tile's own origin, so overscan on
        // an edge-of-output tile only extends toward the interior.)
        let mut pixels = solid_pixels(3, 3, [9, 9, 9, 255]);
        for y in 0..2u32 {
            for x in 0..2u32 {
                let idx = ((y * 3 + x) * 4) as usize;
                pixels[idx..idx + 4].copy_from_slice(&[255, 0, 0, 255]);
            }
        }
        let payload = encode_png(3, 3, &pixels);
        let path = unique_temp_path("overscan");

        let mut composer = TileComposer::create(2, 2, &path).unwrap();
        composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 3, 3)), &payload)
            .expect("crop must succeed");
        composer.finish().expect("finish must succeed");

        let (w, h, out) = decode_final_png(&path);
        assert_eq!((w, h), (2, 2));
        assert_eq!(out, solid_pixels(2, 2, [255, 0, 0, 255]));

        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn two_tiles_in_a_row_compose_in_left_to_right_scanline_order() {
        // Left tile sits at the output's left edge (no overscan possible on
        // that side). Right tile has a 1px overscan margin on its left —
        // decoded column 0 is a border color that must be trimmed away.
        let left = encode_png(2, 2, &solid_pixels(2, 2, [1, 0, 0, 255]));
        let mut right_pixels = solid_pixels(3, 2, [9, 9, 9, 255]);
        for y in 0..2u32 {
            for x in 1..3u32 {
                let idx = ((y * 3 + x) * 4) as usize;
                right_pixels[idx..idx + 4].copy_from_slice(&[2, 0, 0, 255]);
            }
        }
        let right = encode_png(3, 2, &right_pixels);
        let path = unique_temp_path("row-order");

        let mut composer = TileComposer::create(4, 2, &path).unwrap();
        composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &left)
            .unwrap();
        composer
            .accept(&tile(1, 0, (2, 0, 2, 2), (1, 0, 3, 2)), &right)
            .unwrap();
        composer.finish().unwrap();

        let (_, _, out) = decode_final_png(&path);
        // Row 0: left tile's two pixels, then right tile's two cropped
        // pixels — the overscan border column never appears.
        assert_eq!(&out[0..4], &[1, 0, 0, 255]);
        assert_eq!(&out[4..8], &[1, 0, 0, 255]);
        assert_eq!(&out[8..12], &[2, 0, 0, 255]);
        assert_eq!(&out[12..16], &[2, 0, 0, 255]);

        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn non_divisible_output_with_partial_boundary_tiles_covers_exactly() {
        // 3x3 output split into a 2x2 top-left tile and two boundary tiles.
        let tl = encode_png(2, 2, &solid_pixels(2, 2, [10, 0, 0, 255]));
        let tr = encode_png(1, 2, &solid_pixels(1, 2, [20, 0, 0, 255]));
        let bottom = encode_png(3, 1, &solid_pixels(3, 1, [30, 0, 0, 255]));
        let path = unique_temp_path("non-divisible");

        let mut composer = TileComposer::create(3, 3, &path).unwrap();
        composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &tl)
            .unwrap();
        composer
            .accept(&tile(1, 0, (2, 0, 1, 2), (2, 0, 1, 2)), &tr)
            .unwrap();
        composer
            .accept(&tile(0, 1, (0, 2, 3, 1), (0, 2, 3, 1)), &bottom)
            .unwrap();
        composer.finish().unwrap();

        let (w, h, out) = decode_final_png(&path);
        assert_eq!((w, h), (3, 3));
        assert_eq!(out.len(), 3 * 3 * 4);
        assert_eq!(&out[0..4], &[10, 0, 0, 255]);
        assert_eq!(&out[8..12], &[20, 0, 0, 255]);
        assert_eq!(&out[24..28], &[30, 0, 0, 255]);

        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn preserves_alpha_and_all_three_backgrounds_exactly() {
        for rgba in [[255, 255, 255, 255], [10, 10, 10, 255], [0, 0, 0, 0]] {
            let payload = encode_png(2, 2, &solid_pixels(2, 2, rgba));
            let path = unique_temp_path(&format!(
                "bg-{}-{}-{}-{}",
                rgba[0], rgba[1], rgba[2], rgba[3]
            ));

            let mut composer = TileComposer::create(2, 2, &path).unwrap();
            composer
                .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &payload)
                .unwrap();
            composer.finish().unwrap();

            let (_, _, out) = decode_final_png(&path);
            assert_eq!(out, solid_pixels(2, 2, rgba));

            std::fs::remove_file(&path).unwrap();
        }
    }

    #[test]
    fn rejects_corrupt_png_payload() {
        let path = unique_temp_path("corrupt");
        let mut composer = TileComposer::create(2, 2, &path).unwrap();
        let err = composer
            .accept(
                &tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)),
                &[0xde, 0xad, 0xbe, 0xef],
            )
            .unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
        drop(composer);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn rejects_dimension_mismatch_between_payload_and_render_rect() {
        let payload = encode_png(2, 2, &solid_pixels(2, 2, [1, 2, 3, 255]));
        let path = unique_temp_path("dim-mismatch");
        let mut composer = TileComposer::create(4, 4, &path).unwrap();
        // Declares a 3x3 renderRect but the payload actually decodes as 2x2.
        let err = composer
            .accept(&tile(0, 0, (0, 0, 3, 3), (0, 0, 3, 3)), &payload)
            .unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
        drop(composer);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn rejects_gap_between_tiles() {
        let a = encode_png(2, 2, &solid_pixels(2, 2, [1, 0, 0, 255]));
        let path = unique_temp_path("gap");
        let mut composer = TileComposer::create(6, 2, &path).unwrap();
        composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &a)
            .unwrap();
        // Next tile jumps to x=4, skipping x=2..4 — a gap.
        let b = encode_png(2, 2, &solid_pixels(2, 2, [2, 0, 0, 255]));
        let err = composer
            .accept(&tile(2, 0, (4, 0, 2, 2), (0, 0, 2, 2)), &b)
            .unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
        drop(composer);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn rejects_overlap_between_tiles() {
        let a = encode_png(2, 2, &solid_pixels(2, 2, [1, 0, 0, 255]));
        let path = unique_temp_path("overlap");
        let mut composer = TileComposer::create(4, 2, &path).unwrap();
        composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &a)
            .unwrap();
        // Restarts at x=1 instead of continuing at x=2 — an overlap.
        let b = encode_png(2, 2, &solid_pixels(2, 2, [2, 0, 0, 255]));
        let err = composer
            .accept(&tile(1, 0, (1, 0, 2, 2), (0, 0, 2, 2)), &b)
            .unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
        drop(composer);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn rejects_duplicate_band_start() {
        let a = encode_png(2, 2, &solid_pixels(2, 2, [1, 0, 0, 255]));
        let path = unique_temp_path("duplicate");
        let mut composer = TileComposer::create(2, 4, &path).unwrap();
        composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &a)
            .unwrap();
        // Repeats y=0 instead of advancing to y=2 — a duplicated band.
        let err = composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &a)
            .unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
        drop(composer);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn rejects_tile_exceeding_output_bounds() {
        let a = encode_png(3, 2, &solid_pixels(3, 2, [1, 0, 0, 255]));
        let path = unique_temp_path("out-of-bounds");
        let mut composer = TileComposer::create(2, 2, &path).unwrap();
        let err = composer
            .accept(&tile(0, 0, (0, 0, 3, 2), (0, 0, 3, 2)), &a)
            .unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
        drop(composer);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn finish_rejects_incomplete_coverage_and_never_produces_a_valid_final_file() {
        let a = encode_png(2, 2, &solid_pixels(2, 2, [1, 0, 0, 255]));
        let path = unique_temp_path("incomplete-finish");
        let mut composer = TileComposer::create(2, 4, &path).unwrap();
        composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &a)
            .unwrap();
        let err = composer.finish().unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));

        // The `.part` file exists (created by `create`) but never received a
        // valid IEND — decoding it as a complete PNG must fail.
        assert!(std::panic::catch_unwind(|| decode_final_png(&path)).is_err());
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn rejects_render_rect_exceeding_the_per_tile_rgba_budget() {
        // renderRect claims a huge area even though the payload is a tiny,
        // clearly-invalid PNG — the budget check must reject before any
        // decode allocation is attempted.
        let path = unique_temp_path("tile-budget");
        let mut composer = TileComposer::create(100_000, 100_000, &path).unwrap();
        let err = composer
            .accept(
                &tile(0, 0, (0, 0, 20_000, 20_000), (0, 0, 20_000, 20_000)),
                &[0, 1, 2, 3],
            )
            .unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
        drop(composer);
        std::fs::remove_file(&path).unwrap();
    }

    #[test]
    fn rejects_a_scanline_band_that_would_exceed_the_session_memory_budget() {
        // A small tile (well within the 32 MiB per-tile cap) that opens a
        // band on a very wide declared output — `band_height * output_width`
        // alone must be rejected even though no single tile is oversized.
        let payload = encode_png(10, 10, &solid_pixels(10, 10, [1, 0, 0, 255]));
        let path = unique_temp_path("band-budget");
        let mut composer = TileComposer::create(90_000_000, 20, &path).unwrap();
        let err = composer
            .accept(&tile(0, 0, (0, 0, 10, 10), (0, 0, 10, 10)), &payload)
            .unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
        drop(composer);
        std::fs::remove_file(&path).unwrap();
    }

    /// A [`Write`] sink that fails once `should_fail` is set, letting a test
    /// deterministically choose whether the failure lands during PNG header
    /// setup, mid-band streaming, or `finish()` — without depending on how
    /// many internal writes the `png` crate happens to perform.
    #[derive(Clone)]
    struct FlakyWriter {
        should_fail: std::sync::Arc<std::sync::atomic::AtomicBool>,
    }

    impl Write for FlakyWriter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            if self.should_fail.load(std::sync::atomic::Ordering::SeqCst) {
                return Err(std::io::Error::other("synthetic write failure"));
            }
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            if self.should_fail.load(std::sync::atomic::Ordering::SeqCst) {
                return Err(std::io::Error::other("synthetic flush failure"));
            }
            Ok(())
        }
    }

    #[test]
    fn a_real_write_failure_during_band_flush_poisons_the_composer() {
        let should_fail = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let mut composer = TileComposer::from_writer(
            2,
            2,
            FlakyWriter {
                should_fail: should_fail.clone(),
            },
        )
        .expect("header must succeed while the sink is healthy");

        should_fail.store(true, std::sync::atomic::Ordering::SeqCst);
        let payload = encode_png(2, 2, &solid_pixels(2, 2, [1, 0, 0, 255]));
        let err = composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &payload)
            .unwrap_err();
        assert!(matches!(err, VellumError::IoError { .. }));
        assert!(composer.is_poisoned());

        // A retry over the now-corrupted encoder must fail closed rather
        // than silently succeed.
        let err = composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &payload)
            .unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
        let err = composer.finish().unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
    }

    #[test]
    fn a_real_finish_failure_is_reported_and_poisons_the_composer() {
        let should_fail = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let mut composer = TileComposer::from_writer(
            2,
            2,
            FlakyWriter {
                should_fail: should_fail.clone(),
            },
        )
        .expect("header must succeed while the sink is healthy");

        let payload = encode_png(2, 2, &solid_pixels(2, 2, [1, 0, 0, 255]));
        composer
            .accept(&tile(0, 0, (0, 0, 2, 2), (0, 0, 2, 2)), &payload)
            .expect("band write succeeds while the sink is healthy");

        should_fail.store(true, std::sync::atomic::Ordering::SeqCst);
        let err = composer.finish().unwrap_err();
        assert!(matches!(err, VellumError::IoError { .. }));
        assert!(composer.is_poisoned());
    }
}
