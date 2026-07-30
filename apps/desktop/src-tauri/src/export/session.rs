//! `ExportSessionManager` — the Rust half of the transactional tiled-export
//! boundary. Owns session state, ID generation, budgets, `.part` files and their
//! atomic rename. Does not render, encode, or composite PNGs (6.2D–6.2F).
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use super::framing::{self, PixelRectRaw};
use crate::commands::is_safe_export_name;
use crate::errors::VellumError;
use crate::ipc_contract::{
    AppendAckResponse, BeginExport, ExportReceiptResponse, ExportSessionResponse,
};

/// Whole wire-frame ceiling per AD-10 ("64 MiB máximos pendientes entre
/// frontend e IPC") — this is the complete frame crossing IPC, header
/// included, since `maxInFlight` is always 1 and only one frame is ever
/// pending at a time.
pub const MAX_PENDING_FRAME_BYTES: u64 = 64 * 1024 * 1024;
/// Maximum encoded PNG payload accepted in a single chunk. Derived by
/// subtracting the fixed 76-byte header so a full wire frame (header +
/// payload) never exceeds [`MAX_PENDING_FRAME_BYTES`]. Reported to the
/// frontend as `maxChunkBytes`.
pub const MAX_CHUNK_BYTES: u64 = MAX_PENDING_FRAME_BYTES - framing::HEADER_BYTES as u64;
/// Maximum cumulative encoded bytes a single session may accept across its
/// lifetime (AD-10: "256 MiB de buffers administrados por una sesión").
pub const MAX_SESSION_BYTES: u64 = 256 * 1024 * 1024;
/// Maximum logical pixels covered by one export operation (AD-10; mirrors
/// `MAX_TILED_LOGICAL_PIXELS` in `@vellum/core`).
pub const MAX_LOGICAL_PIXELS: u64 = 1_000_000_000;

const TEMP_FILE_PREFIX: &str = ".vellum-export-";
const TEMP_FILE_SUFFIX: &str = ".part";

/// Geometry and size of one accepted chunk, forwarded to the injected
/// [`TileConsumer`] so a future compositor (6.2F) can locate and composite
/// each tile without re-deriving this from the wire frame.
#[derive(Debug, Clone, Copy)]
pub struct AcceptedTile {
    /// Tile column.
    pub tile_x: u32,
    /// Tile row.
    pub tile_y: u32,
    /// Useful output rectangle covered by the encoded bytes.
    pub useful_rect: PixelRectRaw,
    /// Render rectangle represented by the encoded bytes.
    pub render_rect: PixelRectRaw,
    /// Encoded PNG byte length.
    pub encoded_len: usize,
}

/// Accepts validated tile chunks and confirms full coverage before a commit.
pub trait TileConsumer: Send {
    /// Records one already-validated chunk. Framing/budget/coverage checks
    /// happen in the session before this is called; `tile` carries the
    /// geometry a real compositor will need starting in 6.2F.
    ///
    /// # Errors
    /// Returns a typed `VellumError` when the chunk cannot be accepted.
    fn accept(&mut self, tile: &AcceptedTile) -> Result<(), VellumError>;
    /// Confirms full coverage. Only `Ok(())` allows the `.part` file to be
    /// committed via rename.
    ///
    /// # Errors
    /// Returns a typed `VellumError` when coverage is incomplete or the
    /// consumer otherwise cannot confirm a publishable result.
    fn finish(&mut self) -> Result<(), VellumError>;
}

/// Production consumer: fail-closed until 6.2F wires a real compositor.
///
/// Never publishes a concatenation of tiles as a final PNG — `finish` always
/// rejects, so `finish_export` cannot commit a fake file in this story.
struct FailClosedConsumer;

impl TileConsumer for FailClosedConsumer {
    fn accept(&mut self, _tile: &AcceptedTile) -> Result<(), VellumError> {
        Ok(())
    }

    fn finish(&mut self) -> Result<(), VellumError> {
        Err(VellumError::ExportFailed {
            reason: "tiled PNG compositing is not implemented until story 6.2F".to_string(),
        })
    }
}

/// Builds one `TileConsumer` per session. Tests substitute a double via
/// [`ExportSessionManager::with_consumer_factory`]; production always installs
/// [`FailClosedConsumer`].
pub type ConsumerFactory = Box<dyn Fn() -> Box<dyn TileConsumer> + Send + Sync>;

/// Explicit session lifecycle (AC1: `Created → Active → Finishing → Committed`
/// or `Cancelled`/`Failed`). `Created` is instantaneous — a session is only
/// ever observable in the map once its `.part` file exists, so it starts at
/// `Active`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SessionState {
    Active,
    Finishing,
    Committed,
    Cancelled,
    Failed,
}

struct Session {
    state: SessionState,
    expected_sequence: u64,
    accepted_bytes: u64,
    accepted_pixels: u64,
    expected_tiles: u32,
    seen_tiles: HashSet<(u32, u32)>,
    output_width: u32,
    output_height: u32,
    part_path: PathBuf,
    final_path: PathBuf,
    consumer: Option<Box<dyn TileConsumer>>,
}

/// Tauri-managed state owning every tiled-export session, active or terminal.
///
/// # Terminal states
/// `Committed`, `Cancelled` and `Failed` are explicit, persisted
/// [`SessionState`] variants (AC1) — reaching one does not remove the session
/// from the map. The entry becomes a tombstone instead: its `consumer` is
/// dropped, `append`/`finish` on that id return a typed "not active" error,
/// and `cancel` on it is a no-op that never touches an already-committed
/// file. Tombstones are a handful of small fields for a low-frequency,
/// user-driven, single-process desktop operation, so they are kept for the
/// life of the process rather than evicted.
pub struct ExportSessionManager {
    sessions: Mutex<HashMap<String, Session>>,
    consumer_factory: ConsumerFactory,
}

static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Generates a 16-byte token unique for the life of the process.
///
/// Not cryptographically random — uniqueness is guaranteed deterministically by
/// the monotonic counter (mixed with a timestamp and the process id only to
/// avoid a predictable/sequential wire value), matching AD-8's requirement that
/// a session id be "opaco, único y no reutilizable durante la vida del proceso."
fn generate_session_token() -> [u8; 16] {
    let counter = SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_nanos()).unwrap_or(u64::MAX));
    let pid = u64::from(std::process::id());
    let mut token = [0u8; 16];
    token[0..8].copy_from_slice(&counter.to_le_bytes());
    token[8..16].copy_from_slice(&(nanos ^ pid).to_le_bytes());
    token
}

fn hex_encode(bytes: &[u8; 16]) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(32);
    for byte in bytes {
        let _ = write!(out, "{byte:02x}");
    }
    out
}

fn unknown_session_error() -> VellumError {
    VellumError::ExportFailed {
        reason: "unknown, inactive, or already-finalized export session".to_string(),
    }
}

/// Rejects an operation against a session that exists but is not `Active`,
/// naming its actual terminal/transitional state for diagnostics.
fn session_not_active_error(state: SessionState) -> VellumError {
    let phase = match state {
        SessionState::Active => "active",
        SessionState::Finishing => "finishing",
        SessionState::Committed => "already committed",
        SessionState::Cancelled => "cancelled",
        SessionState::Failed => "failed",
    };
    VellumError::ExportFailed {
        reason: format!("export session is {phase}, not active"),
    }
}

fn rect_error(reason: &str) -> VellumError {
    VellumError::ExportFailed {
        reason: format!("export frame rectangle: {reason}"),
    }
}

fn budget_error(reason: &str) -> VellumError {
    VellumError::ExportFailed {
        reason: format!("export session budget: {reason}"),
    }
}

fn coverage_error(reason: &str) -> VellumError {
    VellumError::ExportFailed {
        reason: format!("export tile coverage: {reason}"),
    }
}

/// Adds `added` to `current` with checked arithmetic and rejects the result if
/// it would exceed `budget`. Factored out so the cumulative-budget arithmetic
/// is unit-testable with small numbers instead of allocating real megabytes.
fn checked_add_within_budget(
    current: u64,
    added: u64,
    budget: u64,
    reason: &str,
) -> Result<u64, VellumError> {
    let total = current
        .checked_add(added)
        .ok_or_else(|| budget_error(&format!("{reason} (overflow)")))?;
    if total > budget {
        return Err(budget_error(reason));
    }
    Ok(total)
}

/// Validates a rectangle fits entirely within `(max_width, max_height)`. Used
/// for `usefulRect`, which expresses actual output coverage.
fn validate_bounded_rect(
    rect: &PixelRectRaw,
    max_width: u32,
    max_height: u32,
) -> Result<(), VellumError> {
    if rect.width == 0 || rect.height == 0 {
        return Err(rect_error("zero-sized"));
    }
    let right = rect
        .x
        .checked_add(rect.width)
        .ok_or_else(|| rect_error("overflows"))?;
    let bottom = rect
        .y
        .checked_add(rect.height)
        .ok_or_else(|| rect_error("overflows"))?;
    if right > max_width || bottom > max_height {
        return Err(rect_error("exceeds declared output bounds"));
    }
    Ok(())
}

/// Validates a rectangle is finite and positive without bounding it to the
/// output — `renderRect` may include overscan margin from a future planner
/// (6.2D–6.2E), which this story does not implement or constrain.
fn validate_positive_rect(rect: &PixelRectRaw) -> Result<(), VellumError> {
    if rect.width == 0 || rect.height == 0 {
        return Err(rect_error("zero-sized"));
    }
    rect.x
        .checked_add(rect.width)
        .ok_or_else(|| rect_error("overflows"))?;
    rect.y
        .checked_add(rect.height)
        .ok_or_else(|| rect_error("overflows"))?;
    Ok(())
}

/// Validates that `inner` (the useful/output rectangle) is fully contained
/// within `outer` (the rendered rectangle) — a compositor can only crop
/// pixels that were actually rendered.
fn validate_rect_contained(inner: &PixelRectRaw, outer: &PixelRectRaw) -> Result<(), VellumError> {
    let inner_right = inner
        .x
        .checked_add(inner.width)
        .ok_or_else(|| rect_error("overflows"))?;
    let inner_bottom = inner
        .y
        .checked_add(inner.height)
        .ok_or_else(|| rect_error("overflows"))?;
    let outer_right = outer
        .x
        .checked_add(outer.width)
        .ok_or_else(|| rect_error("overflows"))?;
    let outer_bottom = outer
        .y
        .checked_add(outer.height)
        .ok_or_else(|| rect_error("overflows"))?;
    if inner.x < outer.x
        || inner.y < outer.y
        || inner_right > outer_right
        || inner_bottom > outer_bottom
    {
        return Err(rect_error("usefulRect is not contained within renderRect"));
    }
    Ok(())
}

impl ExportSessionManager {
    /// Creates a manager using the production fail-closed consumer.
    #[must_use]
    pub fn new() -> Self {
        Self::with_consumer_factory(Box::new(|| {
            Box::new(FailClosedConsumer) as Box<dyn TileConsumer>
        }))
    }

    /// Creates a manager with an injectable consumer factory, for tests that
    /// need to accept/reject coverage or simulate errors without a real
    /// compositor.
    #[must_use]
    pub fn with_consumer_factory(consumer_factory: ConsumerFactory) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            consumer_factory,
        }
    }

    fn lock_sessions(&self) -> MutexGuard<'_, HashMap<String, Session>> {
        match self.sessions.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        }
    }

    /// Opens one tiled-png session: validates dimensions/name, creates the
    /// `.part` file inside `downloads_dir`, and registers the session as
    /// `Active`.
    ///
    /// Takes a plain directory rather than a `tauri::AppHandle` so the full
    /// lifecycle is testable against a temp dir without a running Tauri app;
    /// the `begin_export` command resolves the real Downloads directory before
    /// calling this.
    ///
    /// # Errors
    /// Returns `VellumError::ExportFailed` for an unsupported mode, invalid
    /// dimensions, a zero tile budget, or an unsafe filename;
    /// `VellumError::IoError` when the `.part` file cannot be created.
    pub fn begin(
        &self,
        metadata: &BeginExport,
        downloads_dir: &Path,
    ) -> Result<ExportSessionResponse, VellumError> {
        if metadata.mode != "tiled-png" {
            return Err(VellumError::ExportFailed {
                reason: format!("unsupported export session mode: {}", metadata.mode),
            });
        }
        if metadata.output_width == 0 || metadata.output_height == 0 {
            return Err(VellumError::ExportFailed {
                reason: "export session requires positive output dimensions".to_string(),
            });
        }
        if metadata.expected_tiles == 0 {
            return Err(VellumError::ExportFailed {
                reason: "export session requires at least one expected tile".to_string(),
            });
        }
        let total_pixels = u64::from(metadata.output_width)
            .checked_mul(u64::from(metadata.output_height))
            .ok_or_else(|| budget_error("output dimensions overflow"))?;
        if total_pixels > MAX_LOGICAL_PIXELS {
            return Err(budget_error(
                "output dimensions exceed the logical pixel budget",
            ));
        }
        if !is_safe_export_name(&metadata.request.file_name) {
            return Err(VellumError::ExportFailed {
                reason: "invalid export file name".to_string(),
            });
        }

        let final_path = downloads_dir.join(format!("{}.png", metadata.request.file_name));
        let token = generate_session_token();
        let session_id = hex_encode(&token);
        let part_path =
            downloads_dir.join(format!("{TEMP_FILE_PREFIX}{session_id}{TEMP_FILE_SUFFIX}"));

        std::fs::File::create(&part_path).map_err(|e| VellumError::IoError {
            reason: format!("failed to create export temp file: {e}"),
        })?;

        let session = Session {
            state: SessionState::Active,
            expected_sequence: 0,
            accepted_bytes: 0,
            accepted_pixels: 0,
            expected_tiles: metadata.expected_tiles,
            seen_tiles: HashSet::new(),
            output_width: metadata.output_width,
            output_height: metadata.output_height,
            part_path,
            final_path,
            consumer: Some((self.consumer_factory)()),
        };
        self.lock_sessions().insert(session_id.clone(), session);

        Ok(ExportSessionResponse {
            session_id,
            mode: "tiled-png".to_string(),
            max_chunk_bytes: MAX_CHUNK_BYTES,
            max_in_flight: 1,
        })
    }

    /// Validates and accepts one raw wire frame. A rejection never mutates
    /// accepted bytes, units, sequence, coverage, or the `.part` file.
    ///
    /// # Errors
    /// Returns `VellumError::ExportFailed` for a malformed frame, an unknown or
    /// inactive session, an out-of-order sequence, an invalid or overlapping
    /// rectangle/tile, a budget overrun, or a consumer rejection.
    pub fn append(&self, raw: &[u8]) -> Result<AppendAckResponse, VellumError> {
        let (header, payload) = framing::parse_frame(raw)?;
        let session_id = hex_encode(&header.session_id);

        let mut sessions = self.lock_sessions();
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(unknown_session_error)?;
        if session.state != SessionState::Active {
            return Err(session_not_active_error(session.state));
        }
        if header.sequence != session.expected_sequence {
            return Err(VellumError::ExportFailed {
                reason: "out-of-order chunk sequence".to_string(),
            });
        }

        let encoded_len =
            u64::try_from(payload.len()).map_err(|_| budget_error("encoded length overflows"))?;
        // AC6: the pending IPC budget covers the *whole* wire frame (header +
        // payload), not just the payload — count it explicitly with checked
        // arithmetic rather than trusting a payload-only comparison.
        let header_bytes = u64::try_from(framing::HEADER_BYTES)
            .map_err(|_| budget_error("header size overflows"))?;
        let frame_total_bytes = header_bytes
            .checked_add(encoded_len)
            .ok_or_else(|| budget_error("frame size overflows"))?;
        if frame_total_bytes > MAX_PENDING_FRAME_BYTES {
            return Err(budget_error("chunk exceeds maxChunkBytes"));
        }
        let new_accepted_bytes = checked_add_within_budget(
            session.accepted_bytes,
            encoded_len,
            MAX_SESSION_BYTES,
            "session exceeds its total byte budget",
        )?;

        validate_bounded_rect(
            &header.useful_rect,
            session.output_width,
            session.output_height,
        )?;
        validate_positive_rect(&header.render_rect)?;
        validate_rect_contained(&header.useful_rect, &header.render_rect)?;

        let pixel_area = u64::from(header.useful_rect.width)
            .checked_mul(u64::from(header.useful_rect.height))
            .ok_or_else(|| budget_error("useful rect area overflows"))?;
        let new_accepted_pixels = checked_add_within_budget(
            session.accepted_pixels,
            pixel_area,
            MAX_LOGICAL_PIXELS,
            "session exceeds the logical pixel budget",
        )?;

        let tile_coord = (header.tile_x, header.tile_y);
        if session.seen_tiles.contains(&tile_coord) {
            return Err(coverage_error("tile coordinate already accepted (overlap)"));
        }
        if u32::try_from(session.seen_tiles.len()).unwrap_or(u32::MAX) >= session.expected_tiles {
            return Err(coverage_error("more tiles received than expectedTiles"));
        }

        let consumer = session
            .consumer
            .as_mut()
            .ok_or_else(unknown_session_error)?;
        consumer.accept(&AcceptedTile {
            tile_x: header.tile_x,
            tile_y: header.tile_y,
            useful_rect: header.useful_rect,
            render_rect: header.render_rect,
            encoded_len: payload.len(),
        })?;

        // Every validation above passed — only now is state mutated (AC5).
        session.accepted_bytes = new_accepted_bytes;
        session.accepted_pixels = new_accepted_pixels;
        session.expected_sequence += 1;
        session.seen_tiles.insert(tile_coord);

        Ok(AppendAckResponse {
            session_id,
            sequence: header.sequence,
            accepted_bytes: encoded_len,
            completed_units: 1,
        })
    }

    /// Confirms full, non-overlapping tile coverage against `expectedTiles`
    /// and the consumer's own confirmation, then atomically renames the
    /// `.part` file to its final destination.
    ///
    /// # Errors
    /// Returns a typed `VellumError` when the session is unknown or not
    /// `Active`, when fewer tiles were accepted than `expectedTiles` promised,
    /// when the consumer reports incomplete coverage, or when the filesystem
    /// rename fails — in every case the `.part` file is cleaned up rather than
    /// left dangling and the session moves to an explicit terminal state.
    pub fn finish(&self, session_id: &str) -> Result<ExportReceiptResponse, VellumError> {
        let (mut consumer, part_path, final_path) = {
            let mut sessions = self.lock_sessions();
            let session = sessions
                .get_mut(session_id)
                .ok_or_else(unknown_session_error)?;
            if session.state != SessionState::Active {
                return Err(session_not_active_error(session.state));
            }
            let accepted_tiles = u32::try_from(session.seen_tiles.len()).unwrap_or(u32::MAX);
            if accepted_tiles != session.expected_tiles {
                return Err(coverage_error(&format!(
                    "expected {} tiles, received {accepted_tiles}",
                    session.expected_tiles
                )));
            }
            session.state = SessionState::Finishing;
            let consumer = session.consumer.take().ok_or_else(unknown_session_error)?;
            (
                consumer,
                session.part_path.clone(),
                session.final_path.clone(),
            )
        };

        let outcome = match consumer.finish() {
            Ok(()) => std::fs::rename(&part_path, &final_path)
                .map(|()| ExportReceiptResponse {
                    file_path: final_path.to_string_lossy().into_owned(),
                    folder_path: final_path
                        .parent()
                        .map(|p| p.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                })
                .map_err(|e| {
                    let _ = std::fs::remove_file(&part_path);
                    VellumError::IoError {
                        reason: format!("export finalize failed: {e}"),
                    }
                }),
            Err(e) => {
                let _ = std::fs::remove_file(&part_path);
                Err(e)
            }
        };

        let mut sessions = self.lock_sessions();
        if let Some(session) = sessions.get_mut(session_id) {
            session.state = if outcome.is_ok() {
                SessionState::Committed
            } else {
                SessionState::Failed
            };
        }
        outcome
    }

    /// Abandons a session idempotently: an unknown id, or a session already in
    /// a terminal state, is a no-op. Never touches a file that has already
    /// been committed.
    ///
    /// # Errors
    /// This method does not fail — it always returns `Ok(())`.
    pub fn cancel(&self, session_id: &str) -> Result<(), VellumError> {
        let mut sessions = self.lock_sessions();
        if let Some(session) = sessions.get_mut(session_id) {
            if matches!(
                session.state,
                SessionState::Active | SessionState::Finishing
            ) {
                let _ = std::fs::remove_file(&session.part_path);
                session.consumer = None;
                session.state = SessionState::Cancelled;
            }
        }
        Ok(())
    }

    /// Removes every non-terminal session's `.part` file and clears all
    /// state. Called on window close and process exit so a crashed or
    /// abandoned session never leaves a stray temp file behind; harmless for
    /// tombstoned terminal sessions since a committed `.part` no longer exists
    /// at that path.
    pub fn cleanup_all(&self) {
        let mut sessions = self.lock_sessions();
        for (_, session) in sessions.drain() {
            let _ = std::fs::remove_file(&session.part_path);
        }
    }
}

impl Default for ExportSessionManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Removes stray `.vellum-export-*.part` files left behind by a crashed
/// process. Restricted to the exact Vellum temp-file prefix/suffix so it can
/// never touch an unrelated file in the user's Downloads folder.
pub fn sweep_stale_temp_files(downloads_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(downloads_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with(TEMP_FILE_PREFIX) && name.ends_with(TEMP_FILE_SUFFIX) {
            let _ = std::fs::remove_file(&path);
        }
    }
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use super::*;
    use crate::ipc_contract::BeginExportRequest;
    use std::sync::Arc;

    fn unique_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock is before UNIX_EPOCH")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "vellum_export_session_{label}_{}_{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn begin_metadata(file_name: &str, width: u32, height: u32) -> BeginExport {
        BeginExport {
            mode: "tiled-png".to_string(),
            snapshot_id: "snapshot-test".to_string(),
            request: BeginExportRequest {
                file_name: file_name.to_string(),
            },
            output_width: width,
            output_height: height,
            expected_tiles: 1,
        }
    }

    fn begin_metadata_with_tiles(
        file_name: &str,
        width: u32,
        height: u32,
        expected_tiles: u32,
    ) -> BeginExport {
        BeginExport {
            expected_tiles,
            ..begin_metadata(file_name, width, height)
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn frame_bytes(
        session_id_hex: &str,
        sequence: u64,
        tile: (u32, u32),
        useful: (u32, u32, u32, u32),
        render: (u32, u32, u32, u32),
        payload: &[u8],
    ) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"VEXP");
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.push(1);
        bytes.push(0);
        for i in 0..16 {
            let byte = u8::from_str_radix(&session_id_hex[i * 2..i * 2 + 2], 16).unwrap();
            bytes.push(byte);
        }
        bytes.extend_from_slice(&sequence.to_le_bytes());
        bytes.extend_from_slice(&tile.0.to_le_bytes()); // tileX
        bytes.extend_from_slice(&tile.1.to_le_bytes()); // tileY
        bytes.extend_from_slice(&useful.0.to_le_bytes());
        bytes.extend_from_slice(&useful.1.to_le_bytes());
        bytes.extend_from_slice(&useful.2.to_le_bytes());
        bytes.extend_from_slice(&useful.3.to_le_bytes());
        bytes.extend_from_slice(&render.0.to_le_bytes());
        bytes.extend_from_slice(&render.1.to_le_bytes());
        bytes.extend_from_slice(&render.2.to_le_bytes());
        bytes.extend_from_slice(&render.3.to_le_bytes());
        bytes.extend_from_slice(&(u32::try_from(payload.len()).unwrap()).to_le_bytes());
        bytes.extend_from_slice(payload);
        bytes
    }

    /// A double whose `finish` outcome is controllable — standing in for the
    /// real compositor that ships in 6.2F. Counts `accept` calls so tests can
    /// assert coverage bookkeeping without a real encoder.
    struct TestConsumer {
        finish_ok: bool,
        accept_calls: Arc<std::sync::atomic::AtomicU32>,
        reject_accept: bool,
    }

    impl TileConsumer for TestConsumer {
        fn accept(&mut self, _tile: &AcceptedTile) -> Result<(), VellumError> {
            if self.reject_accept {
                return Err(VellumError::ExportFailed {
                    reason: "test consumer rejected chunk".to_string(),
                });
            }
            self.accept_calls.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        fn finish(&mut self) -> Result<(), VellumError> {
            if self.finish_ok {
                Ok(())
            } else {
                Err(VellumError::ExportFailed {
                    reason: "test consumer: coverage incomplete".to_string(),
                })
            }
        }
    }

    fn manager_with(finish_ok: bool, reject_accept: bool) -> ExportSessionManager {
        ExportSessionManager::with_consumer_factory(Box::new(move || {
            Box::new(TestConsumer {
                finish_ok,
                accept_calls: Arc::new(std::sync::atomic::AtomicU32::new(0)),
                reject_accept,
            }) as Box<dyn TileConsumer>
        }))
    }

    #[test]
    fn generate_session_token_is_unique_across_calls() {
        let a = generate_session_token();
        let b = generate_session_token();
        assert_ne!(
            a, b,
            "the process-lifetime counter must guarantee uniqueness"
        );
    }

    #[test]
    fn hex_encode_produces_32_lowercase_chars() {
        let token = [0xabu8; 16];
        let hex = hex_encode(&token);
        assert_eq!(hex.len(), 32);
        assert_eq!(hex, "ab".repeat(16));
        assert!(hex
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn max_chunk_bytes_accounts_for_the_fixed_header() {
        // AC6: the 64 MiB IPC pending budget covers the whole wire frame, so
        // the payload ceiling reported as maxChunkBytes must leave room for
        // the fixed 76-byte header.
        assert_eq!(
            MAX_CHUNK_BYTES + u64::try_from(framing::HEADER_BYTES).unwrap(),
            MAX_PENDING_FRAME_BYTES
        );
        assert_eq!(MAX_PENDING_FRAME_BYTES, 64 * 1024 * 1024);
    }

    #[test]
    fn append_before_begin_returns_typed_error() {
        let manager = manager_with(true, false);
        let frame = frame_bytes(
            &"00".repeat(16),
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1, 2, 3],
        );
        let err = manager.append(&frame).unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));
    }

    #[test]
    fn cancel_is_idempotent_for_unknown_sessions() {
        let manager = manager_with(true, false);
        assert!(manager.cancel("does-not-exist").is_ok());
        assert!(manager.cancel("does-not-exist").is_ok());
    }

    #[test]
    fn full_lifecycle_creates_part_then_renames_on_finish() {
        let dir = unique_temp_dir("lifecycle");
        let manager = manager_with(true, false);
        let metadata = begin_metadata("altavento", 100, 100);

        let session = manager.begin(&metadata, &dir).expect("begin must succeed");
        let part_path = dir.join(format!(".vellum-export-{}.part", session.session_id));
        assert!(part_path.exists(), ".part must exist right after begin");

        let frame = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 100, 100),
            (0, 0, 100, 100),
            &[1, 2, 3, 4],
        );
        let ack = manager.append(&frame).expect("append must succeed");
        assert_eq!(ack.sequence, 0);
        assert_eq!(ack.accepted_bytes, 4);

        let receipt = manager
            .finish(&session.session_id)
            .expect("finish must succeed");
        assert_eq!(
            receipt.file_path,
            dir.join("altavento.png").to_string_lossy()
        );
        assert!(
            !part_path.exists(),
            ".part must disappear only after rename"
        );
        assert!(dir.join("altavento.png").exists());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn finish_rejects_when_coverage_is_incomplete_and_cleans_up() {
        let dir = unique_temp_dir("incomplete");
        let manager = manager_with(false, false);
        let metadata = begin_metadata("incomplete-map", 10, 10);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");
        let part_path = dir.join(format!(".vellum-export-{}.part", session.session_id));

        let frame = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[9],
        );
        manager.append(&frame).expect("append must succeed");

        assert!(manager.finish(&session.session_id).is_err());
        assert!(
            !part_path.exists(),
            "incomplete coverage must not leave .part behind"
        );
        assert!(!dir.join("incomplete-map.png").exists());
        assert!(
            manager.append(&frame).is_err(),
            "a session left in a terminal (Failed) state must reject append"
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn append_rejects_out_of_order_sequence_without_mutating_state() {
        let dir = unique_temp_dir("sequence");
        let manager = manager_with(true, false);
        let metadata = begin_metadata("seq-map", 10, 10);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");

        let out_of_order = frame_bytes(
            &session.session_id,
            1,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        assert!(manager.append(&out_of_order).is_err());

        let in_order = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        let ack = manager
            .append(&in_order)
            .expect("first append must still work");
        assert_eq!(ack.sequence, 0);

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn append_rejects_useful_rect_outside_output_bounds() {
        let dir = unique_temp_dir("bounds");
        let manager = manager_with(true, false);
        let metadata = begin_metadata("bounds-map", 10, 10);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");

        let out_of_bounds = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (5, 5, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        assert!(manager.append(&out_of_bounds).is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn append_rejects_useful_rect_not_contained_in_render_rect() {
        let dir = unique_temp_dir("containment");
        let manager = manager_with(true, false);
        let metadata = begin_metadata("containment-map", 100, 100);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");

        // usefulRect's bottom-right corner (40,40) falls outside renderRect's
        // (30,30) — both are individually valid rects, but useful is not
        // contained within render.
        let frame = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (20, 20, 20, 20),
            (0, 0, 30, 30),
            &[1],
        );
        assert!(manager.append(&frame).is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn append_rejects_chunk_over_max_chunk_bytes() {
        let dir = unique_temp_dir("oversize");
        let manager = manager_with(true, false);
        let metadata = begin_metadata("oversize-map", 10, 10);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");

        let oversized_payload = vec![0u8; usize::try_from(MAX_CHUNK_BYTES).unwrap() + 1];
        let frame = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &oversized_payload,
        );
        let err = manager.append(&frame).unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn checked_add_within_budget_rejects_overrun_and_overflow() {
        assert_eq!(checked_add_within_budget(10, 5, 100, "x").unwrap(), 15);
        assert!(checked_add_within_budget(96, 5, 100, "x").is_err());
        assert!(checked_add_within_budget(u64::MAX, 1, u64::MAX, "x").is_err());
    }

    #[test]
    fn append_rejects_when_consumer_rejects_and_does_not_advance_sequence() {
        let dir = unique_temp_dir("consumer-reject");
        let manager = manager_with(true, true);
        let metadata = begin_metadata("reject-map", 10, 10);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");

        let frame = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        let first_err = manager.append(&frame).unwrap_err();
        assert!(matches!(first_err, VellumError::ExportFailed { .. }));

        // Retrying the same sequence=0 frame must hit the same consumer
        // rejection again rather than an "out-of-order" error — proving the
        // failed attempt above never advanced `expected_sequence`.
        let second_err = manager.append(&frame).unwrap_err();
        match second_err {
            VellumError::ExportFailed { reason } => {
                assert!(reason.contains("test consumer rejected"));
            }
            other => panic!("expected the same consumer rejection again, got {other:?}"),
        }

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn append_rejects_duplicate_tile_coordinate() {
        let dir = unique_temp_dir("duplicate-tile");
        let manager = manager_with(true, false);
        let metadata = begin_metadata_with_tiles("duplicate-tile-map", 20, 10, 2);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");

        let first = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        manager.append(&first).expect("first tile must be accepted");

        // Same tileX/tileY as the first frame — an overlap, not a new tile.
        let duplicate = frame_bytes(
            &session.session_id,
            1,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        assert!(manager.append(&duplicate).is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn append_rejects_more_tiles_than_expected() {
        let dir = unique_temp_dir("too-many-tiles");
        let manager = manager_with(true, false);
        let metadata = begin_metadata_with_tiles("too-many-tiles-map", 20, 10, 1);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");

        let first = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        manager.append(&first).expect("first tile must be accepted");

        let extra = frame_bytes(
            &session.session_id,
            1,
            (1, 0),
            (10, 0, 10, 10),
            (10, 0, 10, 10),
            &[1],
        );
        assert!(manager.append(&extra).is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn finish_rejects_when_fewer_tiles_than_expected_were_appended() {
        let dir = unique_temp_dir("missing-tile");
        let manager = manager_with(true, false);
        let metadata = begin_metadata_with_tiles("missing-tile-map", 20, 10, 2);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");

        let first = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        manager.append(&first).expect("first tile must be accepted");

        let err = manager.finish(&session.session_id).unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn finish_rejects_with_zero_tiles_appended() {
        let dir = unique_temp_dir("zero-tiles-finish");
        let manager = manager_with(true, false);
        let metadata = begin_metadata_with_tiles("zero-tiles-finish-map", 10, 10, 2);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");

        let err = manager.finish(&session.session_id).unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn begin_rejects_zero_expected_tiles() {
        let dir = unique_temp_dir("zero-expected-tiles");
        let manager = manager_with(true, false);
        let metadata = begin_metadata_with_tiles("zero-expected-tiles-map", 10, 10, 0);
        assert!(manager.begin(&metadata, &dir).is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn cancel_removes_active_session_and_its_part_file() {
        let dir = unique_temp_dir("cancel");
        let manager = manager_with(true, false);
        let metadata = begin_metadata("cancel-map", 10, 10);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");
        let part_path = dir.join(format!(".vellum-export-{}.part", session.session_id));
        assert!(part_path.exists());

        assert!(manager.cancel(&session.session_id).is_ok());
        assert!(!part_path.exists());
        assert!(
            manager.cancel(&session.session_id).is_ok(),
            "cancel must be idempotent"
        );

        let frame = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        assert!(
            manager.append(&frame).is_err(),
            "a cancelled session must reject append"
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn cancel_after_commit_never_touches_the_final_file() {
        let dir = unique_temp_dir("cancel-after-commit");
        let manager = manager_with(true, false);
        let metadata = begin_metadata("committed-map", 10, 10);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");
        let frame = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        manager.append(&frame).expect("append must succeed");
        manager
            .finish(&session.session_id)
            .expect("finish must succeed");

        let final_path = dir.join("committed-map.png");
        assert!(final_path.exists());

        assert!(manager.cancel(&session.session_id).is_ok());
        assert!(
            final_path.exists(),
            "cancel must never remove an already-committed file"
        );

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn finish_after_already_committed_is_rejected() {
        let dir = unique_temp_dir("finish-twice");
        let manager = manager_with(true, false);
        let metadata = begin_metadata("finish-twice-map", 10, 10);
        let session = manager.begin(&metadata, &dir).expect("begin must succeed");
        let frame = frame_bytes(
            &session.session_id,
            0,
            (0, 0),
            (0, 0, 10, 10),
            (0, 0, 10, 10),
            &[1],
        );
        manager.append(&frame).expect("append must succeed");
        manager
            .finish(&session.session_id)
            .expect("first finish must succeed");

        let err = manager.finish(&session.session_id).unwrap_err();
        assert!(matches!(err, VellumError::ExportFailed { .. }));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn cleanup_all_removes_every_active_part_file() {
        let dir = unique_temp_dir("cleanup");
        let manager = manager_with(true, false);
        let s1 = manager
            .begin(&begin_metadata("cleanup-1", 10, 10), &dir)
            .unwrap();
        let s2 = manager
            .begin(&begin_metadata("cleanup-2", 10, 10), &dir)
            .unwrap();
        let part1 = dir.join(format!(".vellum-export-{}.part", s1.session_id));
        let part2 = dir.join(format!(".vellum-export-{}.part", s2.session_id));
        assert!(part1.exists());
        assert!(part2.exists());

        manager.cleanup_all();

        assert!(!part1.exists());
        assert!(!part2.exists());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn begin_rejects_unsafe_file_names_and_zero_dimensions() {
        let dir = unique_temp_dir("validation");
        let manager = manager_with(true, false);

        assert!(manager
            .begin(&begin_metadata("../escape", 10, 10), &dir)
            .is_err());
        assert!(manager
            .begin(&begin_metadata("ok-name", 0, 10), &dir)
            .is_err());
        assert!(manager
            .begin(&begin_metadata("ok-name", 100_000, 100_000), &dir)
            .is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn begin_rejects_legacy_png_mode() {
        let dir = unique_temp_dir("mode");
        let manager = manager_with(true, false);
        let mut metadata = begin_metadata("legacy-attempt", 10, 10);
        metadata.mode = "legacy-png".to_string();
        assert!(manager.begin(&metadata, &dir).is_err());

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn sweep_stale_temp_files_only_removes_the_exact_vellum_prefix() {
        let dir = unique_temp_dir("sweep");
        let stray = dir.join(".vellum-export-deadbeef.part");
        let unrelated = dir.join("family-photo.png");
        let lookalike = dir.join("not.vellum-export-x.part");
        std::fs::write(&stray, b"").unwrap();
        std::fs::write(&unrelated, b"keep me").unwrap();
        std::fs::write(&lookalike, b"keep me too").unwrap();

        sweep_stale_temp_files(&dir);

        assert!(!stray.exists(), "stray vellum temp file must be swept");
        assert!(unrelated.exists(), "unrelated user file must survive");
        assert!(lookalike.exists(), "only the exact prefix/suffix is swept");

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn validate_bounded_rect_rejects_out_of_bounds_and_overflow() {
        let rect = PixelRectRaw {
            x: 5,
            y: 5,
            width: 10,
            height: 10,
        };
        assert!(validate_bounded_rect(&rect, 20, 20).is_ok());
        assert!(validate_bounded_rect(&rect, 10, 20).is_err());
        let overflowing = PixelRectRaw {
            x: u32::MAX,
            y: 0,
            width: 10,
            height: 10,
        };
        assert!(validate_bounded_rect(&overflowing, u32::MAX, u32::MAX).is_err());
        let zero = PixelRectRaw {
            x: 0,
            y: 0,
            width: 0,
            height: 10,
        };
        assert!(validate_bounded_rect(&zero, 20, 20).is_err());
    }

    #[test]
    fn validate_positive_rect_allows_render_rect_beyond_output_bounds() {
        // renderRect may extend past the declared output via overscan (6.2E) —
        // only positivity/overflow is this story's concern.
        let rect = PixelRectRaw {
            x: 900,
            y: 900,
            width: 500,
            height: 500,
        };
        assert!(validate_positive_rect(&rect).is_ok());
    }

    #[test]
    fn validate_rect_contained_rejects_useful_rect_escaping_render_rect() {
        let render = PixelRectRaw {
            x: 0,
            y: 0,
            width: 30,
            height: 30,
        };
        let contained = PixelRectRaw {
            x: 5,
            y: 5,
            width: 20,
            height: 20,
        };
        assert!(validate_rect_contained(&contained, &render).is_ok());

        let escaping = PixelRectRaw {
            x: 20,
            y: 20,
            width: 20,
            height: 20,
        };
        assert!(validate_rect_contained(&escaping, &render).is_err());

        let before_origin = PixelRectRaw {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
        };
        let render_offset = PixelRectRaw {
            x: 5,
            y: 5,
            width: 10,
            height: 10,
        };
        assert!(validate_rect_contained(&before_origin, &render_offset).is_err());
    }

    #[test]
    fn fail_closed_consumer_never_confirms_finish() {
        let mut consumer = FailClosedConsumer;
        let tile = AcceptedTile {
            tile_x: 0,
            tile_y: 0,
            useful_rect: PixelRectRaw {
                x: 0,
                y: 0,
                width: 10,
                height: 10,
            },
            render_rect: PixelRectRaw {
                x: 0,
                y: 0,
                width: 10,
                height: 10,
            },
            encoded_len: 10,
        };
        assert!(consumer.accept(&tile).is_ok());
        assert!(consumer.finish().is_err());
    }
}
