//! Transactional tiled-export session boundary (story 6.2C).
//!
//! Legacy `export_png` is untouched and remains the only active/default route —
//! this module exists so the tiled exporters landing in 6.2D–6.2F have a
//! session, framing, and IPC surface to target.
pub mod framing;
pub mod session;
