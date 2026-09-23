//! Converts a `.cslmap` into a `.vellummap` with the reference converter, to
//! inspect the document format (`unzip -l`, `unzip -p out.vellummap manifest.json`).
//!
//! The file is read back with the strict `.vellummap` reader before exiting, so
//! a successful run also proves the output opens.
//!
//! # Usage
//!
//! ```bash
//! cargo run --release --example cslmap_to_vellummap --package parser-cslmap -- \
//!     fixtures/altavento.cslmap /tmp/altavento.vellummap
//! ```

use parser_cslmap::vellummap::{cslmap_to_vellummap, parse_vellummap_bytes};

fn main() {
    let mut args = std::env::args().skip(1);
    let (Some(input), Some(output)) = (args.next(), args.next()) else {
        eprintln!("usage: cslmap_to_vellummap <in.cslmap> <out.vellummap>");
        std::process::exit(2);
    };

    let cslmap = match std::fs::read(&input) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("read {input}: {e}");
            std::process::exit(1);
        }
    };

    let vellummap = match cslmap_to_vellummap(&cslmap) {
        Ok(bytes) => bytes,
        Err(e) => {
            eprintln!("convert {input}: {e}");
            std::process::exit(1);
        }
    };

    if let Err(e) = parse_vellummap_bytes(&vellummap) {
        eprintln!("the converted document does not open: {e}");
        std::process::exit(1);
    }

    if let Err(e) = std::fs::write(&output, &vellummap) {
        eprintln!("write {output}: {e}");
        std::process::exit(1);
    }

    #[allow(clippy::cast_precision_loss)]
    let ratio = vellummap.len() as f64 / cslmap.len() as f64 * 100.0;
    eprintln!(
        "{input} ({} bytes) → {output} ({} bytes, {ratio:.1} %)",
        cslmap.len(),
        vellummap.len()
    );
}
