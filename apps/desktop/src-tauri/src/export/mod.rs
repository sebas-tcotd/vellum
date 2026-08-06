//! Transactional export session boundary (stories 6.2C and 6.3A).
//!
//! One versioned binary transport and one `begin → append → finish/cancel`
//! lifecycle serve both routes: `tiled-png` composites raster tiles, and
//! `streaming-svg` appends UTF-8 XML fragments. Legacy `export_png` is
//! untouched and remains available independently of either.
pub mod framing;
pub mod session;
pub mod svg_writer;
pub mod tile_composer;
