mod builder;
mod events;
mod handlers;
mod terrain;
mod types;
mod utils;

#[cfg(test)]
mod tests;

use crate::city_data::CityData;
use crate::errors::VellumError;
use builder::CityDataBuilder;
use events::{ParseWarningsPayload, ProgressPayload};
use quick_xml::events::Event;
use quick_xml::Reader;
use tauri::Emitter;

// ─── Public API ───────────────────────────────────────────────────────────────

/// Reads a `.cslmap` file from disk, strips the UTF-8 BOM, emits Tauri progress
/// and parse-warnings events, and runs the XML parser.
///
/// When `allow_partial` is false (normal mode), recoverable section errors produce
/// `VellumError::PartialParse`. When true (lenient mode), those errors are swallowed
/// and the parser returns whatever data was successfully built.
///
/// # Errors
/// Returns `VellumError::IoError` if the file cannot be read.
/// Returns `VellumError::InvalidFile` for XML that is entirely unreadable or whose
/// root element is not `<CSLExportXML>`.
/// Returns `VellumError::UnsupportedVersion` when the root declares no `version` or
/// one of an unsupported major.
/// Returns `VellumError::PartialParse` for XML valid at root level but with damaged sections.
pub fn parse_cslmap_file(
    path: &str,
    app_handle: &tauri::AppHandle,
    allow_partial: bool,
) -> Result<CityData, VellumError> {
    let bytes = std::fs::read(path).map_err(|e| VellumError::IoError {
        reason: e.to_string(),
    })?;
    let content = strip_bom(&bytes);

    let mut observer = TauriObserver::new(app_handle);
    observer.emit_lifecycle("reading", 0.0);
    let result = run_parse_loop(content, allow_partial, &mut observer)?;
    observer.emit_lifecycle("done", 100.0);
    Ok(result)
}

/// Pure parsing function (no `AppHandle`): used directly by unit tests.
///
/// # Errors
/// Returns `VellumError::InvalidFile` for completely unreadable XML or a foreign root.
/// Returns `VellumError::UnsupportedVersion` for an absent or unsupported root `version`.
/// Returns `VellumError::PartialParse` for XML valid at root but with damaged sections.
pub fn parse_cslmap_bytes(content: &[u8]) -> Result<CityData, VellumError> {
    run_parse_loop(strip_bom(content), false, &mut NoopObserver)
}

/// Lenient variant of `parse_cslmap_bytes` for testing partial-parse mode.
/// Swallows recoverable section errors and returns whatever data was built.
///
/// # Errors
/// Returns `VellumError::InvalidFile` if the root element is missing, foreign, or the
/// XML is fatally malformed, and `VellumError::UnsupportedVersion` for an absent or
/// unsupported root `version` — the root gate ignores lenient mode.
pub fn parse_cslmap_bytes_lenient(content: &[u8]) -> Result<CityData, VellumError> {
    run_parse_loop(strip_bom(content), true, &mut NoopObserver)
}

// ─── BOM stripping ────────────────────────────────────────────────────────────

/// Strips the UTF-8 BOM (EF BB BF) present in real `.cslmap` files (Gotcha 3).
fn strip_bom(bytes: &[u8]) -> &[u8] {
    bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes)
}

// ─── Root gate ────────────────────────────────────────────────────────────────

/// The only root element a `.cslmap` may declare.
const ROOT_ELEMENT: &[u8] = b"CSLExportXML";

/// The only exporter major version this parser understands. Any minor of the
/// same major is accepted (`"4"`, `"4.1"`, `"4.9"`) — every known fixture
/// declares `4.1`, and rejecting future minors of the same exporter would turn
/// the gate into a source of false negatives.
const SUPPORTED_MAJOR: &str = "4";

/// Validates the first element of the document: it must be `<CSLExportXML>` and
/// declare a supported `version`.
///
/// A missing `version` attribute is reported as `UnsupportedVersion { found: "" }`
/// — the empty string is a value the shared enum already admits, so the UI can
/// distinguish it without a new variant crossing the IPC boundary.
///
/// # Errors
/// Returns `VellumError::InvalidFile` when the root is not `CSLExportXML`, and
/// `VellumError::UnsupportedVersion` when the declared version is absent or of a
/// different major.
fn gate_root(e: &quick_xml::events::BytesStart<'_>) -> Result<(), VellumError> {
    // The qualified name, not the local one: a document from a foreign schema
    // that happens to use the local name (`<x:CSLExportXML>`) is not a `.cslmap`,
    // and every real export declares the root unprefixed.
    let name = e.name();
    if name.as_ref() != ROOT_ELEMENT {
        return Err(VellumError::InvalidFile {
            reason: format!(
                "expected root element <CSLExportXML>, found <{}>",
                String::from_utf8_lossy(name.as_ref())
            ),
        });
    }

    // A malformed attribute list is a broken file, not a missing version —
    // swallowing the error here would report it as `UnsupportedVersion`.
    let attribute = e
        .try_get_attribute("version")
        .map_err(|err| VellumError::InvalidFile {
            reason: format!("malformed attributes on <CSLExportXML>: {err}"),
        })?;

    // Trimmed so a padded value (`version=" 4.1 "`) is neither misread as an
    // unsupported major nor rendered as "unsupported version ( )" downstream.
    let found = attribute
        .map(|attr| {
            String::from_utf8_lossy(attr.value.as_ref())
                .trim()
                .to_owned()
        })
        .unwrap_or_default();

    // Compared on the first `.`-separated segment: no semver parsing, and an
    // absent attribute falls through here as the empty major.
    if found.split('.').next().unwrap_or("") != SUPPORTED_MAJOR {
        return Err(VellumError::UnsupportedVersion { found });
    }

    Ok(())
}

// ─── Observer ─────────────────────────────────────────────────────────────────

/// Receives parse events from `run_parse_loop`, decoupling the loop from Tauri.
trait ParseObserver {
    /// Called after each XML event with the current parse progress (0–100).
    fn on_progress(&mut self, pct: f32);
    /// Called once with accumulated DLC/parse warnings before the result is built.
    fn on_warnings(&mut self, warnings: &[String]);
}

// ─── TauriObserver ───────────────────────────────────────────────────────────

struct TauriObserver<'a> {
    app_handle: &'a tauri::AppHandle,
}

impl<'a> TauriObserver<'a> {
    fn new(app_handle: &'a tauri::AppHandle) -> Self {
        Self { app_handle }
    }

    fn emit_lifecycle(&self, step: &str, percent: f32) {
        if let Err(e) = self.app_handle.emit(
            "vellum://progress",
            ProgressPayload {
                current_step: step.to_string(),
                percent,
            },
        ) {
            eprintln!("[parser-cslmap] Failed to emit progress event: {e}");
        }
    }
}

impl ParseObserver for TauriObserver<'_> {
    fn on_progress(&mut self, pct: f32) {
        self.emit_lifecycle("parsing", pct);
    }

    fn on_warnings(&mut self, warnings: &[String]) {
        if warnings.is_empty() {
            return;
        }
        if let Err(e) = self.app_handle.emit(
            "vellum://parse-warnings",
            ParseWarningsPayload {
                warnings: warnings.to_vec(),
            },
        ) {
            eprintln!("[parser-cslmap] Failed to emit parse-warnings: {e}");
        }
    }
}

// ─── NoopObserver ─────────────────────────────────────────────────────────────

struct NoopObserver;

impl ParseObserver for NoopObserver {
    fn on_progress(&mut self, _pct: f32) {}
    fn on_warnings(&mut self, _warnings: &[String]) {}
}

// ─── Core parse loop ──────────────────────────────────────────────────────────

fn run_parse_loop<O: ParseObserver>(
    content: &[u8],
    allow_partial: bool,
    observer: &mut O,
) -> Result<CityData, VellumError> {
    let mut reader = Reader::from_reader(content);
    reader.config_mut().trim_text(true);

    let mut builder = CityDataBuilder::default();
    let mut buf = Vec::new();
    let mut has_parsed_root = false;
    let mut last_pct: i32 = -1;
    let total_len = content.len();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                if !has_parsed_root {
                    // Deliberately outside `handle_element_result`: the root gate
                    // is never softened by `allow_partial`.
                    gate_root(e)?;
                }
                has_parsed_root = true;
                handle_element_result(builder.handle_start(e), allow_partial)?;
            }
            Ok(Event::Empty(ref e)) => {
                if !has_parsed_root {
                    gate_root(e)?;
                }
                has_parsed_root = true;
                handle_element_result(builder.handle_empty(e), allow_partial)?;
            }
            Ok(Event::Text(ref e)) => {
                dispatch_text_event(e, &mut builder, &reader, allow_partial, has_parsed_root)?;
            }
            Ok(Event::End(ref e)) => builder.handle_end(e),
            Ok(Event::Eof) => break,
            Err(ref e) => {
                let msg = format_xml_error(&reader, e);
                if allow_partial {
                    eprintln!("[parser-cslmap] Partial: stopping early — {msg}");
                    break;
                } else if has_parsed_root {
                    return Err(VellumError::PartialParse {
                        warnings: vec![msg],
                    });
                }
                return Err(VellumError::InvalidFile { reason: msg });
            }
            _ => {}
        }
        buf.clear();
        tick_progress(&reader, total_len, &mut last_pct, observer);
    }

    // Covers both loop exits (EOF and the lenient early break): a document that
    // never produced an element never went through `gate_root`, so it must not
    // reach `build()` — that is exactly the path that used to yield a plausible
    // but empty map. Independent of `allow_partial`.
    if !has_parsed_root {
        return Err(VellumError::InvalidFile {
            reason: "no XML elements found — expected a <CSLExportXML> root".to_string(),
        });
    }

    observer.on_warnings(builder.warnings());
    builder.build()
}

// ─── Loop-level helpers ───────────────────────────────────────────────────────

/// Translates a builder result into a loop-level control-flow decision.
fn handle_element_result(
    result: Result<(), VellumError>,
    allow_partial: bool,
) -> Result<(), VellumError> {
    match result {
        Ok(()) => Ok(()),
        Err(err) if allow_partial => {
            eprintln!("[parser-cslmap] Partial: element error: {err}");
            Ok(())
        }
        Err(err) => Err(VellumError::PartialParse {
            warnings: vec![err.to_string()],
        }),
    }
}

/// Decodes a text event and forwards the content to the builder.
fn dispatch_text_event(
    e: &quick_xml::events::BytesText<'_>,
    builder: &mut CityDataBuilder,
    reader: &Reader<&[u8]>,
    allow_partial: bool,
    has_parsed_root: bool,
) -> Result<(), VellumError> {
    let unescaped: Result<String, quick_xml::Error> =
        e.decode().map_err(quick_xml::Error::from).and_then(|s| {
            quick_xml::escape::unescape(&s)
                .map(std::borrow::Cow::into_owned)
                .map_err(quick_xml::Error::from)
        });
    match unescaped {
        Ok(text) => {
            builder.handle_text(&text);
            Ok(())
        }
        Err(err) => {
            let msg = format_xml_error(reader, &err);
            if allow_partial {
                eprintln!("[parser-cslmap] Partial: {msg}");
                Ok(())
            } else if has_parsed_root {
                Err(VellumError::PartialParse {
                    warnings: vec![msg],
                })
            } else {
                Err(VellumError::InvalidFile { reason: msg })
            }
        }
    }
}

/// Formats an XML error with its byte position for diagnostics.
fn format_xml_error(reader: &Reader<&[u8]>, err: &impl std::fmt::Display) -> String {
    format!("XML error at position {}: {err}", reader.buffer_position())
}

/// Emits a progress tick when the percentage has advanced by at least one point.
fn tick_progress<O: ParseObserver>(
    reader: &Reader<&[u8]>,
    total_len: usize,
    last_pct: &mut i32,
    observer: &mut O,
) {
    if total_len == 0 {
        return;
    }
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
    let pct = (reader.buffer_position() as f64 / total_len as f64 * 100.0) as i32;
    if pct > *last_pct {
        *last_pct = pct;
        #[allow(clippy::cast_precision_loss)]
        observer.on_progress(pct as f32);
    }
}
