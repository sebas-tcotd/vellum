use super::grid::{ELEVATION_UNITS_PER_METER, TERRAIN_GRID_SIZE};
use crate::city_data::TerrainDem;
use crate::errors::VellumError;
use std::io::Cursor;

// ─── Terrain DEM ─────────────────────────────────────────────────────────────

/// Widest value the 16-bit R/G packing can hold.
const MAX_PACKED_ELEVATION: f64 = 65535.0;

/// Elevation extremes of the dry-land cells, in raw game units.
struct LandExtent {
    min_raw: f64,
    max_raw: f64,
}

/// Bakes the elevation grid into a PNG for a `MapLibre` `raster-dem` source.
///
/// # Encoding
/// Raw elevations are packed losslessly as `R = raw >> 8`, `G = raw & 0xFF`, `B = 0`.
/// `MapLibre` decodes a `custom`-encoded DEM as
/// `height = R·redFactor + G·greenFactor + B·blueFactor − baseShift`
/// (verified in `maplibre-gl` 5.24, `DEMData.unpack`), so the renderer configures
/// `redFactor = 256` and `greenFactor = 1`, leaving the value in raw game units — the
/// same unit `TerrainIsoline::elevation` uses. See `DEM_ENCODING` in the renderer for
/// why the documented metre-scaling factors are not used.
///
/// # Water
/// Water cells (`res > sea_level` — the same classifier `vectorizer` uses) are clamped
/// to the lowest land elevation so the hillshade sees a flat sea floor instead of a
/// cliff at every coastline. They are hidden at render time by the sea-mask fill layer,
/// **not** by this encoding: land and water elevation ranges overlap in real maps
/// (measured on `altavento`: land 146.8…633.1 m vs. water 25.0…215.7 m, 69 m of
/// overlap), so no elevation threshold can separate them.
///
/// # Errors
/// Returns `VellumError::ExportFailed` if PNG encoding fails (should not happen in practice).
pub fn generate_terrain_dem(
    elev_grid: &[f64],
    res_grid: &[f64],
    sea_level: f64,
) -> Result<TerrainDem, VellumError> {
    let extent = land_extent(elev_grid, res_grid, sea_level);
    let data_uri = encode_dem_png(elev_grid, res_grid, sea_level, extent.min_raw)?;

    Ok(TerrainDem {
        data_uri,
        elev_min: extent.min_raw,
        elev_max: extent.max_raw,
    })
}

/// Scans the grid for the lowest and highest dry-land elevations.
///
/// Falls back to a unit-wide range for a fully submerged map so the ramp never
/// degenerates to a zero-width domain.
fn land_extent(elev_grid: &[f64], res_grid: &[f64], sea_level: f64) -> LandExtent {
    let mut min_raw = f64::INFINITY;
    let mut max_raw = f64::NEG_INFINITY;

    for (&elev, &res) in elev_grid.iter().zip(res_grid.iter()) {
        if res > sea_level {
            continue;
        }
        min_raw = min_raw.min(elev);
        max_raw = max_raw.max(elev);
    }

    if !min_raw.is_finite() || max_raw <= min_raw {
        min_raw = 0.0;
        max_raw = ELEVATION_UNITS_PER_METER;
    }

    LandExtent { min_raw, max_raw }
}

/// Writes one RGBA pixel per grid cell, flipping the Y axis so image row 0 is north.
fn encode_dem_png(
    elev_grid: &[f64],
    res_grid: &[f64],
    sea_level: f64,
    water_floor_raw: f64,
) -> Result<String, VellumError> {
    use image::{ImageBuffer, Rgba, RgbaImage};

    #[allow(clippy::cast_possible_truncation)]
    const GRID: u32 = TERRAIN_GRID_SIZE as u32;

    let mut img: RgbaImage = ImageBuffer::new(GRID, GRID);

    for (i, (&elev, &res)) in elev_grid.iter().zip(res_grid.iter()).enumerate() {
        #[allow(clippy::cast_possible_truncation)]
        let idx = i as u32;
        let raw = if res > sea_level {
            water_floor_raw
        } else {
            elev
        };
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let packed = raw.clamp(0.0, MAX_PACKED_ELEVATION) as u32;
        let pixel = Rgba([
            #[allow(clippy::cast_possible_truncation)]
            ((packed >> 8) as u8),
            #[allow(clippy::cast_possible_truncation)]
            ((packed & 0xFF) as u8),
            0,
            255,
        ]);
        img.put_pixel(idx % GRID, GRID - 1 - (idx / GRID), pixel);
    }

    encode_png_data_uri(&img)
}

/// Encodes an RGBA buffer as a `data:image/png;base64,…` URL.
fn encode_png_data_uri(img: &image::RgbaImage) -> Result<String, VellumError> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use image::ImageOutputFormat;

    let mut buf = Cursor::new(Vec::new());
    img.write_to(&mut buf, ImageOutputFormat::Png)
        .map_err(|e| VellumError::ExportFailed {
            reason: format!("terrain DEM encode failed: {e}"),
        })?;

    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(buf.into_inner())
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The R/G packing must round-trip exactly through `MapLibre`'s decode
    /// `height = R·(256/64) + G·(1/64)`, for every elevation the format can hold.
    ///
    /// 1600 and 40517 are the measured extremes of `altavento.cslmap`.
    #[test]
    fn packing_round_trips_to_metres() {
        for raw in [0_u32, 1600, 13590, 40517, 65535] {
            let decoded = f64::from(raw >> 8) * (256.0 / ELEVATION_UNITS_PER_METER)
                + f64::from(raw & 0xFF) / ELEVATION_UNITS_PER_METER;
            let expected = f64::from(raw) / ELEVATION_UNITS_PER_METER;
            assert!(
                (decoded - expected).abs() < 1e-9,
                "raw {raw}: decoded {decoded} != {expected}"
            );
        }
    }

    #[test]
    fn land_extent_ignores_water_cells_and_reports_metres() {
        // Two land cells (res = 0) at 6400 and 12800 raw = 100 m and 200 m,
        // plus a water cell at 1600 raw that must not widen the ramp domain.
        let elev = [6400.0, 12800.0, 1600.0];
        let res = [0.0, 0.0, 500.0];
        let extent = land_extent(&elev, &res, 187.031);
        assert!((extent.min_raw - 6400.0).abs() < 1e-9);
        assert!((extent.max_raw - 12800.0).abs() < 1e-9);
        // 6400 raw / 64 = 100 m, 12800 raw / 64 = 200 m.
        assert!((extent.max_raw / ELEVATION_UNITS_PER_METER - 200.0).abs() < 1e-9);
    }

    #[test]
    fn land_extent_falls_back_when_fully_submerged() {
        let extent = land_extent(&[1600.0], &[500.0], 187.031);
        assert!(
            extent.max_raw > extent.min_raw,
            "ramp domain must be non-empty"
        );
    }
}
